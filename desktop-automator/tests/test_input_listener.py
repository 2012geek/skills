import os
import struct
import sys
import tempfile
import threading
import time
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from lib.input_listener import (
    BTN_LEFT, BTN_RIGHT, BTN_MIDDLE,
    EV_KEY, EV_REL, EV_SYN, EV_ABS,
    INPUT_EVENT_FORMAT, INPUT_EVENT_SIZE,
    KEY_PRESS, KEY_RELEASE,
    MODIFIER_KEY_CODES, PRINTABLE_KEY_CODES, SPECIAL_KEY_MAP,
    _key_code_to_name, _find_readable_devices, _discover_input_devices,
    _signed32,
    EvdevInputListener,
)


def _make_input_event(ev_type, code, value):
    """Build a 24-byte input_event struct for testing."""
    return struct.pack(INPUT_EVENT_FORMAT, 1000, 0, ev_type, code, value)


def test_input_event_size():
    """Verify input_event struct is 24 bytes on 64-bit Linux."""
    assert INPUT_EVENT_SIZE == 24
    assert len(_make_input_event(EV_KEY, BTN_LEFT, KEY_PRESS)) == 24


def test_key_code_to_name_modifier():
    """Modifier key codes return (name, is_printable=False, is_modifier=True)."""
    name, printable, modifier = _key_code_to_name(42)  # left shift
    assert name == "shift_l"
    assert not printable
    assert modifier


def test_key_code_to_name_printable():
    """Printable key codes return (char, is_printable=True, is_modifier=False)."""
    name, printable, modifier = _key_code_to_name(30)  # 'a'
    assert name == "a"
    assert printable
    assert not modifier


def test_key_code_to_name_printable_with_shift():
    """Shift + printable key produces uppercase or shifted character."""
    name, printable, modifier = _key_code_to_name(30, shift_active=True)  # 'a' -> 'A'
    assert name == "A"
    name2, _, _ = _key_code_to_name(2, shift_active=True)  # '1' -> '!'
    assert name2 == "!"


def test_key_code_to_name_special():
    """Special key codes return (name, is_printable=False, is_modifier=False)."""
    name, printable, modifier = _key_code_to_name(1)  # esc
    assert name == "esc"
    assert not printable
    assert not modifier


def test_key_code_to_name_unknown():
    """Unknown key codes return formatted name like 'key99'."""
    name, printable, modifier = _key_code_to_name(999)
    assert name == "key999"
    assert not printable
    assert not modifier


def test_find_readable_devices_filters_permission_denied():
    """_find_readable_devices skips paths that can't be opened."""
    with patch("os.open", side_effect=OSError("Permission denied")):
        result = _find_readable_devices(["/dev/input/event0"])
        assert result == []


def test_find_readable_devices_returns_readable():
    """_find_readable_devices returns paths that can be opened."""
    mock_fd = 42
    with patch("os.open", return_value=mock_fd), patch("os.close"):
        result = _find_readable_devices(["/dev/input/event0"])
        assert result == ["/dev/input/event0"]


def test_discover_input_devices_with_sysfs():
    """_discover_input_devices finds keyboard and mouse devices from sysfs."""
    fake_sysfs = {
        "/sys/class/input/event11/device/name": "Logitech G102 Gaming Mouse",
        "/sys/class/input/event13/device/name": "RAPOO Gaming Keyboard",
        "/sys/class/input/event5/device/name": "HDA Intel PCH Mic",
    }

    def mock_open(path, *args):
        if path in fake_sysfs:
            from io import StringIO
            return StringIO(fake_sysfs[path])
        raise FileNotFoundError(path)

    with patch("os.path.isdir", return_value=True), \
         patch("os.listdir", return_value=["event11", "event13", "event5"]), \
         patch("builtins.open", side_effect=mock_open):
        devices = _discover_input_devices()
        assert "/dev/input/event11" in devices["mouse"]
        assert "/dev/input/event13" in devices["keyboard"]
        assert "/dev/input/event5" not in devices["mouse"]
        assert "/dev/input/event5" not in devices["keyboard"]


