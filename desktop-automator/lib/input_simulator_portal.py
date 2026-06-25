"""xdg-desktop-portal RemoteDesktop input simulation backend for Wayland.

Uses the org.freedesktop.portal.RemoteDesktop D-Bus interface for native
Wayland input simulation. Requires:
  - dbus-python for D-Bus communication
  - gi (PyGObject) for GLib main loop for async signal handling
  - xdg-desktop-portal service running on the system

The first call triggers a permission dialog — user must approve once per
session. After approval, all subsequent calls work without prompts.
"""

import subprocess
import time
import uuid

try:
    from dbus.mainloop.glib import DBusGMainLoop
    DBusGMainLoop(set_as_default=True)
    import dbus
    import gi
    gi.require_version("GLib", "2.0")
    from gi.repository import GLib
    PORTAL_AVAILABLE = True
except ImportError:
    PORTAL_AVAILABLE = False


# X11 keycode mapping: key name → X11 keycode number (evdev layout)
X11_KEYCODE_MAP = {
    "esc": 1, "escape": 1,
    "1": 2, "2": 3, "3": 4, "4": 5, "5": 6,
    "6": 7, "7": 8, "8": 9, "9": 10, "0": 11,
    "minus": 12, "equal": 13,
    "backspace": 14, "tab": 15,
    "q": 16, "w": 17, "e": 18, "r": 19, "t": 20,
    "y": 21, "u": 22, "i": 23, "o": 24, "p": 25,
    "bracketleft": 26, "bracketright": 27, "enter": 28,
    "ctrl": 29, "control": 29, "control_l": 29,
    "a": 30, "s": 31, "d": 32, "f": 33, "g": 34,
    "h": 35, "j": 36, "k": 37, "l": 38,
    "semicolon": 39, "quote": 40,
    "shift": 42, "shift_l": 42,
    "z": 44, "x": 45, "c": 46, "v": 47, "b": 48,
    "n": 49, "m": 50,
    "comma": 51, "period": 52, "slash": 53,
    "alt": 56, "alt_l": 56,
    "space": 57, "capslock": 58,
    "f1": 59, "f2": 60, "f3": 61, "f4": 62,
    "f5": 63, "f6": 64, "f7": 65, "f8": 66,
    "f9": 67, "f10": 68, "f11": 87, "f12": 88,
    "numlock": 69, "scrolllock": 70,
    "home": 110, "up": 111, "pageup": 112,
    "left": 113, "right": 114,
    "end": 115, "down": 116, "pagedown": 117,
    "insert": 118, "delete": 119,
    "ctrl_r": 105, "shift_r": 54, "alt_r": 100,
    "backslash": 43,
    "grave": 15, "apostrophe": 40,
    "win": 125, "super": 125, "super_l": 125,
    "menu": 135,
}


def _get_keycode(key_name: str) -> int:
    """Convert a pyautogui-style key name to an X11 keycode."""
    lower = key_name.lower().replace(" ", "")
    if lower in X11_KEYCODE_MAP:
        return X11_KEYCODE_MAP[lower]
    if len(key_name) == 1 and key_name.isalpha():
        return X11_KEYCODE_MAP.get(key_name.lower(), 0)
    return 0


def _get_screen_size_via_grim():
    """Get screen dimensions via grim/gnome-screenshot capture.

    These tools capture the full Wayland coordinate space, unlike
    pyautogui.size() which returns single-monitor dimensions.
    """
    import os
    import shutil
    import tempfile
    from io import BytesIO
    from PIL import Image

    # Try grim (wlroots compositors: Sway, Hyprland)
    if shutil.which("grim"):
        try:
            result = subprocess.run(
                ["grim", "-"],
                capture_output=True,
                check=True,
                timeout=10,
            )
            img = Image.open(BytesIO(result.stdout))
            img.load()
            return (img.width, img.height)
        except (subprocess.CalledProcessError, FileNotFoundError, OSError):
            pass

    # Try gnome-screenshot (GNOME/Mutter)
    if shutil.which("gnome-screenshot"):
        clean_env = {
            "HOME": os.environ.get("HOME", ""),
            "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", ""),
            "WAYLAND_DISPLAY": os.environ.get("WAYLAND_DISPLAY", ""),
            "DISPLAY": os.environ.get("DISPLAY", ""),
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "XDG_SESSION_TYPE": os.environ.get("XDG_SESSION_TYPE", ""),
            "XDG_CURRENT_DESKTOP": os.environ.get("XDG_CURRENT_DESKTOP", ""),
            "USER": os.environ.get("USER", ""),
            "LANG": os.environ.get("LANG", ""),
            "DBUS_SESSION_BUS_ADDRESS": os.environ.get("DBUS_SESSION_BUS_ADDRESS", ""),
        }
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            result = subprocess.run(
                ["gnome-screenshot", "-f", tmp_path],
                env=clean_env,
                capture_output=True,
                timeout=10,
            )
            if result.returncode == 0:
                img = Image.open(tmp_path)
                img.load()
                return (img.width, img.height)
        except (subprocess.CalledProcessError, RuntimeError, OSError):
            pass
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    import pyautogui
    return pyautogui.size()


