import json
import os
import tempfile
import shutil
from lib.task_manager import TaskManager


def setup_v2_task(tmp_path):
    """Create a V2 semantic task.json in a temp dir."""
    task_dir = os.path.join(tmp_path, "open-weather-app")
    os.makedirs(os.path.join(task_dir, "screenshots"), exist_ok=True)
    task_data = {
        "name": "open-weather-app",
        "platform": "linux",
        "display_server": "wayland",
        "created": "2026-06-12T08:30:00Z",
        "steps": [
            {
                "id": 1,
                "action": "click",
                "nearby_text": "Applications",
                "position": {"x": 50, "y": 10},
                "screenshot": "step-001.png",
            },
            {
                "id": 2,
                "action": "type",
                "nearby_text": "Search bar",
                "text": "天气",
                "screenshot": "step-002.png",
            },
            {
                "id": 3,
                "action": "click",
                "nearby_text": "Weather icon",
                "position": {"x": 200, "y": 150},
                "screenshot": "step-003.png",
            },
        ],
    }
    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f)
    return tmp_path


def test_list_tasks_v2():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp)
    tm = TaskManager(tasks_dir=tmp)
    tasks = tm.list_tasks()
    assert "open-weather-app" in tasks
    shutil.rmtree(tmp)


def test_load_task_v2():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp)
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("open-weather-app")
    assert data["display_server"] == "wayland"
    assert data["steps"][1]["action"] == "type"
    assert data["steps"][1]["text"] == "天气"


def test_validate_task_v2():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp)
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("open-weather-app")
    assert tm.validate_task(data) is True
    shutil.rmtree(tmp)


def test_validate_task_missing_required_fields():
    # A step missing "action" should fail validation
    data = {
        "name": "bad-task",
        "steps": [
            {"id": 1, "nearby_text": "foo"},  # no "action"
        ],
    }
    tm = TaskManager()
    assert tm.validate_task(data) is False


def test_get_task_info():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp)
    tm = TaskManager(tasks_dir=tmp)
    info = tm.get_task_info("open-weather-app")
    assert info["name"] == "open-weather-app"
    assert info["step_count"] == 3
    assert info["platform"] == "linux"
    assert info["display_server"] == "wayland"
    assert "created" in info
    shutil.rmtree(tmp)
