# scripts/recorder.py
import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.platform_detector import detect_platform, detect_display_server
from lib.screen_capture import capture_screen, save_screenshot
from lib.recording_status import RecordingStatus
from lib.osd_window import OSDWindow
from scripts.ocr_engine import OcrEngine
from pynput import mouse, keyboard


MODIFIER_KEYS = frozenset({
    "shift", "shift_l", "shift_r",
    "ctrl", "ctrl_l", "ctrl_r",
    "alt", "alt_l", "alt_r",
    "cmd", "cmd_l", "cmd_r",
    "super", "super_l", "super_r",
    "win", "win_l", "win_r",
})

SPACE_KEYS = frozenset({"space"})


class KeyMerger:
    """Merges consecutive printable character keypresses into a single 'type' event."""

    def __init__(self):
        self._buffer = ""

    def add_key(self, key_str):
        flushed_event = None
        special_event = None

        if key_str in SPACE_KEYS:
            self._buffer += " "
        elif len(key_str) == 1 and key_str.isprintable():
            self._buffer += key_str
        elif key_str in MODIFIER_KEYS:
            flushed_event = self._flush_buffer()
            special_event = {"action": "keypress", "key": key_str}
        else:
            flushed_event = self._flush_buffer()
            special_event = {"action": "keypress", "key": key_str}

        return (flushed_event, special_event)

    def flush(self):
        return self._flush_buffer()

    def _flush_buffer(self):
        if not self._buffer:
            return None
        text = self._buffer
        self._buffer = ""
        return {"action": "type", "text": text}


class Recorder:
    """Records desktop operations with semantic merging, OSD feedback,
    signal handling, and status file tracking.
    """

    def __init__(self, task_name, tasks_dir=None):
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.task_name = task_name
        self.task_dir = os.path.join(tasks_dir, task_name)
        self.screenshots_dir = os.path.join(self.task_dir, "screenshots")
        self.tasks_dir = tasks_dir
        self.steps = []
        self.step_counter = 0
        self.recording = True
        self.start_time = time.time()
        self.mouse_listener = None
        self.key_listener = None
        self.key_merger = KeyMerger()
        self.ocr_engine = OcrEngine()
        self._recording_status = RecordingStatus(task_name, tasks_dir)
        self._osd = None

    def start(self):
        os.makedirs(self.screenshots_dir, exist_ok=True)

        # Create status file
        self._recording_status.create(detect_display_server())

        # Register signal handlers
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

        # Start listeners
        self.mouse_listener = mouse.Listener(on_click=self._on_click)
        self.key_listener = keyboard.Listener(
            on_press=self._on_key_press, on_release=self._on_key_release
        )
        self.mouse_listener.start()
        self.key_listener.start()

        print(f"Recording task '{self.task_name}'...")
        print("Press Esc to stop, or click Stop button in OSD window.")

        # Show OSD window on main thread (runs mainloop, replaces listener.join())
        self._osd = OSDWindow(
            step_count=0,
            start_time=self.start_time,
            stop_callback=self._osd_stop,
        )
        self._osd.show()

    def _osd_stop(self):
        """Callback from OSD stop button. Called on main thread."""
        self.stop()

    def _signal_handler(self, signum, frame):
        """Handle SIGTERM/SIGINT — save data before exiting."""
        print(f"\nReceived signal {signum}, saving recording data...")
        self.stop()

    def stop(self):
        """Stop recording, flush buffer, save task, remove status file."""
        if not self.recording:
            return
        self.recording = False

        # Flush any remaining accumulated text
        flushed_event = self.key_merger.flush()
        if flushed_event is not None:
            self._record_step_from_event(flushed_event)

        # Stop listeners
        if self.mouse_listener:
            self.mouse_listener.stop()
        if self.key_listener:
            self.key_listener.stop()

        # Save task data
        self._save_task()

        # Remove status file
        self._recording_status.remove()

    def _on_click(self, x, y, button, pressed):
        if not self.recording:
            return
        if pressed:
            flushed_event = self.key_merger.flush()
            if flushed_event is not None:
                self._record_step_from_event(flushed_event)

            position = {"x": x, "y": y}
            description = f"click {button.name} at ({x},{y})"
            self._record_step(
                action="click",
                position=position,
                key=None,
                text=None,
                description=description,
            )

    def _on_key_press(self, key):
        if not self.recording:
            return
        if key == keyboard.Key.esc:
            # Schedule stop on main thread via OSD
            if self._osd and self._osd.root:
                self._osd.root.after(0, self._osd_stop)
            else:
                self.stop()
            return

    def _on_key_release(self, key):
        if not self.recording:
            return
        try:
            key_str = key.char if hasattr(key, "char") and key.char else key.name
        except AttributeError:
            key_str = str(key)

        if key_str in ("esc", "Esc"):
            return

        flushed_event, special_event = self.key_merger.add_key(key_str)

        if flushed_event is not None:
            self._record_step_from_event(flushed_event)
        if special_event is not None:
            self._record_step_from_event(special_event)

    def _record_step_from_event(self, event):
        action = event["action"]
        text = event.get("text")
        key = event.get("key")
        if action == "type":
            description = f"type '{text}'"
        elif action == "keypress":
            description = f"key press {key}"
        else:
            description = action

        self._record_step(
            action=action,
            position=None,
            key=key,
            text=text,
            description=description,
        )

    def _record_step(self, action, position=None, key=None, text=None, description=""):
        self.step_counter += 1
        screenshot_name = f"step-{self.step_counter:03d}.png"
        screenshot_path = os.path.join(self.screenshots_dir, screenshot_name)
        img = capture_screen()
        save_screenshot(img, screenshot_path)

        nearby_text = None
        if position is not None:
            nearby_text = self._extract_nearby_text(img, position)

        step = {
            "id": self.step_counter,
            "action": action,
            "position": position,
            "screenshot": screenshot_name,
            "key": key,
            "text": text,
            "description": description,
            "nearby_text": nearby_text,
        }
        self.steps.append(step)
        print(f"  Step {self.step_counter}: {description}")

        # Update OSD step count (schedule on main thread)
        if self._osd:
            self._osd.update_steps(self.step_counter)

        # Update status file
        self._recording_status.update_steps(self.step_counter)

    def _extract_nearby_text(self, screenshot_img, position, radius=200, max_results=5):
        blocks = self.ocr_engine.extract_text_blocks(screenshot_img)
        if not blocks:
            return None

        px = position["x"]
        py = position["y"]
        nearby = []
        for b in blocks:
            bx = b["x"] + b["width"] // 2
            by = b["y"] + b["height"] // 2
            dist = abs(bx - px) + abs(by - py)
            if dist <= radius:
                nearby.append({"text": b["text"], "dist": dist})

        if not nearby:
            return None

        nearby.sort(key=lambda item: item["dist"])
        return [item["text"] for item in nearby[:max_results]]

    def _save_task(self):
        task_data = {
            "name": self.task_name,
            "platform": detect_platform(),
            "display_server": detect_display_server(),
            "created": datetime.now(timezone.utc).isoformat(),
            "steps": self.steps,
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
