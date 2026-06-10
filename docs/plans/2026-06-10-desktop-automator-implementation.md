# desktop-automator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code skill that records user desktop operations (screenshots + event logs) and replays them autonomously using hybrid visual recognition (local OCR + remote vision API).

**Architecture:** Python-based recording engine (`pynput` for event capture, `mss` for screenshots) saves step data as JSON + PNG files. Replay engine reads task data, uses Tesseract OCR for text-based element matching, falls back to Claude Vision API for complex UI elements, and executes actions via `pyautogui`. SKILL.md instructs Claude Code to invoke Python scripts via Bash.

**Tech Stack:** Python 3.10+, pyautogui, pynput, mss, Pillow, pytesseract, PaddleOCR (optional), Anthropic SDK, opencv-python (optional), pytest

---

### Task 1: Project Scaffold

**Files:**
- Create: `desktop-automator/SKILL.md`
- Create: `desktop-automator/package.json`
- Create: `desktop-automator/requirements.txt`
- Create: `desktop-automator/.gitignore`
- Create: `desktop-automator/tasks/.gitkeep`
- Create: `desktop-automator/tests/.gitkeep`

**Step 1: Create directory structure**

```bash
cd /home/nice/chenlening/workspace/skills
mkdir -p desktop-automator/scripts desktop-automator/lib desktop-automator/tasks desktop-automator/agents desktop-automator/tests
touch desktop-automator/tasks/.gitkeep desktop-automator/tests/.gitkeep
```

**Step 2: Write `requirements.txt`**

```
pyautogui>=0.9.54
pynput>=1.7.7
mss>=9.0.1
Pillow>=10.0.0
pytesseract>=0.3.10
anthropic>=0.40.0
opencv-python>=4.8.0
pytest>=8.0.0
```

**Step 3: Write `package.json`**

```json
{
  "name": "desktop-automator",
  "version": "1.0.0",
  "description": "Claude Code skill for recording and replaying desktop operations with AI-powered visual recognition",
  "scripts": {
    "record": "python scripts/recorder.py",
    "replay": "python scripts/player.py",
    "list": "python scripts/task_manager.py list",
    "test": "cd desktop-automator && python -m pytest tests/ -v"
  },
  "keywords": ["desktop", "automation", "rpa", "ocr", "vision"],
  "author": "Claude Code",
  "license": "MIT"
}
```

**Step 4: Write `.gitignore`**

```
tasks/*/
!tasks/.gitkeep
__pycache__/
*.pyc
.pytest_cache/
screenshots/
```

**Step 5: Write placeholder `SKILL.md`**

```markdown
---
name: desktop-automator
description: "录制桌面操作并自动回放。支持鼠标点击、键盘输入的录制，通过本地 OCR 和远端视觉 API 识别 UI 元素进行自适应回放。"
license: MIT
---

# Desktop Automator

录制桌面操作并自动回放。

## Usage

录制桌面操作:
```bash
python scripts/recorder.py --name <task-name>
```

回放录制操作:
```bash
python scripts/player.py --task <task-name>
```

列出已录制任务:
```bash
python scripts/task_manager.py list
```

## Recording

启动录制后，脚本监听鼠标点击和键盘输入，每次操作自动截屏。
按 Esc 键停止录制，数据保存为 JSON + 截图文件。

## Replay

回放时逐步执行录制操作，每步先截取当前屏幕：
1. 本地 OCR 文字匹配定位元素（优先）
2. 远端视觉 API 分析截图定位元素（兜底）
3. 用识别到的坐标执行操作

## Platform Support

- Linux: X11 (xdotool, mss, pynput)
- Windows: Win32 (pyautogui, mss, pynput)

## Dependencies

系统依赖: Tesseract-OCR
Python 依赖: 见 requirements.txt
```

**Step 6: Commit**

```bash
git add desktop-automator/
git commit -m "feat(desktop-automator): scaffold project structure and SKILL.md"
```

---

### Task 2: Platform Detector & Screen Capture

**Files:**
- Create: `desktop-automator/lib/platform_detector.py`
- Create: `desktop-automator/lib/screen_capture.py`
- Create: `desktop-automator/tests/test_platform_detector.py`
- Create: `desktop-automator/tests/test_screen_capture.py`

