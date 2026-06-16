# Desktop Automator V2 Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor desktop-automator from a broken coordinate-based recorder/replayer to a working, intelligent LLM-driven computer-use system with Wayland support, semantic recording, and pluggable vision providers.

**Architecture:** 4-layer hybrid — (1) Wayland/X11/Win multi-backend screen capture, (2) semantic recording with key-merge and intent extraction, (3) computer-use replay loop using vision providers, (4) pluggable vision provider interface with DoubaoProvider as default. The proxy at `http://192.168.136.124:8080/v1` provides access to doubao-seed-2.0-pro (best grounding, 25px offset) and GLM-5 (vision but poor grounding). GLM-5.1 is text-only and unusable for vision.

**Tech Stack:** Python 3.10, pyautogui, pynput, mss, grim (subprocess), xdg-desktop-portal (dbus), OpenAI SDK (for doubao proxy), Anthropic SDK (for Claude Vision fallback), pytesseract (recording annotation only)

---

### Task 1: Rewrite platform_detector.py — Add display_server detection

**Files:**
- Modify: `desktop-automator/lib/platform_detector.py`
- Test: `desktop-automator/tests/test_platform_detector.py`

**Step 1: Write the failing test**

```python
# tests/test_platform_detector.py
import os
import sys
from lib.platform_detector import detect_platform, get_screen_size, detect_display_server

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

def test_detect_display_server_returns_known_value():
    result = detect_display_server()
    assert result in ("wayland", "x11", "unknown")

def test_detect_display_server_env_variable():
    # When XDG_SESSION_TYPE=wayland, should return wayland
    original = os.environ.get("XDG_SESSION_TYPE")
    os.environ["XDG_SESSION_TYPE"] = "wayland"
    assert detect_display_server() == "wayland"
    os.environ["XDG_SESSION_TYPE"] = "x11"
    assert detect_display_server() == "x11"
    if original:
        os.environ["XDG_SESSION_TYPE"] = original
    else:
        os.environ.pop("XDG_SESSION_TYPE", None)

def test_detect_display_server_fallback_env():
    original_type = os.environ.pop("XDG_SESSION_TYPE", None)
    original_wl = os.environ.get("WAYLAND_DISPLAY")
    original_x = os.environ.get("DISPLAY")
    # WAYLAND_DISPLAY set → wayland
    os.environ["WAYLAND_DISPLAY"] = "wayland-0"
    assert detect_display_server() == "wayland"
    # DISPLAY only → x11
    os.environ.pop("WAYLAND_DISPLAY", None)
    os.environ["DISPLAY"] = ":0"
    assert detect_display_server() == "x11"
    # Restore
    if original_type:
        os.environ["XDG_SESSION_TYPE"] = original_type
    if original_wl:
        os.environ["WAYLAND_DISPLAY"] = original_wl
    else:
        os.environ.pop("WAYLAND_DISPLAY", None)
    if original_x:
        os.environ["DISPLAY"] = original_x
    else:
        os.environ.pop("DISPLAY", None)
```

**Step 2: Run test to verify it fails**

Run: `cd desktop-automator && python3 -m pytest tests/test_platform_detector.py -v`
Expected: FAIL — `detect_display_server` not defined

**Step 3: Write minimal implementation**

```python
# lib/platform_detector.py
import os
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

def detect_display_server():
    session_type = os.environ.get("XDG_SESSION_TYPE", "")
    if session_type == "wayland":
        return "wayland"
    if session_type == "x11":
        return "x11"
    if os.environ.get("WAYLAND_DISPLAY"):
        return "wayland"
    if os.environ.get("DISPLAY"):
        return "x11"
    return "unknown"

def get_screen_size():
    return pyautogui.size()
```

**Step 4: Run test to verify it passes**

Run: `cd desktop-automator && python3 -m pytest tests/test_platform_detector.py -v`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add desktop-automator/lib/platform_detector.py desktop-automator/tests/test_platform_detector.py
git commit -m "feat(desktop-automator): add display_server detection for Wayland/X11"
```

---

### Task 2: Rewrite screen_capture.py — Wayland/X11/Win multi-backend

**Files:**
- Modify: `desktop-automator/lib/screen_capture.py`
- Test: `desktop-automator/tests/test_screen_capture.py`

**Step 1: Write the failing test**

```python
# tests/test_screen_capture.py
import os
from PIL import Image
from lib.screen_capture import capture_screen, save_screenshot, detect_display_server

def test_capture_screen_returns_pil_image():
    img = capture_screen()
    assert img is not None
    assert img.mode == "RGB"
    assert img.size[0] > 0
    assert img.size[1] > 0

def test_capture_screen_not_black():
    """Critical test: screenshot must not be all-black (the Wayland bug)"""
    img = capture_screen()
    import numpy as np
    arr = np.array(img)
    assert arr.mean() > 0, "Screenshot is all-black — capture backend failed"

def test_save_screenshot_creates_file():
    img = capture_screen()
    path = "/tmp/test_screenshot_v2.png"
    save_screenshot(img, path)
    assert os.path.exists(path)
    loaded = Image.open(path)
    assert loaded.size == img.size
    os.remove(path)

def test_detect_display_server_available():
    ds = detect_display_server()
    assert ds in ("wayland", "x11", "unknown")