class PortalBackend:
    """Input simulation via xdg-desktop-portal RemoteDesktop for Wayland.

    Session lifecycle:
      1. CreateSession → gets session handle
      2. SelectDevices(mouse+keyboard) → registers device types
      3. Start → triggers permission dialog, waits for user approval
      4. NotifyPointerMotionAbsolute/NotifyPointerButton/NotifyKeyboardKeycode

    Singleton pattern: only one session per process. Subsequent PortalBackend
    instances reuse the existing session. Permission dialog appears once.
    """

    _shared_session = None  # Singleton session state

    def __init__(self):
        # Reuse shared session if already established
        if PortalBackend._shared_session is not None:
            self._session_handle = PortalBackend._shared_session["session_handle"]
            self._bus = PortalBackend._shared_session["bus"]
            self._portal_iface = PortalBackend._shared_session["portal_iface"]
            self._started = True
            self._token_counter = PortalBackend._shared_session["token_counter"]
            self._last_x = PortalBackend._shared_session.get("last_x", 0)
            self._last_y = PortalBackend._shared_session.get("last_y", 0)
        else:
            self._session_handle = None
            self._bus = None
            self._portal_iface = None
            self._started = False
            self._token_counter = 0
            self._last_x = 0  # Track assumed cursor position for relative motion
            self._last_y = 0

    def _make_token(self, prefix="desktop_automator"):
        """Generate a unique token for portal request/session handles."""
        self._token_counter += 1
        uid = str(uuid.uuid4()).replace("-", "_")
        return f"{prefix}_{self._token_counter}_{uid}"

    def _sender_name(self):
        """Get the unique D-Bus bus name for this connection."""
        return self._bus.get_unique_name()[1:].replace(".", "_")

    def _make_request_path(self, handle_token):
        """Construct the expected request object path from handle_token."""
        return f"/org/freedesktop/portal/desktop/request/{self._sender_name()}/{handle_token}"

    def _make_session_path(self, session_token):
        """Construct the expected session object path from session_token."""
        return f"/org/freedesktop/portal/desktop/session/{self._sender_name()}/{session_token}"

    def _ensure_session(self):
        """Establish a RemoteDesktop session if not already active."""
        if self._started:
            return

        if not PORTAL_AVAILABLE:
            raise RuntimeError(
                "dbus-python and PyGObject required for Wayland input simulation. "
                "Install: pip install dbus-python PyGObject"
            )

        self._bus = dbus.SessionBus()
        portal_obj = self._bus.get_object(
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
        )
        self._portal_iface = dbus.Interface(
            portal_obj, "org.freedesktop.portal.RemoteDesktop"
        )

        # Step 1: CreateSession with tokens
        session_token = self._make_token("session")
        handle_token = self._make_token("create")
        request_path = self._make_request_path(handle_token)

        options = dbus.Dictionary({
            "session_handle_token": dbus.String(session_token),
            "handle_token": dbus.String(handle_token),
        }, signature="sv")

        self._portal_iface.CreateSession(options)
        create_results = self._wait_for_response(request_path, "CreateSession")

        # Extract session_handle from CreateSession results
        session_handle = create_results.get("session_handle", "")
        if not session_handle:
            raise RuntimeError("CreateSession succeeded but no session_handle returned")
        if isinstance(session_handle, dbus.String):
            session_handle = str(session_handle)
        self._session_handle = session_handle

        # Step 2: SelectDevices — request keyboard (1) and pointer (2)
        select_handle_token = self._make_token("select")
        select_request_path = self._make_request_path(select_handle_token)
        select_options = dbus.Dictionary({
            "devices": dbus.UInt32(1 | 2),  # 1=keyboard, 2=pointer
            "handle_token": dbus.String(select_handle_token),
        }, signature="sv")

        self._portal_iface.SelectDevices(session_handle, select_options)
        self._wait_for_response(select_request_path, "SelectDevices")

        # Step 3: Start — triggers permission dialog
        start_handle_token = self._make_token("start")
        start_request_path = self._make_request_path(start_handle_token)
        start_options = dbus.Dictionary({
            "handle_token": dbus.String(start_handle_token),
        }, signature="sv")

        self._portal_iface.Start(session_handle, "", start_options)
        start_results = self._wait_for_response(start_request_path, "Start")

        self._started = True
        # Save to singleton so subsequent instances reuse this session
        PortalBackend._shared_session = {
            "session_handle": self._session_handle,
            "bus": self._bus,
            "portal_iface": self._portal_iface,
            "token_counter": self._token_counter,
            "last_x": self._last_x,
            "last_y": self._last_y,
        }
        print("Portal RemoteDesktop session established successfully")

    def _wait_for_response(self, request_path: str, label: str):
        """Wait for a portal Request Response signal on a specific path.

        Uses dbus-python signal subscription on the SAME bus connection
        that made the method call, with GLib main loop for delivery.

        Returns the session_handle string for CreateSession, None for others.
        """
        loop = GLib.MainLoop()
        result_data = {"response": None, "results": None, "timed_out": False}

        def on_response(*args):
            # dbus-python signal callback: (response_code, results_dict)
            response_code = int(args[0])
            results_dict = args[1] if len(args) > 1 else {}
            result_data["response"] = response_code
            result_data["results"] = results_dict
            loop.quit()

        def on_timeout():
            result_data["timed_out"] = True
            loop.quit()
            return False

        # Subscribe to Response signal on the Request object path
        # Using dbus-python's add_signal_receiver on the SAME bus
        self._bus.add_signal_receiver(
            on_response,
            signal_name="Response",
            dbus_interface="org.freedesktop.portal.Request",
            path=request_path,
        )

        GLib.timeout_add_seconds(30, on_timeout)
        loop.run()

        # Remove signal receiver after done
        self._bus.remove_signal_receiver(
            on_response,
            signal_name="Response",
            dbus_interface="org.freedesktop.portal.Request",
            path=request_path,
        )

        if result_data["timed_out"]:
            raise RuntimeError(f"Portal {label} timed out (30s)")
        if result_data["response"] is None:
            raise RuntimeError(f"Portal {label} received no response")
        if result_data["response"] != 0:
            raise RuntimeError(f"Portal {label} denied: response={result_data['response']}")

        # Return results dict for caller to extract needed fields
        return result_data.get("results") or {}

    def _notify_pointer_motion_absolute(self, x: int, y: int):
        """Move pointer to absolute screen coordinates using relative motion.

        NotifyPointerMotionAbsolute fails with "Invalid position" on some
        compositors, so we use NotifyPointerMotion (relative) instead.
        We track the assumed cursor position and compute deltas.
        """
        # Use relative motion: compute delta from last known position
        dx = x - self._last_x
        dy = y - self._last_y
        self._portal_iface.NotifyPointerMotion(
            self._session_handle,
            dbus.Dictionary({}, signature="sv"),
            dbus.Double(dx),
            dbus.Double(dy),
        )
        self._last_x = x
        self._last_y = y

    def _notify_pointer_button(self, button: int, state: int):
        """button: 0=left, 1=middle, 2=right. state: 0=release, 1=press."""
        self._portal_iface.NotifyPointerButton(
            self._session_handle,
            dbus.Dictionary({}, signature="sv"),
            dbus.Int32(button),
            dbus.Int32(state),
        )

    def _notify_keyboard_keycode(self, keycode: int, state: int):
        """state: 0=release, 1=press."""
        self._portal_iface.NotifyKeyboardKeycode(
            self._session_handle,
            dbus.Dictionary({}, signature="sv"),
            dbus.Int32(keycode),
            dbus.Int32(state),
        )

    def _notify_keyboard_keysym(self, keysym: int, state: int):
        """state: 0=release, 1=press."""
        self._portal_iface.NotifyKeyboardKeysym(
            self._session_handle,
            dbus.Dictionary({}, signature="sv"),
            dbus.Int32(keysym),
            dbus.Int32(state),
        )

    # --- InputSimulator protocol methods ---

    def click(self, x: int, y: int) -> None:
        """Click at screen coordinates: move → press → release."""
        self._ensure_session()
        self._notify_pointer_motion_absolute(x, y)
        self._notify_pointer_button(0, 1)  # BTN_LEFT press
        self._notify_pointer_button(0, 0)  # BTN_LEFT release

    def type_text(self, text: str, interval: float = 0.05) -> None:
        """Type text character by character with optional interval."""
        self._ensure_session()
        for char in text:
            keycode = _get_keycode(char)
            if keycode > 0:
                self._notify_keyboard_keycode(keycode, 1)
                self._notify_keyboard_keycode(keycode, 0)
            else:
                # Keysym fallback: Unicode codepoint + 0x01000000
                keysym = 0x01000000 + ord(char)
                self._notify_keyboard_keysym(keysym, 1)
                self._notify_keyboard_keysym(keysym, 0)
            if interval > 0:
                time.sleep(interval)

    def press_key(self, key: str) -> None:
        """Press and release a single key."""
        self._ensure_session()
        keycode = _get_keycode(key)
        if keycode > 0:
            self._notify_keyboard_keycode(keycode, 1)
            self._notify_keyboard_keycode(keycode, 0)
        elif len(key) == 1:
            keysym = 0x01000000 + ord(key)
            self._notify_keyboard_keysym(keysym, 1)
            self._notify_keyboard_keysym(keysym, 0)
        else:
            print(f"Warning: unknown key '{key}', skipping")

    def key_down(self, key: str) -> None:
        """Hold a key down."""
        self._ensure_session()
        keycode = _get_keycode(key)
        if keycode > 0:
            self._notify_keyboard_keycode(keycode, 1)
        else:
            print(f"Warning: unknown key '{key}' for key_down, skipping")

    def key_up(self, key: str) -> None:
        """Release a held key."""
        self._ensure_session()
        keycode = _get_keycode(key)
        if keycode > 0:
            self._notify_keyboard_keycode(keycode, 0)
        else:
            print(f"Warning: unknown key '{key}' for key_up, skipping")

    def get_screen_size(self) -> tuple[int, int]:
        """Return screen dimensions via grim (matches Wayland coordinate space)."""
        return _get_screen_size_via_grim()