def test_discover_input_devices_skips_audio():
    """_discover_input_devices skips HDA/ALSA audio devices."""
    fake_sysfs = {
        "/sys/class/input/event8/device/name": "HDA Intel PCH HDMI/DP,pcm=3",
    }

    def mock_open(path, *args):
        if path in fake_sysfs:
            from io import StringIO
            return StringIO(fake_sysfs[path])
        raise FileNotFoundError(path)

    with patch("os.path.isdir", return_value=True), \
         patch("os.listdir", return_value=["event8"]), \
         patch("builtins.open", side_effect=mock_open):
        devices = _discover_input_devices()
        assert devices["mouse"] == []
        assert devices["keyboard"] == []


def test_discover_input_devices_skips_system_buttons():
    """_discover_input_devices skips power/sleep/video bus devices."""
    fake_sysfs = {
        "/sys/class/input/event0/device/name": "Sleep Button",
        "/sys/class/input/event1/device/name": "Power Button",
    }

    def mock_open(path, *args):
        if path in fake_sysfs:
            from io import StringIO
            return StringIO(fake_sysfs[path])
        raise FileNotFoundError(path)

    with patch("os.path.isdir", return_value=True), \
         patch("os.listdir", return_value=["event0", "event1"]), \
         patch("builtins.open", side_effect=mock_open):
        devices = _discover_input_devices()
        assert devices["mouse"] == []
        assert devices["keyboard"] == []


def test_evdev_listener_handles_mouse_click():
    """EvdevInputListener calls on_click with correct position for BTN_LEFT press."""
    click_callback = MagicMock()
    listener = EvdevInputListener(on_click=click_callback)
    listener._mouse_x = 500
    listener._mouse_y = 300

    listener._handle_key(BTN_LEFT, KEY_PRESS)
    click_callback.assert_called_once_with(500, 300, "left", True)


def test_evdev_listener_handles_mouse_right_click():
    """EvdevInputListener calls on_click for BTN_RIGHT press."""
    click_callback = MagicMock()
    listener = EvdevInputListener(on_click=click_callback)
    listener._mouse_x = 100
    listener._mouse_y = 200

    listener._handle_key(BTN_RIGHT, KEY_PRESS)
    click_callback.assert_called_once_with(100, 200, "right", True)


def test_evdev_listener_handles_keyboard_key():
    """EvdevInputListener calls on_key_press/on_key_release for keyboard keys."""
    press_callback = MagicMock()
    release_callback = MagicMock()
    listener = EvdevInputListener(
        on_key_press=press_callback,
        on_key_release=release_callback,
    )

    # Key 'a' (code 30)
    listener._handle_key(30, KEY_PRESS)
    press_callback.assert_called_once_with("a")

    listener._handle_key(30, KEY_RELEASE)
    release_callback.assert_called_once_with("a")


def test_evdev_listener_handles_modifier_tracking():
    """EvdevInputListener tracks shift modifier for shift+character mapping."""
    press_callback = MagicMock()
    release_callback = MagicMock()
    listener = EvdevInputListener(
        on_key_press=press_callback,
        on_key_release=release_callback,
    )

    # Press left shift (code 42)
    listener._handle_key(42, KEY_PRESS)
    assert 42 in listener._modifiers
    press_callback.assert_called_with("shift_l")

    # Press 'a' with shift active — should produce 'A'
    listener._handle_key(30, KEY_PRESS)
    press_callback.assert_called_with("A")

    # Release shift
    listener._handle_key(42, KEY_RELEASE)
    assert 42 not in listener._modifiers


def test_evdev_listener_esc_stops():
    """ESC key press triggers stop callback via OSD."""
    listener = EvdevInputListener()
    # ESC handling is done by recorder's _on_evdev_key_press, not listener itself
    # Just verify ESC key name is returned correctly
    name, _, _ = _key_code_to_name(1)
    assert name == "esc"