```

**Step 2: Run test to verify it fails**

Run: `cd desktop-automator && python3 -m pytest tests/test_screen_capture.py -v`
Expected: FAIL — `test_capture_screen_not_black` fails (current mss returns all-black on Wayland)

**Step 3: Write minimal implementation**

```python
# lib/screen_capture.py
import os
import subprocess
import sys
from io import BytesIO
from PIL import Image

def detect_display_server():
    session_type = os.environ.get("XDG_SESSION_TYPE", "")
    if session_type == "wayland":
        return "wayland"
    if session_type == "x11":
        return "x11"
    if os.environ.get("WAYLAND_DISPLAY"):
        return "wayland"
    if os.environ.get("DISPLAY"):
        return "x11"
    return "unknown"

def _capture_wayland_grim():
    """Capture via grim (wlroots compositors: Sway, Hyprland)."""
    result = subprocess.run(
        ["grim", "-"],
        capture_output=True,
        check=True
    )
    return Image.open(BytesIO(result.stdout))

def _capture_wayland_portal():
    """Capture via xdg-desktop-portal D-Bus (GNOME, KDE, fallback)."""
    import dbus
    import dbus.mainloop.glib
    from gi.repository import GLib

    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    portal = bus.get_object(
        'org.freedesktop.portal.Desktop',
        '/org/freedesktop/portal/desktop'
    )
    iface = dbus.Interface(portal, 'org.freedesktop.portal.Screenshot')

    token = 'desktop_automator_' + str(os.getpid())
    options = {
        'interactive': dbus.Boolean(False),
        'handle_token': dbus.String(token),
    }

    handle_path = iface.Screenshot('', options)
    filepath = None

    request_obj = bus.get_object('org.freedesktop.portal.Desktop', handle_path)
    request_iface = dbus.Interface(request_obj, 'org.freedesktop.portal.Request')

    def on_response(response, results):
        nonlocal filepath
        if response == 0:
            uri = str(results.get('uri', ''))
            filepath = uri.replace('file://', '')
        loop.quit()

    request_iface.connect_to_signal('Response', on_response)
    loop = GLib.MainLoop()
    loop.run()

    if filepath:
        image = Image.open(filepath)
        os.unlink(filepath)
        return image
    raise RuntimeError("Portal screenshot failed or was cancelled")

def _capture_x11_mss():
    """Capture via mss (X11, reliable)."""
    import mss
    with mss.MSS() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

def capture_screen():
    """Capture a screenshot, automatically choosing the best backend."""
    display_server = detect_display_server()

    if display_server == "wayland":
        # Try grim first (simplest, no dialog), fall back to portal
        try:
            return _capture_wayland_grim()
        except (FileNotFoundError, subprocess.CalledProcessError):
            try:
                return _capture_wayland_portal()
            except Exception:
                # Last resort: try mss (may return black on pure Wayland)
                return _capture_x11_mss()
    elif display_server == "x11":
        return _capture_x11_mss()
    else:
        return _capture_x11_mss()

def save_screenshot(img, path):
    """Save a PIL Image to a file path."""
    img.save(path)
```

**Step 4: Install grim and run test**

```bash
sudo apt-get install grim
cd desktop-automator && python3 -m pytest tests/test_screen_capture.py -v
```

Expected: PASS — grim captures real screenshot, `test_capture_screen_not_black` now passes

**Step 5: Commit**

```bash
git add desktop-automator/lib/screen_capture.py desktop-automator/tests/test_screen_capture.py
git commit -m "feat(desktop-automator): Wayland/X11 multi-backend screen capture with grim + portal fallback"
```

---

### Task 3: Create vision_provider.py — Pluggable provider interface + DoubaoProvider

**Files:**
- Create: `desktop-automator/lib/vision_provider.py`
- Test: `desktop-automator/tests/test_vision_provider.py`

**Step 1: Write the failing test**

```python
# tests/test_vision_provider.py
import base64
import io
import json
from PIL import Image, ImageDraw
from lib.vision_provider import DoubaoProvider, VisionProvider

def test_vision_provider_protocol():
    """Verify DoubaoProvider satisfies VisionProvider protocol"""
    provider = DoubaoProvider()
    assert hasattr(provider, 'locate_element')
    assert callable(provider.locate_element)

def test_doubao_provider_init():
    provider = DoubaoProvider()
    assert provider.model == "doubao-seed-2.0-pro"
    assert provider.base_url == "http://192.168.136.124:8080/v1"

def test_doubao_provider_init_custom():
    provider = DoubaoProvider(
        api_key="test-key",
        model="doubao-seed-2.0-lite",
        base_url="http://custom:8080/v1"
    )
    assert provider.api_key == "test-key"
    assert provider.model == "doubao-seed-2.0-lite"
    assert provider.base_url == "http://custom:8080/v1"

