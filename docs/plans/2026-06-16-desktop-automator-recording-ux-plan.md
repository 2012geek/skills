# Desktop Automator Recording UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an OSD floating window, signal handling, and status file to the recorder so users can see recording state, step count, elapsed time, and stop via a button instead of only Esc.

**Architecture:** Replace the recorder's blocking `listener.join()` model with a tkinter `mainloop()` on the main thread. Listener callbacks schedule UI updates via `root.after()`. A `.recording` status file enables external status queries. SIGTERM/SIGINT handlers ensure data saves on interruption.

**Tech Stack:** Python 3.10, tkinter (built-in), pynput, signal, json

---

### Task 1: RecordingStatus — Status File Manager

**Files:**
- Create: `desktop-automator/lib/recording_status.py`
- Test: `desktop-automator/tests/test_recording_status.py`

**Step 1: Write the failing test**

```python
# tests/test_recording_status.py
import json
import os
import tempfile
import shutil
import time

sys_path = os.path.join(os.path.dirname(__file__), "..")
import sys
sys.path.insert(0, sys_path)
sys.path.insert(0, os.path.join(sys_path, "lib"))

from lib.recording_status import RecordingStatus


def test_create_status_file():
    """Creating a RecordingStatus writes .recording file with task_name, pid, started."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        status_path = os.path.join(tmp, "test-task", ".recording")
        assert os.path.exists(status_path)
        with open(status_path) as f:
            data = json.load(f)
        assert data["task_name"] == "test-task"
        assert data["pid"] == os.getpid()
        assert "started" in data
        assert data["steps_so_far"] == 0
    finally:
        shutil.rmtree(tmp)


def test_update_steps_so_far():
    """update_steps() updates steps_so_far in the status file."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        rs.update_steps(5)
        status_path = os.path.join(tmp, "test-task", ".recording")
        with open(status_path) as f:
            data = json.load(f)
        assert data["steps_so_far"] == 5
    finally:
        shutil.rmtree(tmp)


def test_remove_status_file():
    """remove() deletes the .recording file."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        status_path = os.path.join(tmp, "test-task", ".recording")
        assert os.path.exists(status_path)
        rs.remove()
        assert not os.path.exists(status_path)
    finally:
        shutil.rmtree(tmp)


def test_check_active_recording():
    """check_active() returns dict when .recording exists and PID is alive."""
    tmp = tempfile.mkdtemp()
    try:
        rs = RecordingStatus(task_name="test-task", tasks_dir=tmp)
        rs.create()
        rs.update_steps(3)
        result = RecordingStatus.check_active(tmp)
        assert result is not None
        assert result["task_name"] == "test-task"
        assert result["pid"] == os.getpid()
        assert result["steps_so_far"] == 3
        assert result["pid_alive"] is True
    finally:
        shutil.rmtree(tmp)


def test_check_active_no_recording():
    """check_active() returns None when no .recording file exists."""
    tmp = tempfile.mkdtemp()
    try:
        result = RecordingStatus.check_active(tmp)
        assert result is None
    finally:
        shutil.rmtree(tmp)


def test_check_active_dead_pid():
    """check_active() returns dict with pid_alive=False when PID is not running."""
    tmp = tempfile.mkdtemp()
    try:
        # Create a .recording file with a dead PID
        task_dir = os.path.join(tmp, "dead-task")
        os.makedirs(task_dir)
        status_data = {
            "task_name": "dead-task",
            "pid": 999999999,  # Unlikely PID
            "started": "2026-06-16T10:00:00Z",
            "display_server": "wayland",
            "steps_so_far": 3,
        }
        with open(os.path.join(task_dir, ".recording"), "w") as f:
            json.dump(status_data, f)
        result = RecordingStatus.check_active(tmp)
        assert result is not None
        assert result["pid_alive"] is False
    finally:
        shutil.rmtree(tmp)
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_recording_status.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'lib.recording_status'`

**Step 3: Write minimal implementation**

