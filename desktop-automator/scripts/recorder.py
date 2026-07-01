# scripts/recorder.py
"""V3 screenshot collector — captures 1fps frames, no event interception.

Records desktop operations by taking periodic screenshots (1 per second),
saving them as frame-NNN.png in the task's frames/ directory. No input
event interception — works on Wayland, X11, and any platform without
special permissions.
"""
import argparse
import json
import os
import signal
import sys
import threading
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.platform_detector import detect_platform, detect_display_server, get_screen_size
from lib.screen_capture import capture_screen, save_screenshot
from lib.recording_status import RecordingStatus
from lib.osd_window import OSDWindow


class Recorder:
    """V3 recorder: periodic screenshot collector at 1fps."""

    def __init__(self, task_name, tasks_dir=None):
        if tasks_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            tasks_dir = os.path.join(base, "tasks")
        self.task_name = task_name
        self.task_dir = os.path.join(tasks_dir, task_name)
        self.frames_dir = os.path.join(self.task_dir, "frames")
        self.tasks_dir = tasks_dir
        self.frame_counter = 0
        self.recording = True
        self.start_time = time.time()
        self._recording_status = RecordingStatus(task_name, tasks_dir)
        self._osd = None
        self._lock = threading.Lock()

    def start(self):
        os.makedirs(self.frames_dir, exist_ok=True)

        display_server = detect_display_server()
        screen_size = get_screen_size()

        self._recording_status.create(display_server)

        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

        print(f"Recording task '{self.task_name}' on {display_server}...")
        print("Press Esc to stop, or click Stop button in OSD window.")

        # Start capture loop in background thread
        capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        capture_thread.start()

        # Show OSD on main thread (runs mainloop)
        self._osd = OSDWindow(
            frame_count=0,
            start_time=self.start_time,
            stop_callback=self._osd_stop,
        )
        self._osd.show()

    def _capture_loop(self):
        """Main capture loop: screenshot every 1 second until stopped."""
        while self.recording:
            try:
                img = capture_screen()
                with self._lock:
                    if not self.recording:
                        break
                    self.frame_counter += 1
                    frame_name = f"frame-{self.frame_counter:03d}.png"
                    frame_path = os.path.join(self.frames_dir, frame_name)
                    count = self.frame_counter

                save_screenshot(img, frame_path)
                print(f"  Frame {count} saved")

                if self._osd:
                    self._osd.update_frames(count)
                self._recording_status.update_frames(count)

            except Exception as e:
                print(f"  Capture error: {e}")

            # Wait 1 second between captures
            time.sleep(1)

    def _osd_stop(self):
        self.stop()

    def _signal_handler(self, signum, frame):
        print(f"\nReceived signal {signum}, saving recording data...")
        self.stop()
        if self._osd and self._osd.root:
            self._osd.root.after(0, self._osd._on_stop_click)

    def stop(self):
        with self._lock:
            if not self.recording:
                return
            self.recording = False
            count = self.frame_counter

        self._save_task(count)
        self._recording_status.remove()

    def _save_task(self, frames_count):
        screen_size = get_screen_size()
        task_data = {
            "name": self.task_name,
            "platform": detect_platform(),
            "display_server": detect_display_server(),
            "recorded_width": screen_size[0],
            "recorded_height": screen_size[1],
            "created": datetime.now(timezone.utc).isoformat(),
            "status": "raw",
            "frames_count": frames_count,
            "frames_dir": "frames",
            "steps": [],
        }
        task_path = os.path.join(self.task_dir, "task.json")
        with open(task_path, "w") as f:
            json.dump(task_data, f, indent=2)
        print(f"\nRecording saved: {self.task_dir}")
        print(f"  {frames_count} frames captured")


def main():
    parser = argparse.ArgumentParser(description="Record desktop operations (V3 screenshot collector)")
    parser.add_argument("--name", required=True, help="Task name for the recording")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    args = parser.parse_args()
    recorder = Recorder(args.name, args.tasks_dir)
    recorder.start()


if __name__ == "__main__":
    main()
