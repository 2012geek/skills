import json
import os

class TaskManager:
    def __init__(self, tasks_dir=None):
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.tasks_dir = tasks_dir

    def list_tasks(self):
        if not os.path.exists(self.tasks_dir):
            return []
        return [d for d in os.listdir(self.tasks_dir)
                if os.path.isdir(os.path.join(self.tasks_dir, d))
                and os.path.exists(os.path.join(self.tasks_dir, d, "task.json"))]

    def load_task(self, name):
        path = os.path.join(self.tasks_dir, name, "task.json")
        with open(path, "r") as f:
            return json.load(f)

    def validate_task(self, data):
        if "name" not in data or "steps" not in data:
            return False
        for step in data["steps"]:
            if "action" not in step or "id" not in step:
                return False
        return True

    def get_task_info(self, name):
        data = self.load_task(name)
        return {
            "name": data["name"],
            "step_count": len(data["steps"]),
            "platform": data.get("platform"),
            "display_server": data.get("display_server"),
            "created": data.get("created"),
        }