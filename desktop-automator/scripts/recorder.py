# scripts/recorder.py
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.platform_detector import detect_platform, detect_display_server
from lib.screen_capture import capture_screen, save_screenshot
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
    """Merges consecutive printable character keypresses into a single 'type' event.

    Rules:
      - Printable single characters -> accumulated into buffer
      - Space key -> added as space character in buffer
      - Modifier keys -> flush pending text, emit as 'keypress' event
      - Other special keys -> flush pending text, emit as 'keypress' event
    """

    def __init__(self):
        self._buffer = ""

    def add_key(self, key_str):
        """Process a key string and return (flushed_event, special_event) tuple.

        Either or both can be None:
          - If key is a printable char or space: accumulated, returns (None, None)
          - If key is a modifier: flushes pending text (if any) as type event,
            then emits the modifier as keypress. Returns (flushed_event, special_event)
          - If key is another special key: flushes pending text (if any) as type event,
            then emits the special key as keypress. Returns (flushed_event, special_event)
        """
        flushed_event = None
        special_event = None

        if key_str in SPACE_KEYS:
            # Space is included as a character in the buffer
            self._buffer += " "
        elif len(key_str) == 1 and key_str.isprintable():
            # Single printable character -> accumulate
            self._buffer += key_str
        elif key_str in MODIFIER_KEYS:
            # Modifier key -> flush pending text, emit as keypress
            flushed_event = self._flush_buffer()
            special_event = {"action": "keypress", "key": key_str}
        else:
            # Other special key (enter, tab, esc, etc.) -> flush pending text, emit as keypress
            flushed_event = self._flush_buffer()
            special_event = {"action": "keypress", "key": key_str}

        return (flushed_event, special_event)

    def flush(self):
        """Flush the buffer and return a type event, or None if buffer is empty.

        Called at end of recording or when a click event interrupts typing.
        """
        return self._flush_buffer()

    def _flush_buffer(self):
        """Internal: create a type event from buffer contents if non-empty."""
        if not self._buffer:
            return None
        text = self._buffer
        self._buffer = ""
        return {"action": "type", "text": text}


class Recorder:
    """Records desktop operations (mouse clicks and keyboard input) with
    semantic merging of consecutive character keypresses into 'type' events.

    Each step is annotated with nearby_text from OCR when a position is present.
    """

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
        self.key_merger = KeyMerger()
        self.ocr_engine = OcrEngine()

    def start(self):
        os.makedirs(self.screenshots_dir, exist_ok=True)
        print(f"Recording task '{self.task_name}'...")
        print("Press Esc to stop recording.")
        print("Recording mouse clicks and keyboard shortcuts...")

        self.mouse_listener = mouse.Listener(on_click=self._on_click)
        self.key_listener = keyboard.Listener(
            on_press=self._on_key_press, on_release=self._on_key_release
        )
        self.mouse_listener.start()
        self.key_listener.start()

        self.mouse_listener.join()
        self.key_listener.join()
        self._save_task()

    def stop(self):
        self.recording = False
        # Flush any remaining accumulated text
        flushed_event = self.key_merger.flush()
        if flushed_event is not None:
            self._record_step_from_event(flushed_event)
        if self.mouse_listener:
            self.mouse_listener.stop()
        if self.key_listener:
            self.key_listener.stop()

    def _on_click(self, x, y, button, pressed):
        if not self.recording:
            return
        if pressed:
            # Flush any pending key buffer before recording the click
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
            print("Esc pressed, stopping recording...")
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
        """Record a step from a KeyMerger event dict.

        event must have 'action' key. It may also have 'text' or 'key'.
        """
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

    def _extract_nearby_text(self, screenshot_img, position, radius=200, max_results=5):
        """Extract OCR text blocks near the given position within radius pixels.

        Returns a list of nearby text strings (top max_results by proximity).
        """
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
