import argparse
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager

def main():
    parser = argparse.ArgumentParser(description="Manage recorded desktop tasks")
    parser.add_argument("command", choices=["list", "info", "delete"])
    parser.add_argument("--name", default=None, help="Task name (for info/delete)")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    args = parser.parse_args()
    tm = TaskManager(args.tasks_dir)

    if args.command == "list":
        tasks = tm.list_tasks()
        if not tasks:
            print("No tasks recorded.")
            return
        for name in tasks:
            info = tm.get_task_info(name)
            print(f"  {name} ({info['step_count']} steps, {info['platform']}/{info['display_server']})")
    elif args.command == "info":
        if not args.name:
            print("Error: --name required for info command")
            return
        info = tm.get_task_info(args.name)
        print(json.dumps(info, indent=2))
    elif args.command == "delete":
        if not args.name:
            print("Error: --name required for delete command")
            return
        task_dir = os.path.join(tm.tasks_dir, args.name)
        if not os.path.isdir(task_dir):
            print(f"Error: task '{args.name}' not found")
            return
        import shutil
        shutil.rmtree(task_dir)
        print(f"Deleted task: {args.name}")

if __name__ == "__main__":
    main()
