"""Pure-Python input device listener using ctypes/struct to read /dev/input/eventX.

Works on Wayland where pynput is deaf (X11 global hooks blocked by GNOME).
Uses kernel-level input events via /dev/input/eventX character devices.

Requires: user in 'input' group or udev rule granting read access to /dev/input/eventX.

Linux input_event struct layout (64-bit kernel, <linux/input.h>):
  struct input_event {
      struct timeval time;  // 8+8 = 16 bytes (sec + usec, both long=8 on 64-bit)
      unsigned short type;  // 2 bytes
      unsigned short code;  // 2 bytes
      unsigned int value;   // 4 bytes  (signed in kernel, but stored as u32)
  };                       // Total: 24 bytes

Event types (EV_*):
  EV_KEY  = 0x01  (key/button press/release)
  EV_REL  = 0x02  (relative movement: mouse dx/dy)
  EV_ABS  = 0x03  (absolute: touchpad position)
  EV_SYN  = 0x00  (sync marker, end of event packet)
"""

import os
import select
import struct
import threading

# input_event struct: timeval(sec:long, usec:long) + type:u16 + code:u16 + value:u32
# On 64-bit Linux: long = 8 bytes, total = 24 bytes
INPUT_EVENT_SIZE = 24
INPUT_EVENT_FORMAT = "qqHHI"

# Event types
EV_KEY = 0x01
EV_REL = 0x02
EV_ABS = 0x03
EV_SYN = 0x00

# Relative axes
REL_X = 0x00
REL_Y = 0x01
REL_WHEEL = 0x08

# Key/button values
KEY_PRESS = 1
KEY_RELEASE = 0
KEY_REPEAT = 2

# BTN_MOUSE codes
BTN_LEFT = 0x110
BTN_RIGHT = 0x111
BTN_MIDDLE = 0x112

# Modifier key codes
MODIFIER_KEY_CODES = frozenset({
    42, 54,   # left/right shift
    29, 97,   # left/right ctrl
    56, 100,  # left/right alt
    125, 126, # left/right super (win/cmd)
})

# Special key codes -> name mapping
SPECIAL_KEY_MAP = {
    1: "esc",
    28: "enter",
    15: "tab",
    14: "backspace",
    57: "space",
    58: "caps_lock",
    59: "f1", 60: "f2", 61: "f3", 62: "f4",
    63: "f5", 64: "f6", 65: "f7", 66: "f8",
    67: "f9", 68: "f10", 69: "f11", 70: "f12",
    103: "up", 108: "down", 105: "left", 106: "right",
    110: "home", 115: "end",
    111: "page_up", 112: "page_down",
    119: "insert", 120: "delete",
    42: "shift_l", 54: "shift_r",
    29: "ctrl_l", 97: "ctrl_r",
    56: "alt_l", 100: "alt_r",
    125: "super_l", 126: "super_r",
}

PRINTABLE_KEY_CODES = {
    2: "1", 3: "2", 4: "3", 5: "4", 6: "5",
    7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
    12: "-", 13: "=",
    16: "q", 17: "w", 18: "e", 19: "r", 20: "t",
    21: "y", 22: "u", 23: "i", 24: "o", 25: "p",
    26: "[", 27: "]",
    30: "a", 31: "s", 32: "d", 33: "f", 34: "g",
    35: "h", 36: "j", 37: "k", 38: "l",
    39: ";", 40: "'",
    43: "z", 44: "x", 45: "c", 46: "v", 47: "b",
    48: "n", 49: "m",
    50: ",", 51: ".", 52: "/",
}


def _signed32(value):
    """Convert unsigned 32-bit value to signed (needed for REL_X/REL_Y)."""
    if value > 0x7FFFFFFF:
        return value - 0x100000000
    return value


