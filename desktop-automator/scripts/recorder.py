# scripts/recorder.py
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.screen_capture import capture_screen, save_screenshot
from lib.platform_detector import detect_platform
from pynput import mouse, keyboard

class Recorder:
    def __init__(self, task_name, tasks_dir=None):
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.task_name = task_name
        self.task_dir = os.path.join(tasks_dir, task_name)
        self.screenshots_dir = os.path.join(self.task_dir, "screenshots")
        self.steps = []
        self.step_counter = 0
        self.recording = True
        self.mouse_listener = None
        self.key_listener = None

    def start(self):
        os.makedirs(self.screenshots_dir, exist_ok=True)
        print(f"Recording task '{self.task_name}'...")
        print("Press Esc to stop recording.")
        print("Recording mouse clicks and keyboard shortcuts...")

        self.mouse_listener = mouse.Listener(on_click=self._on_click)
        self.key_listener = keyboard.Listener(on_press=self._on_key_press, on_release=self._on_key_release)
        self.mouse_listener.start()
        self.key_listener.start()

        self.mouse_listener.join()
        self.key_listener.join()
        self._save_task()

    def stop(self):
        self.recording = False
        if self.mouse_listener:
            self.mouse_listener.stop()
        if self.key_listener:
            self.key_listener.stop()

    def _on_click(self, x, y, button, pressed):
        if not self.recording:
            return
        if pressed:
            self._record_step("click", position={"x": x, "y": y}, description=f"click {button.name} at ({x},{y})")

    def _on_key_press(self, key):
        if not self.recording:
            return
        if key == keyboard.Key.esc:
            print("Esc pressed, stopping recording...")
            self.stop()
            return

    def _on_key_release(self, key):
        if not self.recording:
            return
        try:
            key_str = key.char if hasattr(key, 'char') and key.char else key.name
        except AttributeError:
            key_str = str(key)
        if key_str in ("esc", "Esc"):
            return
        self._record_step("keypress", key=key_str, description=f"key press {key_str}")

    def _record_step(self, action, position=None, key=None, description=""):
        self.step_counter += 1
        screenshot_name = f"step-{self.step_counter:03d}.png"
        screenshot_path = os.path.join(self.screenshots_dir, screenshot_name)
        img = capture_screen()
        save_screenshot(img, screenshot_path)
        step = {
            "id": self.step_counter,
            "action": action,
            "position": position,
            "screenshot": screenshot_name,
            "key": key,
            "description": description
        }
        self.steps.append(step)
        print(f"  Step {self.step_counter}: {description}")

    def _save_task(self):
        task_data = {
            "name": self.task_name,
            "platform": detect_platform(),
            "created": datetime.now(timezone.utc).isoformat(),
            "steps": self.steps
        }
        task_path = os.path.join(self.task_dir, "task.json")
        with open(task_path, "w") as f:
            json.dump(task_data, f, indent=2)
        print(f"\nRecording saved: {self.task_dir}")
        print(f"  {len(self.steps)} steps recorded")

def main():
    parser = argparse.ArgumentParser(description="Record desktop operations")
    parser.add_argument("--name", required=True, help="Task name for the recording")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    args = parser.parse_args()
    recorder = Recorder(args.name, args.tasks_dir)
    recorder.start()

if __name__ == "__main__":
    main()
