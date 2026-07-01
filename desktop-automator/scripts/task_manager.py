import argparse
import json
import sys
import os
from datetime import datetime, timezone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager
from lib.recording_status import RecordingStatus
from scripts.analyzer import Analyzer


def main():
    parser = argparse.ArgumentParser(description="Manage recorded desktop tasks")
    parser.add_argument("command", choices=["list", "info", "delete", "status", "analyze"])
    parser.add_argument("--name", default=None, help="Task name (for info/delete/analyze)")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    parser.add_argument("--provider", choices=["doubao", "anthropic"], default=None,
                        help="Vision provider for analyze")
    args = parser.parse_args()
    tm = TaskManager(args.tasks_dir)

    if args.command == "list":
        tasks = tm.list_tasks()
        if not tasks:
            print("No tasks recorded.")
            return
        for name in tasks:
            info = tm.get_task_info(name)
            status = info.get("status", "unknown")
            steps = info.get("step_count", 0)
            frames = info.get("frames_count", "?")
            print(f"  {name} (status={status}, {steps} steps, {frames} frames, {info['platform']}/{info['display_server']})")
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
    elif args.command == "status":
        result = RecordingStatus.check_active(tm.tasks_dir)
        if result is None:
            print("No recording in progress.")
        elif result["pid_alive"]:
            started = result.get("started", "")
            elapsed = ""
            if started:
                try:
                    start_dt = datetime.fromisoformat(started)
                    now_dt = datetime.now(timezone.utc)
                    diff = int((now_dt - start_dt).total_seconds())
                    mins, secs = divmod(diff, 60)
                    elapsed = f"{mins:02d}:{secs:02d}"
                except (ValueError, TypeError):
                    elapsed = "unknown"
            print("Recording in progress:")
            print(f"  Task: {result['task_name']}")
            print(f"  Frames: {result.get('frames_so_far', 0)}")
            print(f"  Elapsed: {elapsed}")
            print(f"  PID: {result.get('pid', 'N/A')}")
            print(f"  Display server: {result.get('display_server', 'unknown')}")
        else:
            print("WARNING: Incomplete recording found!")
            print(f"  Task: {result['task_name']}")
            print(f"  Frames captured: {result.get('frames_so_far', 0)}")
            print(f"  PID: {result.get('pid', 'N/A')} (dead)")
            print("  Run: python3 scripts/task_manager.py delete --name " + result['task_name'])
            print("  to clean up the incomplete recording.")
    elif args.command == "analyze":
        if not args.name:
            print("Error: --name required for analyze command")
            return
        analyzer = Analyzer(args.name, args.tasks_dir, args.provider)
        analyzer.analyze()


if __name__ == "__main__":
    main()
