import json
import os
import psutil
from datetime import datetime, timezone


class RecordingStatus:
    """Manages .recording status file for tracking active recording state."""

    def __init__(self, task_name, tasks_dir=None):
        self.task_name = task_name
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.tasks_dir = tasks_dir
        self.task_dir = os.path.join(tasks_dir, task_name)
        self.status_path = os.path.join(self.task_dir, ".recording")

    def create(self, display_server=None):
        os.makedirs(self.task_dir, exist_ok=True)
        data = {
            "task_name": self.task_name,
            "pid": os.getpid(),
            "started": datetime.now(timezone.utc).isoformat(),
            "display_server": display_server or "unknown",
            "steps_so_far": 0,
        }
        with open(self.status_path, "w") as f:
            json.dump(data, f, indent=2)

    def update_steps(self, count):
        with open(self.status_path, "r") as f:
            data = json.load(f)
        data["steps_so_far"] = count
        with open(self.status_path, "w") as f:
            json.dump(data, f, indent=2)

    def remove(self):
        if os.path.exists(self.status_path):
            os.remove(self.status_path)

    @staticmethod
    def check_active(tasks_dir=None):
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        if not os.path.exists(tasks_dir):
            return None

        for name in os.listdir(tasks_dir):
            status_path = os.path.join(tasks_dir, name, ".recording")
            if not os.path.exists(status_path):
                continue
            with open(status_path, "r") as f:
                data = json.load(f)
            try:
                pid_alive = psutil.pid_exists(data["pid"])
            except Exception:
                pid_alive = False
            data["pid_alive"] = pid_alive
            return data

        return None