```python
# lib/recording_status.py
import json
import os
import psutil
from datetime import datetime, timezone


class RecordingStatus:
    """Manages .recording status file for tracking active recording state.

    The .recording file lives at tasks/<task-name>/.recording and contains
    task_name, pid, started timestamp, display_server, and steps_so_far.
    It enables external status queries and residual recording detection.
    """

    def __init__(self, task_name, tasks_dir=None):
        self.task_name = task_name
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.tasks_dir = tasks_dir
        self.task_dir = os.path.join(tasks_dir, task_name)
        self.status_path = os.path.join(self.task_dir, ".recording")

    def create(self, display_server=None):
        """Create .recording file with initial state (steps_so_far=0)."""
        os.makedirs(self.task_dir, exist_ok=True)
        data = {
            "task_name": self.task_name,
            "pid": os.getpid(),
            "started": datetime.now(timezone.utc).isoformat(),
            "display_server": display_server or "unknown",
            "steps_so_far": 0,
        }
        with open(self.status_path, "w") as f:
            json.dump(data, f, indent=2)

    def update_steps(self, count):
        """Update steps_so_far in the status file."""
        with open(self.status_path, "r") as f:
            data = json.load(f)
        data["steps_so_far"] = count
        with open(self.status_path, "w") as f:
            json.dump(data, f, indent=2)

    def remove(self):
        """Delete the .recording file (called when recording ends successfully)."""
        if os.path.exists(self.status_path):
            os.remove(self.status_path)

    @staticmethod
    def check_active(tasks_dir=None):
        """Scan tasks_dir for any .recording file and return status dict.

        Returns None if no active recording found. Returns dict with
        pid_alive=True/False if a .recording file exists.
        """
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        if not os.path.exists(tasks_dir):
            return None

        for name in os.listdir(tasks_dir):
            status_path = os.path.join(tasks_dir, name, ".recording")
            if not os.path.exists(status_path):
                continue
            with open(status_path, "r") as f:
                data = json.load(f)
            try:
                pid_alive = psutil.pid_exists(data["pid"])
            except Exception:
                pid_alive = False
            data["pid_alive"] = pid_alive
            return data

        return None
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_recording_status.py -v`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add desktop-automator/lib/recording_status.py desktop-automator/tests/test_recording_status.py
git commit -m "feat(desktop-automator): add RecordingStatus — .recording status file manager"
```

---

### Task 2: OSDWindow — tkinter Floating Window

**Files:**
- Create: `desktop-automator/lib/osd_window.py`
- Test: `desktop-automator/tests/test_osd_window.py`

**Step 1: Write the failing test**

Note: tkinter tests require a display server. We use a headless-safe approach by mocking tkinter where needed and testing the non-UI logic separately.

```python
# tests/test_osd_window.py
import os
import sys
import time
from unittest.mock import MagicMock, patch

sys_path = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, sys_path)
sys.path.insert(0, os.path.join(sys_path, "lib"))

from lib.osd_window import OSDWindow


def test_osd_window_creation():
    """OSDWindow can be created with step=0 and start_time."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    assert osd.step_count == 0
    assert osd.start_time > 0
    assert osd._stop_callback is None


def test_osd_window_creation_with_callback():
    """OSDWindow stores stop_callback for stop button."""
    callback = MagicMock()
    osd = OSDWindow(step_count=0, start_time=time.time(), stop_callback=callback)
    assert osd._stop_callback is callback


def test_osd_window_update_steps():
    """update_steps() changes step_count value."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    osd.update_steps(5)
    assert osd.step_count == 5