def test_doubao_locate_element_with_synthetic_ui():
    """Integration test: doubao should find a button on a synthetic UI"""
    # Create synthetic UI with a blue "Submit" button
    img = Image.new('RGB', (800, 600), (240, 240, 240))
    draw = ImageDraw.Draw(img)
    draw.rectangle([300, 200, 500, 250], fill=(0, 120, 215))
    draw.text((350, 210), "Submit", fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    current_bytes = buf.getvalue()

    provider = DoubaoProvider()
    result = provider.locate_element(
        current_bytes=current_bytes,
        reference_bytes=current_bytes,
        description="Submit button"
    )

    assert result["found"] is True
    assert "x" in result and "y" in result
    # Accept some tolerance: Submit center is ~(400, 225), allow ±100px
    assert abs(result["x"] - 400) < 150
    assert abs(result["y"] - 225) < 150
```

**Step 2: Run test to verify it fails**

Run: `cd desktop-automator && python3 -m pytest tests/test_vision_provider.py -v`
Expected: FAIL — `VisionProvider` and `DoubaoProvider` not defined

**Step 3: Write minimal implementation**

```python
# lib/vision_provider.py
import base64
import io
import json
import os
from typing import Protocol, runtime_checkable
from openai import OpenAI
from PIL import Image


@runtime_checkable
class VisionProvider(Protocol):
    def locate_element(self, current_bytes: bytes, reference_bytes: bytes, description: str) -> dict:
        ...


class DoubaoProvider:
    """Vision provider using doubao-seed-2.0-pro via OpenAI-compatible proxy."""

    def __init__(self, api_key=None, model="doubao-seed-2.0-pro",
                 base_url="http://192.168.136.124:8080/v1"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model
        self.base_url = base_url
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def locate_element(self, current_bytes, reference_bytes, description):
        current_b64 = base64.b64encode(current_bytes).decode("utf-8")

        prompt = f"""Look at this screenshot. I need to find "{description}".
The image dimensions are {self._get_image_dimensions(current_bytes)} pixels.

Respond ONLY with a JSON object:
- "found": true or false
- "x": pixel x-coordinate of the center of the element (if found)
- "y": pixel y-coordinate of the center of the element (if found)
- "confidence": your confidence level from 0.0 to 1.0
- "description": brief description of what you found"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url",
                         "image_url": {"url": f"data:image/png;base64,{current_b64}"}},
                        {"type": "text", "text": prompt}
                    ]
                }],
                max_tokens=300
            )
            text = response.choices[0].message.content
            # Extract JSON from response (may be wrapped in ```json``` blocks)
            result = self._parse_json_response(text)
            result["method"] = "doubao_vision"
            return result
        except Exception as e:
            return {"found": False, "confidence": 0.0, "method": "doubao_vision",
                    "description": f"API error: {str(e)[:200]}"}

    def _get_image_dimensions(self, image_bytes):
        img = Image.open(io.BytesIO(image_bytes))
        return f"{img.width}x{img.height}"

    def _parse_json_response(self, text):
        # Try direct JSON parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        # Try extracting from ```json``` block
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            try:
                return json.loads(text[start:end].strip())
            except json.JSONDecodeError:
                pass
        if "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            try:
                return json.loads(text[start:end].strip())
            except json.JSONDecodeError:
                pass
        # Find first { and last }
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        return {"found": False, "description": f"Could not parse response: {text[:200]}"}


class AnthropicProvider:
    """Vision provider using Anthropic Claude Vision API."""

    def __init__(self, api_key=None, model="claude-sonnet-4-6"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = model
        self.client = None
        if self.api_key:
            import anthropic
            self.client = anthropic.Anthropic(api_key=self.api_key)

    def locate_element(self, current_bytes, reference_bytes, description):
        if not self.client:
            return {"found": False, "method": "anthropic_vision",
                    "description": "No ANTHROPIC_API_KEY configured"}

        current_b64 = base64.b64encode(current_bytes).decode("utf-8")
        reference_b64 = base64.b64encode(reference_bytes).decode("utf-8")
        dims = f"{Image.open(io.BytesIO(current_bytes)).width}x{Image.open(io.BytesIO(current_bytes)).height}"

        prompt = f"""Look at these two screenshots. The first is the current screen ({dims} pixels). The second is a reference screenshot where the target element was clicked.

I need to find "{description}" on the current screen.

Respond ONLY with a JSON object:
- "found": true/false
- "x": pixel x-coordinate of the center of the element (if found)
- "y": pixel y-coordinate of the center of the element (if found)
- "confidence": your confidence from 0.0 to 1.0
- "description": brief description"""

        try:
            message = self.client.messages.create(
                model=self.model,
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
            text = message.content[0].text
            result = DoubaoProvider._parse_json_response(None, text)
            result["method"] = "anthropic_vision"
            return result
        except Exception as e:
            return {"found": False, "confidence": 0.0, "method": "anthropic_vision",
                    "description": f"API error: {str(e)[:200]}"}


def get_provider(name=None):
    """Get a VisionProvider by name. Default: doubao."""
    providers = {
        "doubao": DoubaoProvider,
        "anthropic": AnthropicProvider,
    }
    name = name or os.environ.get("VISION_PROVIDER", "doubao")
    cls = providers.get(name)
    if not cls:
        raise ValueError(f"Unknown vision provider: {name}. Available: {list(providers.keys())}")
    return cls()
```

**Step 4: Install openai SDK and run test**

```bash
pip3 install openai --user -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
cd desktop-automator && python3 -m pytest tests/test_vision_provider.py -v
```

Expected: PASS (4 tests, integration test requires proxy access — will pass if proxy is up)

**Step 5: Commit**

```bash
git add desktop-automator/lib/vision_provider.py desktop-automator/tests/test_vision_provider.py
git commit -m "feat(desktop-automator): add pluggable VisionProvider interface with DoubaoProvider and AnthropicProvider"
```

---

### Task 4: Rewrite recorder.py — Semantic recording with key merge

**Files:**
- Modify: `desktop-automator/scripts/recorder.py`
- Test: `desktop-automator/tests/test_recorder.py`

**Step 1: Write the failing test**

```python
# tests/test_recorder.py
import json
import os
import tempfile
import shutil
from scripts.recorder import KeyMerger

def test_key_merger_single_char():
    merger = KeyMerger()
    merger.add_key("a")
    result = merger.flush()
    assert result is None  # Single char not yet flushed (waiting for more or timeout)

def test_key_merger_consecutive_chars():
    merger = KeyMerger()
    merger.add_key("z")
    merger.add_key("h")
    merger.add_key("i")
    merger.add_key("s")
    merger.add_key("h")
    merger.add_key("i")
    result = merger.flush()
    assert result["action"] == "type"
    assert result["text"] == "zhishi"

def test_key_merger_special_key_flushes():
    merger = KeyMerger()
    merger.add_key("z")
    merger.add_key("h")
    # Special key (enter) should flush the accumulated text first
    pending = merger.flush_pending()
    assert pending["text"] == "zh"
    merger.add_key("enter")
    result = merger.flush()
    assert result["action"] == "keypress"
    assert result["key"] == "enter"

def test_key_merger_modifiers_not_merged():
    merger = KeyMerger()
    merger.add_key("ctrl")
    result = merger.flush()
    assert result["action"] == "keypress"
    assert result["key"] == "ctrl"

def test_key_merger_space_included():
    merger = KeyMerger()
    merger.add_key("h")
    merger.add_key("e")
    merger.add_key("l")
    merger.add_key("l")
    merger.add_key("o")
    merger.add_key("space")
    merger.add_key("w")
    merger.add_key("o")
    merger.add_key("r")
    merger.add_key("l")
    merger.add_key("d")
    result = merger.flush()
    assert result["text"] == "hello world"
```

**Step 2: Run test to verify it fails**

Run: `cd desktop-automator && python3 -m pytest tests/test_recorder.py -v`
Expected: FAIL — `KeyMerger` not defined

**Step 3: Write KeyMerger implementation**

```python
# Add KeyMerger class to scripts/recorder.py (full rewrite)

# scripts/recorder.py
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.screen_capture import capture_screen, save_screenshot
from lib.platform_detector import detect_platform, detect_display_server
from scripts.ocr_engine import OcrEngine
from pynput import mouse, keyboard

MODIFIER_KEYS = {
    "shift", "shift_l", "shift_r", "ctrl", "ctrl_l", "ctrl_r",
    "alt", "alt_l", "alt_r", "cmd", "cmd_l", "cmd_r",
    "super", "super_l", "super_r", "win", "win_l", "win_r"
}

SPACE_KEYS = {"space"}  # Keys that should be included in text as spaces

class KeyMerger:
    """Merges consecutive character keypresses into semantic 'type' events."""

    def __init__(self):
        self.buffer = []
        self.accumulating = False

    def add_key(self, key_str):
        """Add a keypress. Returns flushed event if a non-character key interrupts."""
        if key_str.lower() in MODIFIER_KEYS:
            # Modifier key: flush any pending text, then return modifier as keypress
            flushed = self._flush_buffer()
            self.buffer = []
            self.accumulating = False
            return flushed, {"action": "keypress", "key": key_str}

        if key_str.lower() in SPACE_KEYS:
            self.buffer.append(" ")
            self.accumulating = True
            return None, None

        if len(key_str) == 1 and key_str.isprintable():
            # Regular character: accumulate
            self.buffer.append(key_str)
            self.accumulating = True
            return None, None
        else:
            # Special key (enter, tab, esc, etc.): flush pending, return special
            flushed = self._flush_buffer()
            self.buffer = []
            self.accumulating = False
            return flushed, {"action": "keypress", "key": key_str}

    def flush_pending(self):
        """Flush any pending accumulated text without adding a new key."""
        return self._flush_buffer()

    def flush(self):
        """Flush and return the accumulated text as a type event."""
        result = self._flush_buffer()
        self.buffer = []
        self.accumulating = False
        return result

    def _flush_buffer(self):
        if not self.buffer:
            return None
        text = "".join(self.buffer).strip()
        if not text:
            return None
        return {"action": "type", "text": text}


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
        self.key_merger = KeyMerger()
        self.ocr = OcrEngine()

    def start(self):
        os.makedirs(self.screenshots_dir, exist_ok=True)
        print(f"Recording task '{self.task_name}'...")
        print("Press Esc to stop recording.")

        self.mouse_listener = mouse.Listener(on_click=self._on_click)
        self.key_listener = keyboard.Listener(
            on_press=self._on_key_press,
            on_release=self._on_key_release
        )
        self.mouse_listener.start()
        self.key_listener.start()

        self.mouse_listener.join()
        self.key_listener.join()
        self._save_task()

    def stop(self):
        self.recording = False
        # Flush any pending key buffer
        pending = self.key_merger.flush()
        if pending:
            self._record_step(pending["action"], text=pending.get("text"),
                              key=pending.get("key"),
                              description=f"type '{pending.get('text', '')}'")
        if self.mouse_listener:
            self.mouse_listener.stop()
        if self.key_listener:
            self.key_listener.stop()

    def _on_click(self, x, y, button, pressed):
        if not self.recording:
            return
        if pressed:
            # Flush pending keys before recording click
            pending = self.key_merger.flush()
            if pending:
                self._record_step(pending["action"], text=pending.get("text"),
                                  key=pending.get("key"),
                                  description=f"type '{pending.get('text', '')}'")
            self._record_step("click",
                              position={"x": x, "y": y},
                              description=f"click {button.name} at ({x},{y})")

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

        flushed, special = self.key_merger.add_key(key_str)
        if flushed:
            self._record_step(flushed["action"], text=flushed.get("text"),
                              key=flushed.get("key"),
                              description=f"type '{flushed.get('text', '')}'")
        if special:
            self._record_step(special["action"], key=special.get("key"),
                              description=f"key press {special.get('key', '')}")

    def _record_step(self, action, position=None, key=None, text=None, description=""):
        self.step_counter += 1
        screenshot_name = f"step-{self.step_counter:03d}.png"
        screenshot_path = os.path.join(self.screenshots_dir, screenshot_name)
        img = capture_screen()
        save_screenshot(img, screenshot_path)

        # Semantic annotation: extract nearby text via OCR
        nearby_text = []
        try:
            blocks = self.ocr.extract_text_blocks(img)
            if position and blocks:
                # Find text near the click position
                for b in blocks:
                    if b["confidence"] >= 30:
                        bx = b["x"] + b["width"] // 2
                        by = b["y"] + b["height"] // 2
                        dist = abs(bx - position["x"]) + abs(by - position["y"])
                        if dist < 200:
                            nearby_text.append(b["text"])
        except Exception:
            pass

        step = {
            "id": self.step_counter,
            "action": action,
            "position": position,
            "screenshot": screenshot_name,
            "key": key,
            "text": text,
            "description": description,
            "nearby_text": nearby_text[:5]
        }
        self.steps.append(step)
        print(f"  Step {self.step_counter}: {description}")

    def _save_task(self):
        task_data = {
            "name": self.task_name,
            "platform": detect_platform(),
            "display_server": detect_display_server(),
            "created": datetime.now(timezone.utc).isoformat(),
            "steps": self.steps
        }
        task_path = os.path.join(self.task_dir, "task.json")
        with open(task_path, "w") as f:
            json.dump(task_data, f, indent=2)
        print(f"\nRecording saved: {self.task_dir}")
        print(f"  {len(self.steps)} semantic steps recorded")

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

**Step 4: Run test to verify it passes**

Run: `cd desktop-automator && python3 -m pytest tests/test_recorder.py -v`
Expected: PASS (5 tests for KeyMerger)

**Step 5: Commit**

```bash
git add desktop-automator/scripts/recorder.py desktop-automator/tests/test_recorder.py
git commit -m "feat(desktop-automator): semantic recording with KeyMerger for text input events"
```

---

### Task 5: Rewrite player.py — Computer-use loop with Vision Provider

**Files:**
- Modify: `desktop-automator/scripts/player.py`
- Test: `desktop-automator/tests/test_player.py`

**Step 1: Write the failing test**

```python
# tests/test_player.py
import json
import os
import tempfile
import shutil
from scripts.player import Player

def setup_task(tmp_path, task_name, steps):
    task_dir = os.path.join(tmp_path, task_name)
    screenshots_dir = os.path.join(task_dir, "screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    task_data = {
        "name": task_name,
        "platform": "linux",
        "display_server": "x11",
        "created": "2026-06-15T10:00:00Z",
        "steps": steps
    }
    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f)
    return task_dir

def test_player_init():
    tmp = tempfile.mkdtemp()
    steps = [
        {"id": 1, "action": "click", "description": "Click button",
         "position": {"x": 100, "y": 200}, "nearby_text": ["Submit"],
         "screenshot": "step-001.png", "key": None, "text": None}
    ]
    setup_task(tmp, "test-task", steps)
    player = Player("test-task", tasks_dir=tmp)
    assert player.task_name == "test-task"
    assert len(player.task_data["steps"]) == 1
    shutil.rmtree(tmp)

def test_player_step_format():
    """Verify Player understands new semantic step format"""
    tmp = tempfile.mkdtemp()
    steps = [
        {"id": 1, "action": "type", "description": "Type search query",
         "text": "天气", "position": {"x": 400, "y": 300},
         "nearby_text": ["Google", "搜索"], "screenshot": "step-001.png",
         "key": None}
    ]
    setup_task(tmp, "test-task", steps)
    player = Player("test-task", tasks_dir=tmp)
    step = player.task_data["steps"][0]
    assert step["action"] == "type"
    assert step["text"] == "天气"
    assert step["nearby_text"] == ["Google", "搜索"]
    shutil.rmtree(tmp)
```

**Step 2: Run test to verify it fails**

Run: `cd desktop-automator && python3 -m pytest tests/test_player.py -v`
Expected: FAIL — `Player` with new format not defined

**Step 3: Write minimal implementation**

```python
# scripts/player.py
import argparse
import json
import os
import sys
import time
import io

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager
from lib.screen_capture import capture_screen, save_screenshot
from lib.coordinate_adapter import CoordinateAdapter
from lib.platform_detector import detect_platform, get_screen_size, detect_display_server
from lib.vision_provider import get_provider
import pyautogui

pyautogui.PAUSE = 0.3


class Player:
    def __init__(self, task_name, tasks_dir=None, mode="flexible",
                 delay=1.0, provider_name=None):
        self.tm = TaskManager(tasks_dir)
        self.task_name = task_name
        self.mode = mode
        self.delay = delay
        self.task_data = self.tm.load_task(task_name)
        self.task_dir = os.path.join(self.tm.tasks_dir, task_name)
        self.screenshots_dir = os.path.join(self.task_dir, "screenshots")
        self.vision = get_provider(provider_name)
        self.results = []

    def replay(self):
        print(f"Replaying task '{self.task_name}' ({len(self.task_data['steps'])} steps)...")
        platform = detect_platform()
        display_server = detect_display_server()
        task_ds = self.task_data.get("display_server", "unknown")
        if platform != self.task_data["platform"]:
            print(f"Warning: recorded on {self.task_data['platform']}, running on {platform}")
        if display_server != task_ds:
            print(f"Warning: recorded on {task_ds} display server, running on {display_server}")

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
        print(f"\nStep {step['id']}: {step.get('description', step['action'])}")

        action = step["action"]

        if action == "type":
            text = step.get("text", "")
            if text:
                pyautogui.write(text, interval=0.05)
                print(f"  Typed: '{text}'")
                return {"step_id": step["id"], "status": "success",
                        "method": "direct_type", "text": text}
            return {"step_id": step["id"], "status": "failed",
                    "reason": "no text in type step"}

        elif action == "click":
            ref_img_path = os.path.join(self.screenshots_dir, step.get("screenshot", ""))
            current_img = capture_screen()

            # Strategy 1: Vision Provider (primary in V2)
            target_pos = None
            if step.get("description") or step.get("nearby_text"):
                description = self._build_vision_prompt(step)
                from io import BytesIO
                buf = BytesIO()
                current_img.save(buf, format="PNG")
                current_bytes = buf.getvalue()

                # Load reference screenshot if available
                ref_bytes = current_bytes  # fallback to current if ref missing
                if os.path.exists(ref_img_path):
                    from PIL import Image
                    ref_img = Image.open(ref_img_path)
                    buf2 = BytesIO()
                    ref_img.save(buf2, format="PNG")
                    ref_bytes = buf2.getvalue()

                vision_result = self.vision.locate_element(
                    current_bytes, ref_bytes, description
                )
                if vision_result.get("found") and vision_result.get("confidence", 0) >= 0.5:
                    target_pos = {
                        "x": vision_result["x"],
                        "y": vision_result["y"],
                        "method": vision_result.get("method", "vision")
                    }
                    print(f"  Vision found at ({target_pos['x']}, {target_pos['y']}) "
                          f"confidence={vision_result.get('confidence', 0):.2f}")

            # Strategy 2: Coordinate fallback (last resort)
            if not target_pos and step.get("position"):
                adapted = adapter.adapt(
                    step["position"]["x"], step["position"]["y"],
                    current_size[0], current_size[1]
                )
                target_pos = {"x": adapted[0], "y": adapted[1], "method": "original_coords"}
                print(f"  Using original coordinates ({adapted[0]}, {adapted[1]})")

            if target_pos:
                pyautogui.click(target_pos["x"], target_pos["y"])
                return {"step_id": step["id"], "status": "success",
                        "method": target_pos["method"],
                        "position": (target_pos["x"], target_pos["y"])}
            return {"step_id": step["id"], "status": "failed",
                    "reason": "could not locate element"}

        elif action == "keypress":
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
            return {"step_id": step["id"], "status": "success",
                    "method": "keypress", "key": key}

        return {"step_id": step["id"], "status": "unknown", "action": action}

    def _build_vision_prompt(self, step):
        """Build a description for the vision provider from semantic step data."""
        parts = []
        if step.get("description"):
            parts.append(step["description"])
        if step.get("nearby_text"):
            nearby = ", ".join(step["nearby_text"])
            parts.append(f"near text labels: {nearby}")
        if step.get("position"):
            parts.append(f"originally at position ({step['position']['x']}, {step['position']['y']})")
        return " | ".join(parts) if parts else "target element"

    def _print_summary(self):
        success = sum(1 for r in self.results if r["status"] == "success")
        failed = sum(1 for r in self.results if r["status"] == "failed")
        methods = {}
        for r in self.results:
            m = r.get("method", "unknown")
            methods[m] = methods.get(m, 0) + 1
        print(f"\nReplay complete: {success} succeeded, {failed} failed out of {len(self.results)} steps")
        print(f"  Methods used: {methods}")


def main():
    parser = argparse.ArgumentParser(description="Replay recorded desktop operations")
    parser.add_argument("--task", required=True, help="Task name to replay")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    parser.add_argument("--mode", choices=["strict", "flexible"], default="flexible",
                        help="Error handling mode")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Delay between steps (seconds)")
    parser.add_argument("--provider", choices=["doubao", "anthropic"], default=None,
                        help="Vision provider to use")
    args = parser.parse_args()
    player = Player(args.task, args.tasks_dir, args.mode, args.delay, args.provider)
    player.replay()

if __name__ == "__main__":
    main()
```

**Step 4: Run test to verify it passes**

Run: `cd desktop-automator && python3 -m pytest tests/test_player.py -v`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add desktop-automator/scripts/player.py desktop-automator/tests/test_player.py
git commit -m "feat(desktop-automator): computer-use replay loop with Vision Provider as primary strategy"
```

---

### Task 6: Update task_manager.py — New semantic task format

**Files:**
- Modify: `desktop-automator/lib/task_manager.py`
- Test: `desktop-automator/tests/test_task_manager.py`

**Step 1: Write the failing test**

```python
# tests/test_task_manager.py
import json
import os
import tempfile
import shutil
from lib.task_manager import TaskManager

def setup_v2_task(tmp_path, task_name):
    task_dir = os.path.join(tmp_path, task_name)
    os.makedirs(os.path.join(task_dir, "screenshots"), exist_ok=True)
    task_data = {
        "name": task_name,
        "platform": "linux",
        "display_server": "wayland",
        "created": "2026-06-15T10:00:00Z",
        "steps": [
            {"id": 1, "action": "click", "description": "Click browser icon",
             "position": {"x": 100, "y": 200}, "nearby_text": ["Firefox"],
             "screenshot": "step-001.png", "key": None, "text": None},
            {"id": 2, "action": "type", "description": "Type search query",
             "text": "天气", "position": {"x": 400, "y": 300},
             "nearby_text": ["Google"], "screenshot": "step-002.png",
             "key": None}
        ]
    }
    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f)
    return task_dir

def test_list_tasks_v2():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp, "test-task-v2")
    tm = TaskManager(tasks_dir=tmp)
    tasks = tm.list_tasks()
    assert "test-task-v2" in tasks
    shutil.rmtree(tmp)

def test_load_task_v2():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp, "test-task-v2")
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("test-task-v2")
    assert data["display_server"] == "wayland"
    assert data["steps"][0]["action"] == "click"
    assert data["steps"][1]["action"] == "type"
    assert data["steps"][1]["text"] == "天气"
    shutil.rmtree(tmp)

def test_validate_task_v2():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp, "test-task-v2")
    tm = TaskManager(tasks_dir=tmp)
    data = tm.load_task("test-task-v2")
    assert tm.validate_task(data) is True

def test_validate_task_missing_required_fields():
    tm = TaskManager(tasks_dir="/tmp/nonexistent")
    bad_data = {"name": "bad", "steps": [{"id": 1}]}  # missing "action"
    assert tm.validate_task(bad_data) is False

def test_get_task_info():
    tmp = tempfile.mkdtemp()
    setup_v2_task(tmp, "test-task-v2")
    tm = TaskManager(tasks_dir=tmp)
    info = tm.get_task_info("test-task-v2")
    assert info["step_count"] == 2
    assert info["platform"] == "linux"
    assert info["display_server"] == "wayland"
    shutil.rmtree(tmp)
```

**Step 2: Run test to verify it fails**

Run: `cd desktop-automator && python3 -m pytest tests/test_task_manager.py -v`
Expected: FAIL — `get_task_info` not defined

**Step 3: Write implementation**

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

    def get_task_info(self, name):
        data = self.load_task(name)
        return {
            "name": data["name"],
            "step_count": len(data["steps"]),
            "platform": data.get("platform", "unknown"),
            "display_server": data.get("display_server", "unknown"),
            "created": data.get("created", ""),
        }
```

**Step 4: Run test to verify it passes**

Run: `cd desktop-automator && python3 -m pytest tests/test_task_manager.py -v`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add desktop-automator/lib/task_manager.py desktop-automator/tests/test_task_manager.py
git commit -m "feat(desktop-automator): update TaskManager for V2 semantic task format with get_task_info"
```

---

### Task 7: Update task_manager CLI and integration test

**Files:**
- Modify: `desktop-automator/scripts/task_manager.py`
- Modify: `desktop-automator/tests/test_integration.py`

**Step 1: Write the failing test**

```python
# tests/test_integration.py
import json
import os
import tempfile
import shutil
from PIL import Image, ImageDraw
from lib.task_manager import TaskManager
from lib.screen_capture import save_screenshot
from lib.coordinate_adapter import CoordinateAdapter
from lib.platform_detector import detect_display_server
from lib.vision_provider import DoubaoProvider

def test_v2_task_format_integration():
    tmp = tempfile.mkdtemp()
    try:
        task_name = "integration-v2"
        task_dir = os.path.join(tmp, task_name)
        screenshots_dir = os.path.join(task_dir, "screenshots")
        os.makedirs(screenshots_dir, exist_ok=True)

        # Create a real screenshot (not black!)
        img = Image.new("RGB", (800, 600), (240, 240, 240))
        draw = ImageDraw.Draw(img)
        draw.rectangle([300, 200, 500, 250], fill=(0, 120, 215))
        draw.text((350, 210), "Submit", fill=(255, 255, 255))
        save_screenshot(img, os.path.join(screenshots_dir, "step-001.png"))

        task_data = {
            "name": task_name,
            "platform": "linux",
            "display_server": detect_display_server(),
            "created": "2026-06-15T10:00:00Z",
            "steps": [
                {"id": 1, "action": "click",
                 "description": "Click Submit button",
                 "position": {"x": 400, "y": 225},
                 "nearby_text": ["Submit"],
                 "screenshot": "step-001.png",
                 "key": None, "text": None}
            ]
        }
        with open(os.path.join(task_dir, "task.json"), "w") as f:
            json.dump(task_data, f)

        # Load and validate
        tm = TaskManager(tasks_dir=tmp)
        loaded = tm.load_task(task_name)
        assert tm.validate_task(loaded) is True
        assert loaded["display_server"] in ("wayland", "x11", "unknown")

        # Vision provider integration test
        provider = DoubaoProvider()
        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
        result = provider.locate_element(
            img_bytes, img_bytes, "Submit button | near text labels: Submit"
        )
        assert result["found"] is True
        # Coordinate tolerance: allow ±150px (doubao accuracy ~25px on simple UI)
        assert abs(result["x"] - 400) < 200
    finally:
        shutil.rmtree(tmp)
```

**Step 2: Run test to verify it fails then passes**

Run: `cd desktop-automator && python3 -m pytest tests/test_integration.py -v`
Expected: May need proxy access for doubao test

**Step 3: Update task_manager CLI script**

```python
# scripts/task_manager.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager

def main():
    parser = argparse.ArgumentParser(description="Manage recorded desktop tasks")
    parser.add_argument("command", choices=["list", "info", "delete"],
                        help="Command to execute")
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
        import shutil
        shutil.rmtree(task_dir)
        print(f"Deleted task: {args.name}")

if __name__ == "__main__":
    main()
```

**Step 4: Run integration test**

Run: `cd desktop-automator && python3 -m pytest tests/test_integration.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add desktop-automator/scripts/task_manager.py desktop-automator/tests/test_integration.py
git commit -m "feat(desktop-automator): updated CLI task_manager and V2 integration test with Vision Provider"
```

---

### Task 8: Update requirements.txt, package.json, SKILL.md, README.md

**Files:**
- Modify: `desktop-automator/requirements.txt`
- Modify: `desktop-automator/package.json`
- Modify: `.claude/skills/desktop-automator/SKILL.md`
- Modify: `desktop-automator/README.md`

**Step 1: Update requirements.txt**

```txt
# desktop-automator/requirements.txt
pyautogui>=0.9.54
pynput>=1.7.7
mss>=9.0.1
Pillow>=10.0.0
pytesseract>=0.3.10
anthropic>=0.40.0
openai>=1.0.0
numpy>=1.24.0
pytest>=8.0.0
```

**Step 2: Update package.json**

```json
{
  "name": "desktop-automator",
  "version": "2.0.0",
  "description": "Claude Code skill for recording and replaying desktop operations with LLM-driven vision recognition",
  "scripts": {
    "record": "python3 scripts/recorder.py",
    "replay": "python3 scripts/player.py",
    "list": "python3 scripts/task_manager.py list",
    "test": "cd desktop-automator && python3 -m pytest tests/ -v"
  },
  "keywords": ["desktop", "automation", "rpa", "vision", "computer-use", "doubao"],
  "author": "Claude Code",
  "license": "MIT"
}
```

**Step 3: Update SKILL.md**

Read `.claude/skills/desktop-automator/SKILL.md` and rewrite to reflect V2 architecture: semantic recording, computer-use replay, DoubaoProvider default, Wayland support, --provider flag.

Key changes:
- Record: mention key merge and semantic steps
- Replay: mention Vision Provider as primary, --provider flag
- List: mention display_server in output
- Prerequisites: add grim for Wayland, openai SDK
- Note: doubao-seed-2.0-pro is default Vision Provider via proxy

**Step 4: Update README.md**

Update to reflect V2 changes: architecture diagram, Vision Provider choice, Wayland support, semantic task format, performance comparison table.

**Step 5: Commit**

```bash
git add desktop-automator/requirements.txt desktop-automator/package.json .claude/skills/desktop-automator/SKILL.md desktop-automator/README.md
git commit -m "docs(desktop-automator): update docs and config for V2 refactor — doubao provider, Wayland, semantic format"
```

---

### Task 9: Delete obsolete files and run full test suite

**Files:**
- Delete: `desktop-automator/scripts/ocr_engine.py` (moved to recording-only annotation, not needed as import by player)
- Delete: `desktop-automator/scripts/vision_api.py` (replaced by `lib/vision_provider.py`)
- Delete: `desktop-automator/tests/test_ocr_engine.py` (OCR no longer primary strategy)
- Delete: `desktop-automator/tests/test_vision_api.py` (replaced by test_vision_provider.py)
- Keep: `desktop-automator/scripts/ocr_engine.py` (still used by recorder for annotation)
- Keep: `desktop-automator/tests/test_coordinate.py` (coordinate adapter still used for fallback)

**Step 1: Remove obsolete vision_api.py (replaced by vision_provider.py)**

```bash
rm desktop-automator/scripts/vision_api.py
rm desktop-automator/tests/test_vision_api.py
```

**Step 2: Run full test suite**

```bash
cd desktop-automator && python3 -m pytest tests/ -v
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add -A desktop-automator/
git commit -m "refactor(desktop-automator): remove obsolete vision_api.py, V2 test suite passes"
```

---

### Task 10: Live test — Record and replay a task

**Step 1: Record a new task**

```bash
cd desktop-automator && python3 scripts/recorder.py --name test-v2-search
```

User performs: open browser → type "hello" → press Enter → Esc to stop

Expected: Semantic steps (not 200+ raw events). Key presses merged. Nearby text extracted.

**Step 2: Verify recording data**

```bash
python3 -c "
import json
d = json.load(open('desktop-automator/tasks/test-v2-search/task.json'))
print(f'Steps: {len(d[\"steps\"])}')
print(f'Display server: {d[\"display_server\"]}')
for s in d['steps']:
    print(f'  Step {s[\"id\"]}: {s[\"action\"]} - {s.get(\"description\",\"\")}')
    if s.get('text'):
        print(f'    text: {s[\"text\"]}')
    if s.get('nearby_text'):
        print(f'    nearby: {s[\"nearby_text\"]}')
"
```

Expected: ~5-10 semantic steps instead of 200+. Screenshots are real (not black).

**Step 3: Replay the task**

```bash
cd desktop-automator && python3 scripts/player.py --task test-v2-search --mode flexible --delay 1.0
```

Expected: Vision Provider locates elements, actions execute, summary shows methods used.

**Step 4: Commit (no code changes, just verification)**

No commit needed — this is a verification step.