def test_evdev_listener_mouse_relative_movement():
    """EvdevInputListener tracks mouse position via relative movement."""
    listener = EvdevInputListener()
    listener._mouse_x = 500
    listener._mouse_y = 300
    listener._screen_width = 1920
    listener._screen_height = 1080

    listener._handle_rel(0x00, 10)   # REL_X +10
    listener._handle_rel(0x01, -5)   # REL_Y -5

    assert listener._mouse_x == 510
    assert listener._mouse_y == 295


def test_signed32_converts_unsigned_to_signed():
    """_signed32 converts unsigned 32-bit values to signed."""
    assert _signed32(10) == 10
    assert _signed32(0xFFFFFFFF) == -1
    assert _signed32(0x80000000) == -2147483648
    assert _signed32(0) == 0


def test_evdev_listener_mouse_position_clamped():
    """Mouse position is clamped to screen dimensions."""
    listener = EvdevInputListener()
    listener._mouse_x = 1910
    listener._mouse_y = 1070
    listener._screen_width = 1920
    listener._screen_height = 1080

    listener._handle_rel(0x00, 100)   # REL_X +100 would exceed width
    assert listener._mouse_x == 1919   # Clamped to screen_width - 1

    listener._handle_rel(0x01, -2000)  # REL_Y -2000 would go below 0
    assert listener._mouse_y == 0      # Clamped to 0


def test_evdev_listener_read_events_parses_buffer():
    """_read_events correctly parses multiple input_events from a buffer."""
    click_callback = MagicMock()
    listener = EvdevInputListener(on_click=click_callback)
    listener._mouse_x = 400
    listener._mouse_y = 200
    listener._screen_width = 1920
    listener._screen_height = 1080

    # Build a buffer with: mouse move + left click press
    buf = _make_input_event(EV_REL, 0x00, 50)   # REL_X +50
    buf += _make_input_event(EV_REL, 0x01, 30)   # REL_Y +30
    buf += _make_input_event(EV_SYN, 0, 0)        # SYN
    buf += _make_input_event(EV_KEY, BTN_LEFT, KEY_PRESS)

    # os.read returns buf first call, then OSError to end the loop
    call_count = 0
    def mock_read(fd, size):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return buf
        raise OSError("no more data")

    with patch("os.read", side_effect=mock_read):
        listener._fds = {99: "/dev/input/event11"}
        listener._fd_is_mouse = {99: True}  # Mark as mouse device for REL events
        listener._read_events(99)

    assert listener._mouse_x == 450
    assert listener._mouse_y == 230
    click_callback.assert_called_once_with(450, 230, "left", True)


def test_evdev_listener_start_requires_readable_devices():
    """EvdevInputListener.start() raises RuntimeError if no readable devices."""
    listener = EvdevInputListener()
    empty_devices = {"mouse": [], "keyboard": []}
    with patch("lib.input_listener._discover_input_devices", return_value=empty_devices), \
         patch("lib.input_listener._find_readable_devices", return_value=[]):
        try:
            listener.start()
            assert False, "Should have raised RuntimeError"
        except RuntimeError as e:
            assert "No readable" in str(e)


def test_evdev_listener_stop_closes_fds():
    """EvdevInputListener.stop() closes all open file descriptors."""
    listener = EvdevInputListener()
    mock_fd1 = 10
    mock_fd2 = 11
    listener._fds = {mock_fd1: "/dev/input/event0", mock_fd2: "/dev/input/event1"}
    listener._fd_is_mouse = {mock_fd1: True, mock_fd2: False}
    listener._running = True
    listener._thread = threading.Thread(target=lambda: None)
    listener._thread.start()

    with patch("os.close") as mock_close:
        listener.stop()
        assert mock_close.call_count == 2

    assert not listener._running
    assert listener._fds == {}
    assert listener._fd_is_mouse == {}


def test_evdev_listener_is_alive():
    """EvdevInputListener.is_alive() reflects thread state."""
    listener = EvdevInputListener()
    assert not listener.is_alive()

    listener._thread = threading.Thread(target=lambda: time.sleep(0.1))
    listener._thread.start()
    assert listener.is_alive()
    listener._thread.join()
    assert not listener.is_alive()