**Step 1: Write test for platform_detector**

```python
# tests/test_platform_detector.py
import sys
from lib.platform_detector import detect_platform, get_screen_size

def test_detect_platform_returns_known_value():
    result = detect_platform()
    assert result in ("linux", "windows", "macos")

def test_detect_platform_matches_sys():
    result = detect_platform()
    if sys.platform.startswith("linux"):
        assert result == "linux"
    elif sys.platform == "win32":
        assert result == "windows"
    elif sys.platform == "darwin":
        assert result == "macos"

def test_get_screen_size_returns_positive():
    w, h = get_screen_size()
    assert w > 0 and h > 0
```

**Step 2: Run test to verify it fails**

```bash
cd desktop-automator && python -m pytest tests/test_platform_detector.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'lib.platform_detector'`

**Step 3: Write `lib/platform_detector.py`**

```python
# lib/platform_detector.py
import sys
import pyautogui

def detect_platform():
    if sys.platform.startswith("linux"):
        return "linux"
    elif sys.platform == "win32":
        return "windows"
    elif sys.platform == "darwin":
        return "macos"
    return "unknown"

def get_screen_size():
    return pyautogui.size()
```

**Step 4: Run test to verify it passes**

```bash
cd desktop-automator && python -m pytest tests/test_platform_detector.py -v
```
Expected: PASS

**Step 5: Write test for screen_capture**

```python
# tests/test_screen_capture.py
import os
from lib.screen_capture import capture_screen, save_screenshot

def test_capture_screen_returns_pil_image():
    img = capture_screen()
    assert img is not None
    assert img.size[0] > 0
    assert img.size[1] > 0

def test_save_screenshot_creates_file():
    img = capture_screen()
    path = "/tmp/test_screenshot.png"
    save_screenshot(img, path)
    assert os.path.exists(path)
    os.remove(path)
```

**Step 6: Run test to verify it fails**

```bash
cd desktop-automator && python -m pytest tests/test_screen_capture.py -v
```
Expected: FAIL — `ModuleNotFoundError`

**Step 7: Write `lib/screen_capture.py`**

```python
# lib/screen_capture.py
import mss
from PIL import Image

def capture_screen():
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

def save_screenshot(img, path):
    img.save(path)
```

**Step 8: Run test to verify it passes**

```bash
cd desktop-automator && python -m pytest tests/test_screen_capture.py -v
```
Expected: PASS

**Step 9: Commit**

```bash
git add desktop-automator/lib/platform_detector.py desktop-automator/lib/screen_capture.py desktop-automator/tests/
git commit -m "feat(desktop-automator): add platform detector and screen capture modules"
```

---

### Task 3: Task Manager

**Files:**
- Create: `desktop-automator/lib/task_manager.py`
- Create: `desktop-automator/tests/test_task_manager.py`

**Step 1: Write test for task_manager**

```python
# tests/test_task_manager.py
import json
import os
import tempfile
from lib.task_manager import TaskManager

def setup_task_dir(tmp_path, task_name):
    task_dir = os.path.join(tmp_path, task_name)
    os.makedirs(os.path.join(task_dir, "screenshots"), exist_ok=True)
    task_data = {
        "name": task_name,
        "platform": "linux",
        "created": "2026-06-10T10:00:00Z",
        "steps": [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200}, "screenshot": "step-001.png", "key": None},
            {"id": 2, "action": "keypress", "key": "ctrl+c", "screenshot": "step-002.png", "position": None}
        ]
    }
    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f)
    return task_dir

def test_list_tasks():
    tmp = tempfile.mkdtemp()
    setup_task_dir(tmp, "test-task")
    tm = TaskManager(tasks_dir=tmp)
    tasks = tm.list_tasks()
    assert "test-task" in tasks
    os.remove(os.path.join(tmp, "test-task", "task.json"))
    os.rmdir(os.path.join(tmp, "test-task", "screenshots"))
    os.rmdir(os.path.join(tmp, "test-task"))
    os.rmdir(tmp)

def test_load_task():
    tmp = tempfile.mkdtemp()
    setup_task_dir(tmp, "test-task")
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("test-task")
    assert data["name"] == "test-task"
    assert len(data["steps"]) == 2
    assert data["steps"][0]["action"] == "click"
    os.remove(os.path.join(tmp, "test-task", "task.json"))
    os.rmdir(os.path.join(tmp, "test-task", "screenshots"))
    os.rmdir(os.path.join(tmp, "test-task"))
    os.rmdir(tmp)

def test_validate_task():
    tmp = tempfile.mkdtemp()
    setup_task_dir(tmp, "test-task")
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("test-task")
    assert tm.validate_task(data) is True
    os.remove(os.path.join(tmp, "test-task", "task.json"))
    os.rmdir(os.path.join(tmp, "test-task", "screenshots"))
    os.rmdir(os.path.join(tmp, "test-task"))
    os.rmdir(tmp)
```

