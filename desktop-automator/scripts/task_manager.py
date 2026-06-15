import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager

def main():
    tm = TaskManager()
    if len(sys.argv) > 1 and sys.argv[1] == "list":
        tasks = tm.list_tasks()
        if not tasks:
            print("No recorded tasks found.")
        else:
            for name in tasks:
                data = tm.load_task(name)
                steps = len(data["steps"])
                print(f"  {name} ({steps} steps, platform: {data.get('platform', 'unknown')})")
    else:
        print("Usage: python task_manager.py list")

if __name__ == "__main__":
    main()