import os
import sys
import time
from unittest.mock import MagicMock

sys_path = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, sys_path)
sys.path.insert(0, os.path.join(sys_path, "lib"))

from lib.osd_window import OSDWindow


def test_osd_window_creation():
    """OSDWindow can be created with step=0 and start_time."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    assert osd.step_count == 0
    assert osd.start_time > 0
    assert osd._stop_callback is None


def test_osd_window_creation_with_callback():
    """OSDWindow stores stop_callback for stop button."""
    callback = MagicMock()
    osd = OSDWindow(step_count=0, start_time=time.time(), stop_callback=callback)
    assert osd._stop_callback is callback


def test_osd_window_update_steps():
    """update_steps() changes step_count value."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    osd.update_steps(5)
    assert osd.step_count == 5


def test_osd_window_format_elapsed_time():
    """_format_elapsed() converts seconds to MM:SS format."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    assert osd._format_elapsed(0) == "00:00"
    assert osd._format_elapsed(61) == "01:01"
    assert osd._format_elapsed(3661) == "61:01"
    assert osd._format_elapsed(-1) == "00:00"


def test_osd_window_stop_button_triggers_callback():
    """Clicking stop button calls stop_callback if set."""
    callback = MagicMock()
    osd = OSDWindow(step_count=0, start_time=time.time(), stop_callback=callback)
    osd._on_stop_click()
    callback.assert_called_once()


def test_osd_window_stop_button_no_callback():
    """Clicking stop button with no callback does not crash."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    osd._on_stop_click()  # Should not raise


def test_osd_window_stop_sets_stopping_flag():
    """_on_stop_click sets _stopping flag to prevent further updates."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    assert osd._stopping is False
    osd._on_stop_click()
    assert osd._stopping is True


def test_osd_window_update_steps_blocked_when_stopping():
    """update_steps() is ignored when _stopping flag is True."""
    osd = OSDWindow(step_count=5, start_time=time.time())
    osd._stopping = True
    osd.update_steps(10)  # Should be ignored
    assert osd.step_count == 5


def test_osd_window_destroy_no_root():
    """destroy() does not crash when root is None."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    osd.destroy()  # Should not raise


def test_osd_window_destroy_with_root():
    """destroy() schedules _on_stop_click via root.after()."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    mock_root = MagicMock()
    osd.root = mock_root
    osd.destroy()
    mock_root.after.assert_called_once_with(0, osd._on_stop_click)
