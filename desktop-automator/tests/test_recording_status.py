import json
import os
import sys
import tempfile
import shutil

sys_path = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, sys_path)
sys.path.insert(0, os.path.join(sys_path, "lib"))

from lib.recording_status import RecordingStatus


def test_create_status_file():
    """Creating a RecordingStatus writes .recording file with task_name, pid, started."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        status_path = os.path.join(tmp, "test-task", ".recording")
        assert os.path.exists(status_path)
        with open(status_path) as f:
            data = json.load(f)
        assert data["task_name"] == "test-task"
        assert data["pid"] == os.getpid()
        assert "started" in data
        assert data["steps_so_far"] == 0
        assert data["display_server"] == "unknown"
    finally:
        shutil.rmtree(tmp)


def test_create_status_file_with_display_server():
    """Creating a RecordingStatus with display_server writes it correctly."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="ds-task", tasks_dir=tmp)
        rs.create(display_server="wayland")
        status_path = os.path.join(tmp, "ds-task", ".recording")
        with open(status_path) as f:
            data = json.load(f)
        assert data["display_server"] == "wayland"
    finally:
        shutil.rmtree(tmp)


def test_update_steps_so_far():
    """update_steps() updates steps_so_far in the status file."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        rs.update_steps(5)
        status_path = os.path.join(tmp, "test-task", ".recording")
        with open(status_path) as f:
            data = json.load(f)
        assert data["steps_so_far"] == 5
    finally:
        shutil.rmtree(tmp)


def test_update_steps_no_file():
    """update_steps() gracefully returns when status file doesn't exist."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="no-file-task", tasks_dir=tmp)
        rs.update_steps(5)  # Should not raise
    finally:
        shutil.rmtree(tmp)


def test_remove_status_file():
    """remove() deletes the .recording file."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        status_path = os.path.join(tmp, "test-task", ".recording")
        assert os.path.exists(status_path)
        rs.remove()
        assert not os.path.exists(status_path)
    finally:
        shutil.rmtree(tmp)


def test_remove_idempotent():
    """remove() is safe to call twice — no error on second call."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="idem-task", tasks_dir=tmp)
        rs.create()
        rs.remove()
        rs.remove()  # Second call should not raise
        assert not os.path.exists(os.path.join(tmp, "idem-task", ".recording"))
    finally:
        shutil.rmtree(tmp)


def test_check_active_recording():
    """check_active() returns dict when .recording exists and PID is alive."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        rs.update_steps(3)
        result = RecordingStatus.check_active(tmp)
        assert result is not None
        assert result["task_name"] == "test-task"
        assert result["pid"] == os.getpid()
        assert result["steps_so_far"] == 3
        assert result["pid_alive"] is True
    finally:
        shutil.rmtree(tmp)


def test_check_active_no_recording():
    """check_active() returns None when no .recording file exists."""
    tmp = tempfile.mkdtemp()
    try:
        result = RecordingStatus.check_active(tmp)
        assert result is None
    finally:
        shutil.rmtree(tmp)


def test_check_active_dead_pid():
    """check_active() returns dict with pid_alive=False when PID is not running."""
    tmp = tempfile.mkdtemp()
    try:
        task_dir = os.path.join(tmp, "dead-task")
        os.makedirs(task_dir)
        status_data = {
            "task_name": "dead-task",
            "pid": 999999999,
            "started": "2026-06-16T10:00:00Z",
            "display_server": "wayland",
            "steps_so_far": 3,
        }
        with open(os.path.join(task_dir, ".recording"), "w") as f:
            json.dump(status_data, f)
        result = RecordingStatus.check_active(tmp)
        assert result is not None
        assert result["pid_alive"] is False
    finally:
        shutil.rmtree(tmp)


def test_check_active_corrupted_json():
    """check_active() skips directories with corrupted .recording files."""
    tmp = tempfile.mkdtemp()
    try:
        task_dir = os.path.join(tmp, "corrupt-task")
        os.makedirs(task_dir)
        with open(os.path.join(task_dir, ".recording"), "w") as f:
            f.write("{broken json!!!")
        result = RecordingStatus.check_active(tmp)
        assert result is None
    finally:
        shutil.rmtree(tmp)


def test_check_active_skips_non_directories():
    """check_active() skips non-directory entries in tasks_dir."""
    tmp = tempfile.mkdtemp()
    try:
        # Create a regular file in tasks_dir (not a directory)
        with open(os.path.join(tmp, "not-a-dir.txt"), "w") as f:
            f.write("irrelevant")
        result = RecordingStatus.check_active(tmp)
        assert result is None
    finally:
        shutil.rmtree(tmp)