def test_osd_window_format_elapsed_time():
    """_format_elapsed() converts seconds to MM:SS format."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    assert osd._format_elapsed(0) == "00:00"
    assert osd._format_elapsed(61) == "01:01"
    assert osd._format_elapsed(3661) == "61:01"


def test_osd_window_stop_button_triggers_callback():
    """Clicking stop button calls stop_callback if set."""
    callback = MagicMock()
    osd = OSDWindow(step_count=0, start_time=time.time(), stop_callback=callback)
    osd._on_stop_click()
    callback.assert_called_once()


def test_osd_window_stop_button_no_callback():
    """Clicking stop button with no callback does not crash."""
    osd = OSDWindow(step_count=0, start_time=time.time())
    osd._on_stop_click()  # Should not raise
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_osd_window.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'lib.osd_window'`

**Step 3: Write minimal implementation**

```python
# lib/osd_window.py
import tkinter as tk
import time


class OSDWindow:
    """tkinter floating OSD window for recording feedback.

    Displays recording state (REC indicator), step count, elapsed time,
    and a Stop Recording button. Window is always-on-top, semi-transparent,
    and positioned at the top-right corner of the screen.

    All tkinter operations must happen on the main thread. Listener callbacks
    from pynput (which run on sub-threads) must use root.after() to schedule
    UI updates on the main thread.
    """

    def __init__(self, step_count=0, start_time=None, stop_callback=None):
        self.step_count = step_count
        self.start_time = start_time or time.time()
        self._stop_callback = stop_callback
        self.root = None
        self._step_label = None
        self._time_label = None
        self._timer_id = None

    def show(self):
        """Create and show the OSD window. Must be called on the main thread."""
        self.root = tk.Tk()
        self.root.title("Desktop Automator")
        self.root.overrideredirect(True)  # No window decorations
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.85)

        # Position at top-right corner
        self.root.update_idletasks()
        screen_w = self.root.winfo_screenwidth()
        win_w = 280
        win_h = 90
        x_pos = screen_w - win_w - 20
        y_pos = 20
        self.root.geometry(f"{win_w}x{win_h}+{x_pos}+{y_pos}")

        # Configure background
        self.root.configure(bg="#1a1a2e")

        # REC indicator
        rec_frame = tk.Frame(self.root, bg="#1a1a2e")
        rec_frame.pack(fill="x", padx=10, pady=(10, 5))

        rec_dot = tk.Label(rec_frame, text="REC", fg="#ff4444", bg="#1a1a2e",
                           font=("Helvetica", 14, "bold"))
        rec_dot.pack(side="left")

        self._step_label = tk.Label(rec_frame, text=f"Step: {self.step_count}",
                                    fg="#ffffff", bg="#1a1a2e",
                                    font=("Helvetica", 12))
        self._step_label.pack(side="left", padx=(20, 0))

        self._time_label = tk.Label(rec_frame, text=self._format_elapsed(0),
                                    fg="#aaaaaa", bg="#1a1a2e",
                                    font=("Helvetica", 12))
        self._time_label.pack(side="right")

        # Stop button
        stop_btn = tk.Button(self.root, text="Stop Recording",
                             command=self._on_stop_click,
                             bg="#e74c3c", fg="white",
                             font=("Helvetica", 11, "bold"),
                             relief="flat", cursor="hand2")
        stop_btn.pack(fill="x", padx=10, pady=(5, 10))

        # Start elapsed time timer
        self._tick_timer()

        self.root.protocol("WM_DELETE_WINDOW", self._on_stop_click)
        self.root.mainloop()

    def update_steps(self, count):
        """Update step count display. Safe to call from any thread."""
        self.step_count = count
        if self.root and self._step_label:
            self.root.after(0, self._refresh_step_label)

    def _refresh_step_label(self):
        """Refresh step label on the main thread."""
        if self._step_label:
            self._step_label.config(text=f"Step: {self.step_count}")

    def _tick_timer(self):
        """Update elapsed time display every second."""
        if not self.root:
            return
        elapsed = int(time.time() - self.start_time)
        if self._time_label:
            self._time_label.config(text=self._format_elapsed(elapsed))
        self._timer_id = self.root.after(1000, self._tick_timer)

    def _format_elapsed(self, seconds):
        """Format elapsed seconds as MM:SS."""
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes:02d}:{secs:02d}"

    def _on_stop_click(self):
        """Handle stop button click or window close."""
        if self._timer_id and self.root:
            self.root.after_cancel(self._timer_id)
        if self._stop_callback:
            self._stop_callback()
        if self.root:
            self.root.destroy()
            self.root = None

    def destroy(self):
        """Destroy the window from external code."""
        if self.root:
            self.root.after(0, self._on_stop_click)
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_osd_window.py -v`
Expected: All 6 tests PASS

Note: Tests only cover non-UI logic (step_count, elapsed format, callback). The `show()` method creates a real tkinter window and cannot be tested without a display server. Integration verification is done in Task 4.

**Step 5: Commit**

```bash
git add desktop-automator/lib/osd_window.py desktop-automator/tests/test_osd_window.py
git commit -m "feat(desktop-automator): add OSDWindow — tkinter floating window for recording feedback"
```

---

### Task 3: Recorder Rewrite — Signal Handling + OSD + Status File Integration

**Files:**
- Modify: `desktop-automator/scripts/recorder.py`
- Modify: `desktop-automator/tests/test_recorder.py`

This is the core task. The recorder.py rewrite changes the threading model, adds signal handling, integrates OSDWindow and RecordingStatus.

**Step 1: Write the failing test for signal handling**

```python
# tests/test_recorder.py — add these tests to the existing file

import signal
import tempfile
import json
import os
import shutil
from unittest.mock import patch, MagicMock

# ... existing KeyMerger tests remain ...

def test_recorder_signal_handler_saves_data():
    """SIGTERM handler should call stop() which flushes buffer and saves task data."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="signal-test", tasks_dir=tmp)
        recorder.recording = True
        recorder.steps = [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200},
             "screenshot": "step-001.png", "key": None, "text": None,
             "description": "test click", "nearby_text": None}
        ]

        # Simulate signal handler calling stop
        recorder.stop()

        # Verify task.json was saved
        task_path = os.path.join(tmp, "signal-test", "task.json")
        assert os.path.exists(task_path)
        with open(task_path) as f:
            data = json.load(f)
        assert data["name"] == "signal-test"
        assert len(data["steps"]) == 1
    finally:
        shutil.rmtree(tmp)


