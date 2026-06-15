import json
import os
import tempfile
import shutil
from lib.task_manager import TaskManager

def setup_task_dir(tmp_path, task_name):
    task_dir = os.path.join(tmp_path, task_name)
    os.makedirs(os.path.join(task_dir, "screenshots"), exist_ok=True)
    task_data = {
        "name": task_name,
        "platform": "linux",
        "created": "2026-06-10T10:00:00Z",
        "steps": [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200}, "screenshot": "step-001.png", "key": None},
            {"id": 2, "action": "keypress", "key": "ctrl+c", "screenshot": "step-002.png", "position": None}
        ]
    }
    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f)
    return task_dir

def test_list_tasks():
    tmp = tempfile.mkdtemp()
    setup_task_dir(tmp, "test-task")
    tm = TaskManager(tasks_dir=tmp)
    tasks = tm.list_tasks()
    assert "test-task" in tasks
    shutil.rmtree(tmp)

def test_load_task():
    tmp = tempfile.mkdtemp()
    setup_task_dir(tmp, "test-task")
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("test-task")
    assert data["name"] == "test-task"
    assert len(data["steps"]) == 2
    assert data["steps"][0]["action"] == "click"
    shutil.rmtree(tmp)

def test_validate_task():
    tmp = tempfile.mkdtemp()
    setup_task_dir(tmp, "test-task")
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("test-task")
    assert tm.validate_task(data) is True
    shutil.rmtree(tmp)