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

try:
    import dbus
    import gi
    gi.require_version("GLib", "2.0")
    from gi.repository import GLib
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio
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
    """Get screen dimensions via grim screenshot capture.

    grim output matches the actual Wayland coordinate space, unlike
    pyautogui.size() which returns single-monitor dimensions.
    """
    try:
        result = subprocess.run(
            ["grim", "-"],
            capture_output=True,
            check=True,
            timeout=10,
        )
        from PIL import Image
        from io import BytesIO
        img = Image.open(BytesIO(result.stdout))
        img.load()
        return (img.width, img.height)
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    import pyautogui
    return pyautogui.size()


class PortalBackend:
    """Input simulation via xdg-desktop-portal RemoteDesktop for Wayland.

    Session lifecycle:
      1. CreateSession → gets session handle
      2. SelectDevices(mouse+keyboard) → registers device types
      3. Start → triggers permission dialog, waits for user approval
      4. NotifyPointerMotionAbsolute/NotifyPointerButton/NotifyKeyboardKeycode

    The session is established lazily on first use and persists until
    the backend is discarded. Permission dialog appears once.
    """

    def __init__(self):
        self._session_handle = None
        self._bus = None
        self._portal_iface = None
        self._started = False

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

        # Step 1: CreateSession
        request_path = self._portal_iface.CreateSession(
            dbus.Dictionary({}, signature="sv")
        )
        self._session_handle = self._wait_for_create_session(request_path)

        # Step 2: SelectDevices — request keyboard (1) and pointer (2)
        self._portal_iface.SelectDevices(
            self._session_handle,
            dbus.Dictionary({"devices": dbus.UInt32(1 | 2)}, signature="sv"),
        )
        self._wait_for_request("SelectDevices")

        # Step 3: Start — triggers permission dialog
        self._portal_iface.Start(
            self._session_handle,
            "",
            dbus.Dictionary({}, signature="sv"),
        )
        self._wait_for_request("Start")

        self._started = True
        print("Portal RemoteDesktop session established successfully")

    def _wait_for_create_session(self, request_path: str) -> str:
        """Wait for CreateSession Response signal and extract session_handle."""
        loop = GLib.MainLoop()
        result = {"handle": None, "response": None}

        def on_response(connection, sender, path, iface, signal, params):
            response_code, results_dict = params.unpack()
            result["response"] = response_code
            if response_code == 0:
                handle = str(results_dict.get("session_handle", ""))
                result["handle"] = handle
            loop.quit()

        gio_bus = Gio.bus_get_sync(Gio.BusType.SESSION)
        gio_bus.signal_subscribe(
            None,
            "org.freedesktop.portal.Request",
            "Response",
            request_path,
            None,
            Gio.DBusSignalFlags.NONE,
            on_response,
            None,
        )

        GLib.timeout_add_seconds(30, lambda: loop.quit())
        loop.run()

        if result["response"] != 0:
            raise RuntimeError(f"CreateSession denied: response={result['response']}")
        if not result["handle"]:
            raise RuntimeError("CreateSession succeeded but no session_handle returned")
        return result["handle"]

    def _wait_for_request(self, label: str):
        """Wait for a portal Request Response signal (no data to extract)."""
        loop = GLib.MainLoop()
        response_val = [None]

        def on_response(connection, sender, path, iface, signal, params):
            response_code, _ = params.unpack()
            response_val[0] = response_code
            loop.quit()

        gio_bus = Gio.bus_get_sync(Gio.BusType.SESSION)
        gio_bus.signal_subscribe(
            None,
            "org.freedesktop.portal.Request",
            "Response",
            None,
            None,
            Gio.DBusSignalFlags.NONE,
            on_response,
            None,
        )

        GLib.timeout_add_seconds(30, lambda: loop.quit())
        loop.run()

        if response_val[0] is None:
            raise RuntimeError(f"Portal {label} timed out (30s)")
        if response_val[0] != 0:
            raise RuntimeError(f"Portal {label} denied: response={response_val[0]}")

    def _notify_pointer_motion_absolute(self, x: int, y: int):
        self._portal_iface.NotifyPointerMotionAbsolute(
            self._session_handle,
            dbus.Dictionary({}, signature="sv"),
            dbus.UInt32(0),  # stream id
            dbus.Double(x),
            dbus.Double(y),
        )

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
