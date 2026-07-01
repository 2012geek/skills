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
    import dbus
    from dbus.mainloop.glib import DBusGMainLoop
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
        """Establish a RemoteDesktop session using a single GLib main loop.

        Pre-subscribes to all three request paths before calling any portal
        methods. This avoids the problem of add_signal_receiver not working
        inside GLib main loop callbacks. Then triggers CreateSession and
        uses state machine callbacks to drive SelectDevices and Start.
        """
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

        # Generate all tokens upfront
        session_token = self._make_token("session")
        create_ht = self._make_token("create")
        select_ht = self._make_token("select")
        start_ht = self._make_token("start")

        create_rp = self._make_request_path(create_ht)
        select_rp = self._make_request_path(select_ht)
        start_rp = self._make_request_path(start_ht)

        # State machine: tracks session handle and which phase we're in
        state = {"phase": 0, "session_handle": None, "error": None}

        def on_create(response_code, results_dict):
            if int(response_code) != 0:
                state["error"] = f"CreateSession denied: {int(response_code)}"
                loop.quit()
                return
            results = dict(results_dict)
            handle = results.get("session_handle", "")
            state["session_handle"] = str(handle) if isinstance(handle, dbus.String) else handle
            state["phase"] = 1
            print("  CreateSession OK")
            # Trigger SelectDevices — already subscribed
            self._portal_iface.SelectDevices(
                state["session_handle"],
                dbus.Dictionary({
                    "devices": dbus.UInt32(1 | 2 | 4),
                    "handle_token": dbus.String(select_ht),
                }, signature="sv"),
            )

        def on_select(response_code, results_dict):
            if int(response_code) != 0:
                state["error"] = f"SelectDevices denied: {int(response_code)}"
                loop.quit()
                return
            state["phase"] = 2
            print("  SelectDevices OK — permission dialog will appear, click Allow then Share")
            # Trigger Start — already subscribed
            self._portal_iface.Start(
                state["session_handle"],
                "",
                dbus.Dictionary({
                    "handle_token": dbus.String(start_ht),
                }, signature="sv"),
            )

        def on_start(response_code, results_dict):
            if int(response_code) != 0:
                state["error"] = f"Start denied: {int(response_code)}"
                loop.quit()
                return
            state["phase"] = 3
            print("  Start OK — session fully established")
            loop.quit()

        loop = GLib.MainLoop()

        # Pre-subscribe to ALL three request paths BEFORE any calls
        # This is critical — add_signal_receiver doesn't work inside loop callbacks
        self._bus.add_signal_receiver(
            on_create, signal_name="Response",
            dbus_interface="org.freedesktop.portal.Request", path=create_rp)
        self._bus.add_signal_receiver(
            on_select, signal_name="Response",
            dbus_interface="org.freedesktop.portal.Request", path=select_rp)
        self._bus.add_signal_receiver(
            on_start, signal_name="Response",
            dbus_interface="org.freedesktop.portal.Request", path=start_rp)

        # Trigger phase 0: CreateSession
        self._portal_iface.CreateSession(
            dbus.Dictionary({
                "session_handle_token": dbus.String(session_token),
                "handle_token": dbus.String(create_ht),
            }, signature="sv"),
        )

        # Timeout: 120s to allow time for permission dialog interaction
        GLib.timeout_add_seconds(120, lambda: loop.quit())
        loop.run()

        # Cleanup signal receivers
        for cb, rp in [(on_create, create_rp), (on_select, select_rp), (on_start, start_rp)]:
            try:
                self._bus.remove_signal_receiver(
                    cb, signal_name="Response",
                    dbus_interface="org.freedesktop.portal.Request", path=rp)
            except ValueError:
                pass

        # Check for errors
        if state["error"]:
            raise RuntimeError(state["error"])
        if state["phase"] < 3:
            raise RuntimeError(f"Portal session incomplete: phase={state['phase']}")

        self._session_handle = state["session_handle"]
        self._started = True
        PortalBackend._shared_session = {
            "session_handle": self._session_handle,
            "bus": self._bus,
            "portal_iface": self._portal_iface,
            "token_counter": self._token_counter,
            "last_x": self._last_x,
            "last_y": self._last_y,
        }
        print("Portal RemoteDesktop session established successfully")

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

    # evdev button codes (required by portal API, NOT X11 button numbers)
    BTN_LEFT = 272   # 0x110
    BTN_RIGHT = 273  # 0x111
    BTN_MIDDLE = 274 # 0x112

    def _notify_pointer_button(self, button: int, state: int):
        """Press or release a pointer button using evdev codes.

        button: evdev code (272=BTN_LEFT, 273=BTN_RIGHT, 274=BTN_MIDDLE)
        state: 1=press, 0=release
        """
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
        self._notify_pointer_button(self.BTN_LEFT, 1)  # BTN_LEFT press
        self._notify_pointer_button(self.BTN_LEFT, 0)  # BTN_LEFT release

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