**Step 2: Run test to verify it fails**

```bash
cd desktop-automator && python -m pytest tests/test_task_manager.py -v
```
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write `lib/task_manager.py`**

```python
# lib/task_manager.py
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
```

**Step 4: Run test to verify it passes**

```bash
cd desktop-automator && python -m pytest tests/test_task_manager.py -v
```
Expected: PASS

**Step 5: Write CLI wrapper `scripts/task_manager.py`**

```python
# scripts/task_manager.py
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
```

**Step 6: Test CLI manually**

```bash
cd desktop-automator && python scripts/task_manager.py list
```
Expected: "No recorded tasks found." (empty tasks dir)

**Step 7: Commit**

```bash
git add desktop-automator/lib/task_manager.py desktop-automator/scripts/task_manager.py desktop-automator/tests/test_task_manager.py
git commit -m "feat(desktop-automator): add task manager with list/load/validate and CLI"
```

---

### Task 4: Coordinate Adapter

**Files:**
- Create: `desktop-automator/lib/coordinate_adapter.py`
- Create: `desktop-automator/tests/test_coordinate.py`

**Step 1: Write test for coordinate_adapter**

```python
# tests/test_coordinate.py
from lib.coordinate_adapter import CoordinateAdapter

def test_same_resolution_no_scaling():
    adapter = CoordinateAdapter(recorded_width=1920, recorded_height=1080)
    x, y = adapter.adapt(960, 540, 1920, 1080)
    assert x == 960 and y == 540

def test_scale_down():
    adapter = CoordinateAdapter(recorded_width=1920, recorded_height=1080)
    x, y = adapter.adapt(960, 540, 1280, 720)
    assert x == 640 and y == 360

def test_scale_up():
    adapter = CoordinateAdapter(recorded_width=1280, recorded_height=720)
    x, y = adapter.adapt(640, 360, 1920, 1080)
    assert x == 960 and y == 540
```

**Step 2: Run test to verify it fails**

```bash
cd desktop-automator && python -m pytest tests/test_coordinate.py -v
```
Expected: FAIL — `ModuleNotFoundError`

**Step 3: Write `lib/coordinate_adapter.py`**

```python
# lib/coordinate_adapter.py

class CoordinateAdapter:
    def __init__(self, recorded_width, recorded_height):
        self.recorded_width = recorded_width
        self.recorded_height = recorded_height

    def adapt(self, x, y, current_width, current_height):
        if current_width == self.recorded_width and current_height == self.recorded_height:
            return x, y
        scale_x = current_width / self.recorded_width
        scale_y = current_height / self.recorded_height
        return round(x * scale_x), round(y * scale_y)
```

**Step 4: Run test to verify it passes**

```bash
cd desktop-automator && python -m pytest tests/test_coordinate.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add desktop-automator/lib/coordinate_adapter.py desktop-automator/tests/test_coordinate.py
git commit -m "feat(desktop-automator): add coordinate adapter for resolution scaling"
```

---

### Task 5: OCR Engine

**Files:**
- Create: `desktop-automator/scripts/ocr_engine.py`
- Create: `desktop-automator/tests/test_ocr_engine.py`
- Create: `desktop-automator/tests/fixtures/` (test screenshot images)

**Prerequisite:** Install Tesseract OCR system dependency