def test_recorder_status_file_created_on_start():
    """start() creates .recording status file."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="status-test", tasks_dir=tmp)
        # We can't actually call start() (it blocks), but we can test
        # that the RecordingStatus object is created
        assert recorder._recording_status is not None
        assert recorder._recording_status.task_name == "status-test"
    finally:
        shutil.rmtree(tmp)


def test_recorder_status_file_removed_on_stop():
    """stop() removes .recording status file after saving."""
    tmp = tempfile.mkdtemp()
    try:
        recorder = Recorder(task_name="status-removal-test", tasks_dir=tmp)
        recorder.recording = True
        recorder.steps = [
            {"id": 1, "action": "click", "position": {"x": 100, "y": 200},
             "screenshot": "step-001.png", "key": None, "text": None,
             "description": "test click", "nearby_text": None}
        ]
        # Create the status file manually
        recorder._recording_status.create()
        status_path = os.path.join(tmp, "status-removal-test", ".recording")
        assert os.path.exists(status_path)

        recorder.stop()
        assert not os.path.exists(status_path)
    finally:
        shutil.rmtree(tmp)
```

**Step 2: Run test to verify it fails**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_recorder.py -v`
Expected: New tests fail because Recorder doesn't have `_recording_status` or signal handling yet.

**Step 3: Rewrite recorder.py**

The key changes:
1. Import `signal`, `RecordingStatus`, `OSDWindow`
2. Add `_recording_status` attribute initialized in `__init__`
3. Add `_signal_handler()` method and register in `start()`
4. Replace `listener.join()` with `osd.show()` (which runs `mainloop()`)
5. `_record_step()` calls `_recording_status.update_steps()`
6. `stop()` calls `_recording_status.remove()`

```python
# scripts/recorder.py — full rewrite
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
```

**Step 4: Run test to verify it passes**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_recorder.py -v`
Expected: All tests PASS (existing KeyMerger tests + new signal/status tests)

**Step 5: Run all tests**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/ -v`
Expected: All tests across all test files PASS

**Step 6: Commit**

```bash
git add desktop-automator/scripts/recorder.py desktop-automator/tests/test_recorder.py
git commit -m "feat(desktop-automator): rewrite recorder with OSD, signal handling, status file"
```

---

### Task 4: CLI Status Command + SKILL.md Update

**Files:**
- Modify: `desktop-automator/scripts/task_manager.py`
- Modify: `desktop-automator/.claude/skills/desktop-automator/SKILL.md`

**Step 1: Add status command to task_manager.py CLI**

Add `status` command that uses `RecordingStatus.check_active()`:

```python
# scripts/task_manager.py — add status command
import argparse
import json
import sys
import os
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager
from lib.recording_status import RecordingStatus


def main():
    parser = argparse.ArgumentParser(description="Manage recorded desktop tasks")
    parser.add_argument("command", choices=["list", "info", "delete", "status"])
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
    elif args.command == "status":
        result = RecordingStatus.check_active(tm.tasks_dir)
        if result is None:
            print("No recording in progress.")
        elif result["pid_alive"]:
            elapsed = int(time.time() - datetime.fromisoformat(result["started"]).timestamp())
            minutes = elapsed // 60
            secs = elapsed % 60
            print(f"Recording in progress:")
            print(f"  Task: {result['task_name']}")
            print(f"  Steps: {result['steps_so_far']}")
            print(f"  Elapsed: {minutes:02d}:{secs:02d}")
            print(f"  PID: {result['pid']}")
            print(f"  Display server: {result['display_server']}")
        else:
            print(f"WARNING: Incomplete recording found!")
            print(f"  Task: {result['task_name']}")
            print(f"  Steps recorded: {result['steps_so_far']}")
            print(f"  PID {result['pid']} is no longer running.")
            print(f"  Use '/desktop-automator delete {result['task_name']}' to clean up.")
```

**Step 2: Update SKILL.md**

Add the `status` command section and update the `record` command description:

```markdown
### Check Recording Status

```
/desktop-automator status
```

Run: `cd desktop-automator && python3 scripts/task_manager.py status`

Shows:
- If recording active: task name, step count, elapsed time, PID
- If incomplete recording: warning about dead PID, cleanup suggestion
- If no recording: "No recording in progress"

### Record Desktop Operations

```
/desktop-automator record <task-name>
```

Steps:
1. Run: `cd desktop-automator && python3 scripts/recorder.py --name <task-name>`
2. An OSD floating window appears showing recording state (REC indicator, step count, elapsed time)
3. The recorder captures mouse clicks and keyboard input, merging consecutive keypresses into semantic steps
4. Each step saves a screenshot and records nearby text for later matching
5. Stop recording by: clicking "Stop Recording" button in OSD window, pressing Esc, or Ctrl+C
6. On stop, task data is saved to `tasks/<task-name>/task.json` and OSD window closes
```

**Step 3: Commit**

```bash
git add desktop-automator/scripts/task_manager.py desktop-automator/.claude/skills/desktop-automator/SKILL.md
git commit -m "feat(desktop-automator): add status command and update SKILL.md for OSD recorder"
```

---

### Task 5: Integration Test — Full Recording Flow

**Files:**
- Modify: `desktop-automator/tests/test_integration.py`

**Step 1: Write integration test for status file lifecycle**

```python
# Add to tests/test_integration.py

def test_recording_status_lifecycle():
    """Verify status file is created, updated, and removed during recording lifecycle."""
    tmp = tempfile.mkdtemp()
    try:
        from lib.recording_status import RecordingStatus

        rs = RecordingStatus(task_name="lifecycle-test", tasks_dir=tmp)
        rs.create(display_server="wayland")

        # Status file exists
        status_path = os.path.join(tmp, "lifecycle-test", ".recording")
        assert os.path.exists(status_path)

        # Update steps
        rs.update_steps(3)
        with open(status_path) as f:
            data = json.load(f)
        assert data["steps_so_far"] == 3

        # Remove after recording completes
        rs.remove()
        assert not os.path.exists(status_path)
    finally:
        shutil.rmtree(tmp)


def test_status_cli_command():
    """Verify the status CLI command detects active and inactive states."""
    tmp = tempfile.mkdtemp()
    try:
        from lib.recording_status import RecordingStatus

        # No recording — status returns None
        result = RecordingStatus.check_active(tmp)
        assert result is None

        # Create a recording status
        rs = RecordingStatus(task_name="cli-status-test", tasks_dir=tmp)
        rs.create(display_server="wayland")
        rs.update_steps(2)

        # Status detects active recording
        result = RecordingStatus.check_active(tmp)
        assert result is not None
        assert result["task_name"] == "cli-status-test"
        assert result["steps_so_far"] == 2
        assert result["pid_alive"] is True

        # Remove recording status
        rs.remove()
        result = RecordingStatus.check_active(tmp)
        assert result is None
    finally:
        shutil.rmtree(tmp)
```

**Step 2: Run integration tests**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/test_integration.py -v`
Expected: All tests PASS (existing + new)

**Step 3: Run full test suite**

Run: `cd /home/nice/chenlening/workspace/skills/desktop-automator && python3 -m pytest tests/ -v`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add desktop-automator/tests/test_integration.py
git commit -m "feat(desktop-automator): add integration tests for recording status lifecycle"
```

---

### Task 6: README Update

**Files:**
- Modify: `desktop-automator/README.md`

**Step 1: Update README with OSD and status command documentation**

Add a section for the OSD window and status command. Update the recording section to mention OSD feedback and signal handling.

Key additions:
- OSD window description and screenshot mockup
- `/desktop-automator status` command
- Signal handling (SIGTERM/SIGINT) saves data
- Multiple stop methods: OSD button, Esc, Ctrl+C

**Step 2: Commit**

```bash
git add desktop-automator/README.md
git commit -m "docs(desktop-automator): update README with OSD feedback and status command"
```

---

### Task 7: Add psutil to requirements.txt

**Files:**
- Modify: `desktop-automator/requirements.txt`

**Step 1: Add psutil dependency**

RecordingStatus.check_active() uses `psutil.pid_exists()` to check if a recording PID is still alive.

Add `psutil>=5.9.0` to requirements.txt.

**Step 2: Commit**

```bash
git add desktop-automator/requirements.txt
git commit -m "feat(desktop-automator): add psutil dependency for recording status PID check"
```
