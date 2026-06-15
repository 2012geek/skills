# scripts/player.py
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager
from lib.screen_capture import capture_screen, save_screenshot
from lib.coordinate_adapter import CoordinateAdapter
from lib.platform_detector import detect_platform, get_screen_size
from scripts.ocr_engine import OcrEngine
from scripts.vision_api import VisionApi
import pyautogui

pyautogui.PAUSE = 0.5

class Player:
    def __init__(self, task_name, tasks_dir=None, mode="flexible", delay=1.0):
        self.tm = TaskManager(tasks_dir)
        self.task_name = task_name
        self.mode = mode
        self.delay = delay
        self.task_data = self.tm.load_task(task_name)
        self.task_dir = os.path.join(self.tm.tasks_dir, task_name)
        self.screenshots_dir = os.path.join(self.task_dir, "screenshots")
        self.ocr = OcrEngine()
        self.vision = VisionApi()
        self.results = []

    def replay(self):
        print(f"Replaying task '{self.task_name}' ({len(self.task_data['steps'])} steps)...")
        platform = detect_platform()
        if platform != self.task_data["platform"]:
            print(f"Warning: recorded on {self.task_data['platform']}, running on {platform}")

        current_size = get_screen_size()
        adapter = CoordinateAdapter(
            self.task_data.get("recorded_width", current_size[0]),
            self.task_data.get("recorded_height", current_size[1])
        )

        for step in self.task_data["steps"]:
            result = self._replay_step(step, adapter, current_size)
            self.results.append(result)
            if result["status"] == "failed" and self.mode == "strict":
                print(f"Step {step['id']} failed in strict mode. Stopping.")
                break
            time.sleep(self.delay)

        self._print_summary()

    def _replay_step(self, step, adapter, current_size):
        print(f"\nStep {step['id']}: {step['description']}")

        ref_img_path = os.path.join(self.screenshots_dir, step["screenshot"])
        if not os.path.exists(ref_img_path):
            return {"step_id": step["id"], "status": "failed", "reason": "reference screenshot missing"}

        from PIL import Image
        ref_img = Image.open(ref_img_path)
        current_img = capture_screen()

        # Strategy 1: OCR text matching
        ref_blocks = self.ocr.extract_text_blocks(ref_img)
        current_blocks = self.ocr.extract_text_blocks(current_img)

        target_pos = None
        if step.get("position"):
            target_pos = self.ocr.match_reference_area(
                current_blocks, ref_blocks,
                step["position"]["x"], step["position"]["y"]
            )

        # Strategy 2: Vision API fallback
        if not target_pos and step.get("description"):
            from io import BytesIO
            buf = BytesIO()
            current_img.save(buf, format="PNG")
            current_bytes = buf.getvalue()
            buf2 = BytesIO()
            ref_img.save(buf2, format="PNG")
            ref_bytes = buf2.getvalue()
            vision_result = self.vision.locate_element(current_bytes, ref_bytes, step["description"])
            if vision_result.get("found"):
                target_pos = {"x": vision_result["x"], "y": vision_result["y"], "method": "vision_api"}

        # Execute action
        if step["action"] == "click":
            if target_pos:
                adapted = adapter.adapt(target_pos["x"], target_pos["y"], current_size[0], current_size[1])
                pyautogui.click(adapted[0], adapted[1])
                print(f"  Clicked at ({adapted[0]}, {adapted[1]}) via {target_pos.get('method', 'ocr')}")
                return {"step_id": step["id"], "status": "success", "method": target_pos.get("method", "ocr"), "position": adapted}
            elif step.get("position"):
                adapted = adapter.adapt(step["position"]["x"], step["position"]["y"], current_size[0], current_size[1])
                pyautogui.click(adapted[0], adapted[1])
                print(f"  Clicked at ({adapted[0]}, {adapted[1]}) via original coordinates")
                return {"step_id": step["id"], "status": "success", "method": "original_coords", "position": adapted}
            else:
                return {"step_id": step["id"], "status": "failed", "reason": "no position data"}

        elif step["action"] == "keypress":
            key = step.get("key", "")
            if "+" in key:
                keys = key.split("+")
                for k in keys[:-1]:
                    pyautogui.keyDown(k)
                pyautogui.press(keys[-1])
                for k in reversed(keys[:-1]):
                    pyautogui.keyUp(k)
            else:
                pyautogui.press(key)
            print(f"  Pressed: {key}")
            return {"step_id": step["id"], "status": "success", "method": "keypress", "key": key}

        return {"step_id": step["id"], "status": "unknown", "action": step["action"]}

    def _print_summary(self):
        success = sum(1 for r in self.results if r["status"] == "success")
        failed = sum(1 for r in self.results if r["status"] == "failed")
        print(f"\nReplay complete: {success} succeeded, {failed} failed out of {len(self.results)} steps")

def main():
    parser = argparse.ArgumentParser(description="Replay recorded desktop operations")
    parser.add_argument("--task", required=True, help="Task name to replay")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    parser.add_argument("--mode", choices=["strict", "flexible"], default="flexible", help="Error handling mode")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between steps (seconds)")
    args = parser.parse_args()
    player = Player(args.task, args.tasks_dir, args.mode, args.delay)
    player.replay()

if __name__ == "__main__":
    main()