```bash
# Linux
sudo apt-get install tesseract-ocr

# Windows — download installer from https://github.com/UB-Mannheim/tesseract/wiki
```

**Step 1: Install Python dependencies**

```bash
pip3 install pytesseract Pillow mss opencv-python pytest
```

**Step 2: Create test fixture — a simple screenshot with text**

We'll use a programmatically generated image instead of a real screenshot for testing:

```python
# tests/test_ocr_engine.py
import os
import tempfile
from PIL import Image, ImageDraw, ImageFont
from scripts.ocr_engine import OcrEngine

def make_test_image(text, width=400, height=100):
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 30), text, fill="black")
    return img

def test_ocr_extract_text_blocks():
    engine = OcrEngine()
    img = make_test_image("Click Here")
    blocks = engine.extract_text_blocks(img)
    found = any("Click" in b["text"] or "Here" in b["text"] for b in blocks)
    assert found, f"Expected 'Click Here' in OCR results, got: {blocks}"

def test_ocr_find_text_position():
    engine = OcrEngine()
    img = make_test_image("Settings")
    blocks = engine.extract_text_blocks(img)
    pos = engine.find_text_position("Settings", blocks)
    assert pos is not None, "Expected to find 'Settings' position"
    assert pos["x"] > 0 and pos["y"] > 0

def test_ocr_find_text_not_found():
    engine = OcrEngine()
    img = make_test_image("Hello")
    blocks = engine.extract_text_blocks(img)
    pos = engine.find_text_position("Nonexistent", blocks)
    assert pos is None
```

**Step 3: Run test to verify it fails**

```bash
cd desktop-automator && python -m pytest tests/test_ocr_engine.py -v
```
Expected: FAIL — `ModuleNotFoundError`

**Step 4: Write `scripts/ocr_engine.py`**

```python
# scripts/ocr_engine.py
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytesseract
from PIL import Image

class OcrEngine:
    def __init__(self, lang="eng+chi_sim"):
        self.lang = lang

    def extract_text_blocks(self, image):
        data = pytesseract.image_to_data(image, lang=self.lang, output_type=pytesseract.Output.DICT)
        blocks = []
        for i in range(len(data["text"])):
            text = data["text"][i].strip()
            if text:
                blocks.append({
                    "text": text,
                    "x": data["left"][i],
                    "y": data["top"][i],
                    "width": data["width"][i],
                    "height": data["height"][i],
                    "confidence": int(data["conf"][i])
                })
        return blocks

    def find_text_position(self, target_text, blocks, min_confidence=30):
        candidates = []
        for b in blocks:
            if b["confidence"] >= min_confidence and target_text.lower() in b["text"].lower():
                candidates.append(b)
        if not candidates:
            return None
        best = max(candidates, key=lambda b: b["confidence"])
        return {
            "x": best["x"] + best["width"] // 2,
            "y": best["y"] + best["height"] // 2,
            "text": best["text"],
            "confidence": best["confidence"]
        }

    def match_reference_area(self, current_blocks, reference_blocks, target_x, target_y, search_radius=100):
        ref_texts = []
        for b in reference_blocks:
            if b["confidence"] >= 30:
                dist = abs(b["x"] + b["width"] // 2 - target_x) + abs(b["y"] + b["height"] // 2 - target_y)
                if dist <= search_radius:
                    ref_texts.append(b["text"].lower())
        if not ref_texts:
            return None
        for text in ref_texts:
            pos = self.find_text_position(text, current_blocks)
            if pos:
                return pos
        return None
```

**Step 5: Run test to verify it passes**

```bash
cd desktop-automator && python -m pytest tests/test_ocr_engine.py -v
```
Expected: PASS (requires Tesseract installed)

**Step 6: Commit**

```bash
git add desktop-automator/scripts/ocr_engine.py desktop-automator/tests/test_ocr_engine.py
git commit -m "feat(desktop-automator): add OCR engine with text block extraction and matching"
```

---

### Task 6: Vision API Client

**Files:**
- Create: `desktop-automator/scripts/vision_api.py`
- Create: `desktop-automator/tests/test_vision_api.py`

**Step 1: Install Anthropic SDK**

