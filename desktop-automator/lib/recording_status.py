import json
import os
import psutil
from datetime import datetime, timezone


class RecordingStatus:
    """Manages .recording status file for tracking active recording state.

    The .recording file lives at tasks/<task-name>/.recording and contains
    task_name, pid, started timestamp, display_server, and steps_so_far.
    It enables external status queries and residual recording detection.
    """

    def __init__(self, task_name, tasks_dir=None):
        self.task_name = task_name
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.tasks_dir = tasks_dir
        self.task_dir = os.path.join(tasks_dir, task_name)
        self.status_path = os.path.join(self.task_dir, ".recording")

    def create(self, display_server=None):
        """Create .recording file with initial state (steps_so_far=0)."""
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
        """Update steps_so_far in the status file."""
        if not os.path.exists(self.status_path):
            return
        try:
            with open(self.status_path, "r") as f:
                data = json.load(f)
            data["steps_so_far"] = count
            with open(self.status_path, "w") as f:
                json.dump(data, f, indent=2)
        except (json.JSONDecodeError, OSError):
            return

    def remove(self):
        """Delete the .recording file (called when recording ends successfully)."""
        if os.path.exists(self.status_path):
            os.remove(self.status_path)

    @staticmethod
    def check_active(tasks_dir=None):
        """Scan tasks_dir for any .recording file and return status dict.

        Returns None if no active recording found. Returns dict with
        pid_alive=True/False if a .recording file exists. Note: returns
        only the first match found; multiple simultaneous recordings are
        not supported.
        """
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        if not os.path.exists(tasks_dir):
            return None

        for name in os.listdir(tasks_dir):
            task_dir = os.path.join(tasks_dir, name)
            if not os.path.isdir(task_dir):
                continue
            status_path = os.path.join(task_dir, ".recording")
            if not os.path.exists(status_path):
                continue
            try:
                with open(status_path, "r") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue
            try:
                pid_alive = psutil.pid_exists(data["pid"])
            except Exception:
                pid_alive = False
            data["pid_alive"] = pid_alive
            return data

        return None
