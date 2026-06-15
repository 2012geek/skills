# tests/test_integration.py
import json
import os
import tempfile
import shutil
from PIL import Image, ImageDraw
from lib.task_manager import TaskManager
from lib.screen_capture import save_screenshot
from lib.coordinate_adapter import CoordinateAdapter
from scripts.ocr_engine import OcrEngine

def test_full_record_and_load_cycle():
    tmp = tempfile.mkdtemp()
    try:
        task_name = "integration-test"
        task_dir = os.path.join(tmp, task_name)
        screenshots_dir = os.path.join(task_dir, "screenshots")
        os.makedirs(screenshots_dir, exist_ok=True)

        # Create a mock "recorded" task
        img = Image.new("RGB", (200, 50), "white")
        draw = ImageDraw.Draw(img)
        draw.text((10, 10), "Open File", fill="black")
        save_screenshot(img, os.path.join(screenshots_dir, "step-001.png"))

        task_data = {
            "name": task_name,
            "platform": "linux",
            "created": "2026-06-10T10:00:00Z",
            "steps": [
                {"id": 1, "action": "click", "position": {"x": 100, "y": 25}, "screenshot": "step-001.png", "key": None, "description": "click Open File"}
            ]
        }
        with open(os.path.join(task_dir, "task.json"), "w") as f:
            json.dump(task_data, f)

        # Load and validate
        tm = TaskManager(tasks_dir=tmp)
        loaded = tm.load_task(task_name)
        assert tm.validate_task(loaded) is True

        # OCR on reference screenshot
        ref_img = Image.open(os.path.join(screenshots_dir, "step-001.png"))
        ocr = OcrEngine()
        blocks = ocr.extract_text_blocks(ref_img)
        assert len(blocks) > 0

        # Coordinate adaptation
        adapter = CoordinateAdapter(200, 50)
        x, y = adapter.adapt(100, 25, 400, 100)
        assert x == 200 and y == 50
    finally:
        shutil.rmtree(tmp)