def _discover_input_devices():
    """Discover keyboard and mouse event devices via /sys/class/input/.

    Returns dict with "mouse" and "keyboard" lists of /dev/input/eventX paths.
    Device classification is based on device name:
      - Name contains "mouse" -> mouse device (processes EV_REL + BTN_*)
      - Name contains "keyboard" or "key" -> keyboard device (processes EV_KEY)
      - Name contains both "mouse" and "keyboard" -> dual device
    """
    mice = []
    keyboards = []

    sys_class = "/sys/class/input"
    if not os.path.isdir(sys_class):
        return {"mouse": mice, "keyboard": keyboards}

    for entry in os.listdir(sys_class):
        if not entry.startswith("event"):
            continue

        name_path = os.path.join(sys_class, entry, "device", "name")
        try:
            with open(name_path) as f:
                name = f.read().strip()
        except (FileNotFoundError, OSError):
            continue

        name_lower = name.lower()
        if any(skip in name_lower for skip in ("hda", "alsa", "mic", "headphone", "line out", "hdmi")):
            continue
        if any(skip in name_lower for skip in ("power button", "sleep button", "video bus", "wmi hotkey")):
            continue

        is_mouse = "mouse" in name_lower
        is_keyboard = "keyboard" in name_lower or ("key" in name_lower and not is_mouse)

        path = os.path.join("/dev/input", entry)
        if is_mouse:
            mice.append(path)
        if is_keyboard:
            keyboards.append(path)

    return {"mouse": mice, "keyboard": keyboards}


def _find_readable_devices(device_paths):
    """Filter device_paths to those readable by current user."""
    readable = []
    for path in device_paths:
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            os.close(fd)
            readable.append(path)
        except OSError:
            continue
    return readable


def _key_code_to_name(code, shift_active=False):
    """Convert a Linux key code to a character or key name.

    Returns (char_or_name, is_printable, is_modifier).
    """
    if code in MODIFIER_KEY_CODES:
        name = SPECIAL_KEY_MAP.get(code, f"key{code}")
        return (name, False, True)

    if code in PRINTABLE_KEY_CODES:
        char = PRINTABLE_KEY_CODES[code]
        if shift_active:
            shift_map = {
                "1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
                "6": "^", "7": "&", "8": "*", "9": "(","0": ")",
                "-": "_", "=": "+",
                "[": "{", "]": "}",
                ";": ":", "'": "\"",
                ",": "<", ".": ">", "/": "?",
            }
            char = shift_map.get(char, char.upper() if len(char) == 1 else char)
        return (char, True, False)

    if code in SPECIAL_KEY_MAP:
        return (SPECIAL_KEY_MAP[code], False, False)

    return (f"key{code}", False, False)