```bash
pip3 install anthropic
```

**Step 2: Write test for vision_api (mock-based)**

```python
# tests/test_vision_api.py
import base64
import json
from unittest.mock import MagicMock, patch
from PIL import Image
from scripts.vision_api import VisionApi

def make_test_image_bytes():
    img = Image.new("RGB", (100, 100), "white")
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def test_vision_api_init():
    api = VisionApi(api_key="test-key")
    assert api.api_key == "test-key"

@patch("scripts.vision_api.VisionApi._call_api")
def test_locate_element_returns_coordinates(mock_call):
    mock_call.return_value = json.dumps({
        "found": True,
        "x": 150,
        "y": 200,
        "description": "Settings button at top-right"
    })
    api = VisionApi(api_key="test-key")
    img_bytes = make_test_image_bytes()
    result = api.locate_element(img_bytes, img_bytes, "Settings button")
    assert result["found"] is True
    assert result["x"] == 150
    assert result["y"] == 200

@patch("scripts.vision_api.VisionApi._call_api")
def test_locate_element_not_found(mock_call):
    mock_call.return_value = json.dumps({
        "found": False,
        "description": "Element not visible on screen"
    })
    api = VisionApi(api_key="test-key")
    img_bytes = make_test_image_bytes()
    result = api.locate_element(img_bytes, img_bytes, "Nonexistent")
    assert result["found"] is False
```

**Step 3: Run test to verify it fails**

```bash
cd desktop-automator && python -m pytest tests/test_vision_api.py -v
```
Expected: FAIL — `ModuleNotFoundError`

**Step 4: Write `scripts/vision_api.py`**

```python
# scripts/vision_api.py
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import base64
import json
import anthropic

class VisionApi:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.client = anthropic.Anthropic(api_key=self.api_key) if self.api_key else None

    def locate_element(self, current_image_bytes, reference_image_bytes, target_description):
        if not self.client:
            return {"found": False, "description": "No API key configured"}
        current_b64 = base64.b64encode(current_image_bytes).decode("utf-8")
        reference_b64 = base64.b64encode(reference_image_bytes).decode("utf-8")
        return self._call_api(current_b64, reference_b64, target_description)

    def _call_api(self, current_b64, reference_b64, target_description):
        prompt = f"""Look at these two screenshots. The first is the current screen state. The second is a reference screenshot where the target element was at a specific position.

I need to find "{target_description}" on the current screen.

Respond ONLY with a JSON object:
- "found": true/false
- "x": pixel x-coordinate of the center of the element (if found)
- "y": pixel y-coordinate of the center of the element (if found)
- "description": brief description of what you found"""

        message = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": current_b64}},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": reference_b64}},
                    {"type": "text", "text": prompt}
                ]
            }]
        )
        try:
            text = message.content[0].text
            return json.loads(text)
        except (json.JSONDecodeError, IndexError):
            return {"found": False, "description": f"API response parse error: {text[:200]}"}
```

**Step 5: Run test to verify it passes**

```bash
cd desktop-automator && python -m pytest tests/test_vision_api.py -v
```
Expected: PASS (mocked, no real API call)

**Step 6: Commit**

```bash
git add desktop-automator/scripts/vision_api.py desktop-automator/tests/test_vision_api.py
git commit -m "feat(desktop-automator): add vision API client for Claude Vision element detection"
```

---

### Task 7: Recorder Script

**Files:**
- Create: `desktop-automator/scripts/recorder.py`

**Step 1: Install pynput**

```bash
pip3 install pynput pyautogui
```

**Step 2: Write `scripts/recorder.py`**

```python
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
```

**Step 3: Test recorder manually (interactive)**

```bash
cd desktop-automator && python scripts/recorder.py --name test-manual
```
Then click a few things on screen and press Esc. Verify `tasks/test-manual/task.json` and screenshots exist.

**Step 4: Clean up test recording**

```bash
rm -rf desktop-automator/tasks/test-manual
```

**Step 5: Commit**

```bash
git add desktop-automator/scripts/recorder.py
git commit -m "feat(desktop-automator): add recorder script with pynput mouse/keyboard capture"
```

---

