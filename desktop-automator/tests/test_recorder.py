"""Tests for KeyMerger class in recorder.py and Recorder integration.

Only KeyMerger is tested with pure unit tests because Recorder requires a live GUI environment.
Recorder tests use pre-populated steps to avoid calling capture_screen().
"""

import sys
import os
import signal
import tempfile
import json
import shutil
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from scripts.recorder import KeyMerger, Recorder


def test_key_merger_consecutive_chars():
    """Consecutive printable chars should be accumulated into buffer.
    'z','h','i','s','h','i' -> flush gives {action:"type", text:"zhishi"}
    """
    merger = KeyMerger()
    for ch in ["z", "h", "i", "s", "h", "i"]:
        flushed, special = merger.add_key(ch)
        assert flushed is None
        assert special is None

    result = merger.flush()
    assert result is not None
    assert result["action"] == "type"
    assert result["text"] == "zhishi"


def test_key_merger_special_key_flushes():
    """Special key (enter) flushes accumulated text first, then emits as keypress.
    'z','h' accumulated, then 'enter' flushes 'zh' first, emits enter as keypress.
    """
    merger = KeyMerger()
    for ch in ["z", "h"]:
        flushed, special = merger.add_key(ch)
        assert flushed is None
        assert special is None

    flushed, special = merger.add_key("enter")
    # 'zh' should be flushed as a type event
    assert flushed is not None
    assert flushed["action"] == "type"
    assert flushed["text"] == "zh"
    # 'enter' should be emitted as a keypress event
    assert special is not None
    assert special["action"] == "keypress"
    assert special["key"] == "enter"


def test_key_merger_modifiers_not_merged():
    """Modifier keys should not be accumulated; they emit as keypress events.
    'ctrl' -> keypress event, not accumulated into buffer.
    """
    merger = KeyMerger()
    flushed, special = merger.add_key("ctrl")
    assert flushed is None
    assert special is not None
    assert special["action"] == "keypress"
    assert special["key"] == "ctrl"


def test_key_merger_space_included():
    """Space should be included as a character in the buffer.
    'h','e','l','l','o','space','w','o','r','l','d' -> "hello world"
    """
    merger = KeyMerger()
    keys = ["h", "e", "l", "l", "o", "space", "w", "o", "r", "l", "d"]
    for key in keys:
        flushed, special = merger.add_key(key)
        assert flushed is None
        assert special is None

    result = merger.flush()
    assert result is not None
    assert result["action"] == "type"
    assert result["text"] == "hello world"


def test_key_merger_empty_flush():
    """Flushing with nothing in buffer returns None."""
    merger = KeyMerger()
    result = merger.flush()
    assert result is None


def test_recorder_signal_handler_saves_data():
    """SIGTERM handler should call stop() which flushes buffer and saves task data."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="signal-test", tasks_dir=tmp)
        recorder.recording = True
        recorder.steps = [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200},
             "screenshot": "step-001.png", "key": None, "text": None,
             "description": "test click", "nearby_text": None}
        ]
        # Ensure task_dir exists (start() would normally create this)
        os.makedirs(recorder.task_dir, exist_ok=True)

        # Simulate signal handler calling stop
        recorder.stop()

        # Verify task.json was saved
        task_path = os.path.join(tmp, "signal-test", "task.json")
        assert os.path.exists(task_path)
        with open(task_path) as f:
            data = json.load(f)
        assert data["name"] == "signal-test"
        assert len(data["steps"]) == 1
    finally:
        shutil.rmtree(tmp)


def test_recorder_status_file_created():
    """Recorder has _recording_status object with correct task_name."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="status-test", tasks_dir=tmp)
        assert recorder._recording_status is not None
        assert recorder._recording_status.task_name == "status-test"
    finally:
        shutil.rmtree(tmp)


def test_recorder_status_file_removed_on_stop():
    """stop() removes .recording status file after saving."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="status-removal-test", tasks_dir=tmp)
        recorder.recording = True
        recorder.steps = [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200},
             "screenshot": "step-001.png", "key": None, "text": None,
             "description": "test click", "nearby_text": None}
        ]
        # Create the status file manually
        recorder._recording_status.create()
        status_path = os.path.join(tmp, "status-removal-test", ".recording")
        assert os.path.exists(status_path)

        recorder.stop()
        assert not os.path.exists(status_path)
    finally:
        shutil.rmtree(tmp)


def test_recorder_stop_idempotent():
    """Calling stop() twice does not crash — second call is ignored."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="idem-test", tasks_dir=tmp)
        recorder.recording = True
        recorder.steps = [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200},
             "screenshot": "step-001.png", "key": None, "text": None,
             "description": "test click", "nearby_text": None}
        ]
        # Ensure task_dir exists (start() would normally create this)
        os.makedirs(recorder.task_dir, exist_ok=True)
        recorder._recording_status.create()
        recorder.stop()
        recorder.stop()  # Second call should not raise
    finally:
        shutil.rmtree(tmp)


def test_recorder_osd_attribute():
    """Recorder has _osd attribute initially None."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="osd-test", tasks_dir=tmp)
        assert recorder._osd is None
    finally:
        shutil.rmtree(tmp)