class EvdevInputListener:
    """Input listener using /dev/input/eventX (works on Wayland).

    Reads kernel input events directly via struct.unpack, no external C deps.
    Tracks mouse position by accumulating relative movements from screen center.
    Only processes EV_REL (mouse movement) from mouse devices to avoid
    bogus movement events from keyboard devices with media keys.
    """

    def __init__(self, on_click=None, on_key_press=None, on_key_release=None):
        self.on_click = on_click
        self.on_key_press = on_key_press
        self.on_key_release = on_key_release

        self._running = False
        self._thread = None
        self._fds = {}  # fd -> device_path
        self._fd_is_mouse = {}  # fd -> True if device is a mouse
        self._modifiers = set()

        # Mouse position tracking: start at screen center
        try:
            import pyautogui
            size = pyautogui.size()
            self._screen_width = size[0]
            self._screen_height = size[1]
            self._mouse_x = size[0] // 2
            self._mouse_y = size[1] // 2
        except Exception:
            self._screen_width = 1920
            self._screen_height = 1080
            self._mouse_x = 960
            self._mouse_y = 540

    def start(self):
        """Open keyboard/mouse event devices and start listener thread."""
        devices = _discover_input_devices()
        mouse_paths = _find_readable_devices(devices["mouse"])
        keyboard_paths = _find_readable_devices(devices["keyboard"])
        all_paths = mouse_paths + keyboard_paths

        if not all_paths:
            raise RuntimeError(
                "No readable /dev/input/eventX devices found. "
                "Ensure user is in 'input' group or udev rule grants read access."
            )

        for path in mouse_paths:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            self._fds[fd] = path
            self._fd_is_mouse[fd] = True

        for path in keyboard_paths:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            self._fds[fd] = path
            self._fd_is_mouse[fd] = False

        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop listener and close all device file descriptors."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        for fd in list(self._fds.keys()):
            try:
                os.close(fd)
            except OSError:
                pass
        self._fds.clear()
        self._fd_is_mouse.clear()

    def is_alive(self):
        """Check if listener thread is running."""
        return self._thread is not None and self._thread.is_alive()

    def _listen_loop(self):
        """Main loop: select() on all open fds, parse input events."""
        fd_list = list(self._fds.keys())

        while self._running:
            try:
                readable, _, _ = select.select(fd_list, [], [], 0.5)
            except (OSError, ValueError):
                break

            for fd in readable:
                self._read_events(fd)

    def _read_events(self, fd):
        """Read and dispatch all available events from one device fd."""
        buf = b""
        while True:
            try:
                chunk = os.read(fd, INPUT_EVENT_SIZE * 64)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk

        is_mouse = self._fd_is_mouse.get(fd, False)

        while len(buf) >= INPUT_EVENT_SIZE:
            event_data = buf[:INPUT_EVENT_SIZE]
            buf = buf[INPUT_EVENT_SIZE:]

            sec, usec, ev_type, code, value = struct.unpack(INPUT_EVENT_FORMAT, event_data)

            if ev_type == EV_SYN:
                continue

            if ev_type == EV_KEY:
                self._handle_key(code, value)

            elif ev_type == EV_REL and is_mouse:
                self._handle_rel(code, _signed32(value))

            elif ev_type == EV_ABS and is_mouse:
                self._handle_abs(code, value)

    def _handle_key(self, code, value):
        """Handle EV_KEY events (keyboard keys, mouse buttons)."""
        if code == BTN_LEFT:
            if value == KEY_PRESS and self.on_click:
                self.on_click(self._mouse_x, self._mouse_y, "left", True)
            elif value == KEY_RELEASE and self.on_click:
                self.on_click(self._mouse_x, self._mouse_y, "left", False)
        elif code == BTN_RIGHT:
            if value == KEY_PRESS and self.on_click:
                self.on_click(self._mouse_x, self._mouse_y, "right", True)
            elif value == KEY_RELEASE and self.on_click:
                self.on_click(self._mouse_x, self._mouse_y, "right", False)
        elif code == BTN_MIDDLE:
            if value == KEY_PRESS and self.on_click:
                self.on_click(self._mouse_x, self._mouse_y, "middle", True)
        else:
            shift_active = 42 in self._modifiers or 54 in self._modifiers
            key_name, is_printable, is_modifier = _key_code_to_name(code, shift_active)

            if is_modifier:
                if value == KEY_PRESS:
                    self._modifiers.add(code)
                    if self.on_key_press:
                        self.on_key_press(key_name)
                elif value == KEY_RELEASE:
                    self._modifiers.discard(code)
            else:
                if value == KEY_PRESS:
                    if self.on_key_press:
                        self.on_key_press(key_name)
                elif value == KEY_RELEASE:
                    if self.on_key_release:
                        self.on_key_release(key_name)

    def _handle_rel(self, code, value):
        """Handle EV_REL events (mouse relative movement). Only from mouse devices."""
        if code == REL_X:
            self._mouse_x = max(0, min(self._screen_width - 1, self._mouse_x + value))
        elif code == REL_Y:
            self._mouse_y = max(0, min(self._screen_height - 1, self._mouse_y + value))
        elif code == REL_WHEEL:
            pass

    def _handle_abs(self, code, value):
        """Handle EV_ABS events (touchpad absolute position). Only from mouse devices."""
        if code == 0x00:  # ABS_X
            self._mouse_x = max(0, min(self._screen_width - 1, value))
        elif code == 0x01:  # ABS_Y
            self._mouse_y = max(0, min(self._screen_height - 1, value))