### Task 8: Player/Replay Script

**Files:**
- Create: `desktop-automator/scripts/player.py`

**Step 1: Write `scripts/player.py`**

```python
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
                target_pos = {"x": vision_result["x"], "y": vision_result["y"]}

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
```

**Step 2: Commit**

```bash
git add desktop-automator/scripts/player.py
git commit -m "feat(desktop-automator): add replay player with OCR + vision API hybrid recognition"
```

---

### Task 9: Replay Observer Agent

**Files:**
- Create: `desktop-automator/agents/replay-observer.md`

**Step 1: Write agent definition**

```markdown
---
name: replay-observer
description: "Observe replay execution and handle anomalies. When a step fails recognition, analyze the situation and suggest recovery strategies."
model: claude-sonnet-4-6
---

You are observing the replay of a desktop automation task. A step has failed visual recognition.

## Context

- Task being replayed: {{task_name}}
- Failed step ID: {{step_id}}
- Step description: {{step_description}}
- Step action: {{step_action}}
- OCR attempt result: {{ocr_result}}
- Vision API result: {{vision_result}}

## Your Job

1. Analyze why the step failed — was the UI element moved, renamed, or is the window different?
2. Suggest a recovery strategy:
   - Skip this step and continue
   - Try a different search text
   - Use keyboard navigation instead of clicking
   - Abort the replay
3. If you can determine a likely new position, provide coordinates.

## Output Format

Return a JSON object:
```json
{
  "analysis": "brief explanation of why it failed",
  "strategy": "skip|retry|keyboard_nav|abort",
  "retry_text": "alternative text to search for (if retry)",
  "key_sequence": "keyboard shortcuts to achieve the same goal (if keyboard_nav)",
  "estimated_position": {"x": 0, "y": 0}
}
```
```

**Step 2: Commit**

```bash
git add desktop-automator/agents/replay-observer.md
git commit -m "feat(desktop-automator): add replay observer agent for handling recognition failures"
```

---

### Task 10: Complete SKILL.md

**Files:**
- Modify: `desktop-automator/SKILL.md` (replace placeholder with full version)

**Step 1: Write full SKILL.md**

```markdown
---
name: desktop-automator
description: "录制桌面操作并自动回放。支持鼠标点击、键盘输入的录制，通过本地 OCR 和远端视觉 API 识别 UI 元素进行自适应回放。跨平台支持 Linux 和 Windows。"
license: MIT
---

# Desktop Automator

录制桌面操作并自动回放，支持 AI 视觉识别。

## Commands

### 录制桌面操作

```
/desktop-automator record <task-name>
```

执行以下步骤：
1. 运行: `python scripts/recorder.py --name <task-name>`
2. 告知用户：录制已开始，按 Esc 键停止
3. 录制脚本会自动捕获鼠标点击和键盘输入，每步保存截图
4. 当脚本结束时，确认录制数据已保存

### 回放录制操作

```
/desktop-automator replay <task-name>
```

执行以下步骤：
1. 运行: `python scripts/player.py --task <task-name> --mode flexible --delay 1.0`
2. 观察输出，每步报告执行状态
3. 如果某步失败：
   - 在 flexible 模式下，报告失败但继续
   - 在 strict 模式下，停止回放
4. 回放结束后，汇总结果

可选参数：
- `--mode strict|flexible` — 严格模式遇错停止，灵活模式跳过继续
- `--delay <seconds>` — 步骤间延迟（默认 1.0 秒）

### 列出已录制任务

```
/desktop-automator list
```

运行: `python scripts/task_manager.py list`

## 前置条件

### 系统依赖
- **Linux**: `sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim`
- **Windows**: 下载安装 [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)

### Python 依赖
```bash
pip install -r requirements.txt
```

### API Key（可选，用于远端视觉识别）
设置环境变量: `ANTHROPIC_API_KEY=sk-ant-...`
如果不设置，回放将只使用本地 OCR，识别能力受限。

## 录制说明

- 录制时每次鼠标点击或键盘输入都会自动截屏并记录
- 建议操作时缓慢、明确，避免快速连续操作
- 按 Esc 键停止录制
- 录制数据保存在 `tasks/<task-name>/` 目录

## 回放说明

回放使用混合视觉识别策略：
1. **本地 OCR**（优先）— 提取屏幕文字，通过文字匹配定位目标元素
2. **远端视觉 API**（兜底）— 当 OCR 无法匹配时，调用 Claude Vision 分析截图
3. **坐标回退** — 如果以上都失败，使用录制时的原始坐标（可能因分辨率变化不准确）

如果遇到分辨率变化，会自动缩放坐标。

## Platform Support

- **Linux**: X11 显示服务器，需要桌面环境
- **Windows**: Win32，原生支持
```

**Step 2: Commit**

```bash
git add desktop-automator/SKILL.md
git commit -m "feat(desktop-automator): complete SKILL.md with full commands and documentation"
```

---

### Task 11: Integration Test & README

**Files:**
- Create: `desktop-automator/tests/test_integration.py`
- Create: `desktop-automator/README.md`

**Step 1: Write integration test**

```python
# tests/test_integration.py
import json
import os
import tempfile
from PIL import Image, ImageDraw
from lib.task_manager import TaskManager
from lib.screen_capture import save_screenshot
from lib.coordinate_adapter import CoordinateAdapter
from scripts.ocr_engine import OcrEngine

def test_full_record_and_load_cycle():
    tmp = tempfile.mkdtemp()
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

    # Cleanup
    os.remove(os.path.join(task_dir, "task.json"))
    os.remove(os.path.join(screenshots_dir, "step-001.png"))
    os.rmdir(screenshots_dir)
    os.rmdir(task_dir)
    os.rmdir(tmp)
```

**Step 2: Run integration test**

```bash
cd desktop-automator && python -m pytest tests/test_integration.py -v
```
Expected: PASS

**Step 3: Write README.md**

```markdown
# Desktop Automator

Claude Code skill for recording and replaying desktop operations with AI-powered visual recognition.

## Features

- Record mouse clicks and keyboard input with automatic screenshots
- Replay with hybrid visual recognition (OCR + Vision API)
- Cross-platform: Linux and Windows
- Resolution-adaptive coordinate scaling
- Strict and flexible error handling modes

## Quick Start

### Install dependencies

```bash
# System: Tesseract OCR
sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim  # Linux
# Windows: download from https://github.com/UB-Mannheim/tesseract/wiki

# Python packages
pip install -r requirements.txt
```

### Record a task

```bash
python scripts/recorder.py --name my-task
# Click and type on screen, then press Esc to stop
```

### Replay a task

```bash
python scripts/player.py --task my-task
```

### Use as Claude Code Skill

In Claude Code:
```
/desktop-automator record my-task
/desktop-automator replay my-task
/desktop-automator list
```

## Vision API (Optional)

Set `ANTHROPIC_API_KEY` environment variable to enable Claude Vision fallback for complex UI elements that OCR cannot find.

Without the API key, replay relies solely on local OCR text matching.
```

**Step 4: Commit**

```bash
git add desktop-automator/tests/test_integration.py desktop-automator/README.md
git commit -m "feat(desktop-automator): add integration test and README"
```

---

### Task 12: Final Polish — Run All Tests

**Step 1: Run all tests**

```bash
cd desktop-automator && python -m pytest tests/ -v
```
Expected: All tests PASS

**Step 2: Verify SKILL.md commands work**

```bash
cd desktop-automator && python scripts/task_manager.py list
```
Expected: "No recorded tasks found."

**Step 3: Final commit if any fixes needed**

Fix any failing tests, then commit fixes.

**Step 4: Verify all files exist**

```bash
find desktop-automator -type f | sort
```
Expected output should include all planned files:
- SKILL.md, README.md, package.json, requirements.txt, .gitignore
- scripts/recorder.py, player.py, ocr_engine.py, vision_api.py, screen_capture.py, task_manager.py
- lib/platform_detector.py, screen_capture.py, task_manager.py, coordinate_adapter.py
- agents/replay-observer.md
- tests/test_platform_detector.py, test_screen_capture.py, test_task_manager.py, test_coordinate.py, test_ocr_engine.py, test_vision_api.py, test_integration.py