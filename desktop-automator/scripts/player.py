# scripts/player.py
"""Computer-use replay loop with Vision Provider as primary strategy.

Iterates through semantic steps, using VisionProvider to locate click targets
by comparing reference and current screenshots. Falls back to coordinate
adaptation when vision detection fails.
"""

import argparse
import os
import sys
import time

# Must set DBusGMainLoop BEFORE any dbus.SessionBus() calls
# so that D-Bus signals are delivered via GLib main loop
from dbus.mainloop.glib import DBusGMainLoop
DBusGMainLoop(set_as_default=True)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from PIL import Image
from lib.task_manager import TaskManager
from lib.screen_capture import capture_screen
from lib.coordinate_adapter import CoordinateAdapter
from lib.platform_detector import detect_platform, detect_display_server
from lib.vision_provider import get_provider
from lib.input_simulator import get_input_simulator


class Player:
    """Replays recorded desktop operations using LLM-driven computer-use pattern.

    V3: reads frames/ directory instead of screenshots/, uses semantic
    description from analysis for Vision prompts. Input simulation via
    InputSimulator (portal backend on Wayland, pyautogui on X11/Windows).
    """

    def __init__(self, task_name, tasks_dir=None, mode="flexible", delay=1.0, provider_name=None):
        self.tm = TaskManager(tasks_dir)
        self.task_name = task_name
        self.mode = mode
        self.delay = delay
        self.task_data = self.tm.load_task(task_name)
        self.task_dir = os.path.join(self.tm.tasks_dir, task_name)
        # V3 uses frames/ dir, V2 uses screenshots/ dir
        frames_dir_name = self.task_data.get("frames_dir", "frames")
        frames_path = os.path.join(self.task_dir, frames_dir_name)
        if os.path.isdir(frames_path):
            self.frames_dir = frames_path
        else:
            # V2 compatibility: fallback to screenshots/
            self.frames_dir = os.path.join(self.task_dir, "screenshots")
        self.vision = get_provider(provider_name)
        self.sim = get_input_simulator()
        self.results = []
        self.methods_used = {}

    def replay(self):
        """Iterate through semantic steps, calling _replay_step for each."""
        print(f"Replaying task '{self.task_name}' ({len(self.task_data['steps'])} steps)...")
        platform = detect_platform()
        if platform != self.task_data["platform"]:
            print(f"Warning: recorded on {self.task_data['platform']}, running on {platform}")

        # Establish portal session early (before any screen capture)
        # so permission dialog appears upfront, not mid-replay
        if hasattr(self.sim, '_ensure_session'):
            print("Establishing input session...")
            self.sim._ensure_session()

        current_size = self.sim.get_screen_size()
        adapter = CoordinateAdapter(
            self.task_data.get("recorded_width", current_size[0]),
            self.task_data.get("recorded_height", current_size[1]),
        )

        for step in self.task_data["steps"]:
            result = self._replay_step(step, adapter, current_size)
            self.results.append(result)
            method = result.get("method", "unknown")
            self.methods_used[method] = self.methods_used.get(method, 0) + 1
            if result["status"] == "failed" and self.mode == "strict":
                print(f"Step {step['id']} failed in strict mode. Stopping.")
                break
            time.sleep(self.delay)

        self._print_summary()

    def _replay_step(self, step, adapter, current_size):
        """Replay a single semantic step based on its action type.

        Handles 'type', 'click', and 'keypress' actions with appropriate strategies.
        """
        print(f"\nStep {step['id']}: {step['description']}")

        action = step["action"]

        if action == "type":
            return self._replay_type(step)

        elif action == "click":
            return self._replay_click(step, adapter, current_size)

        elif action == "keypress":
            return self._replay_keypress(step)

        else:
            return {"step_id": step["id"], "status": "unknown", "action": action}

    def _replay_type(self, step):
        """Type text via InputSimulator."""
        text = step.get("text", "")
        if not text:
            return {"step_id": step["id"], "status": "failed", "reason": "no text to type"}
        self.sim.type_text(text, interval=0.05)
        print(f"  Typed: '{text}'")
        return {"step_id": step["id"], "status": "success", "method": "direct_type", "text": text}

    def _replay_click(self, step, adapter, current_size):
        """Locate and click an element using Vision Provider as primary strategy.

        Strategy chain:
        1. Capture current screen
        2. Load reference screenshot (or use current as reference if missing)
        3. Build vision prompt from step description + nearby_text + position
        4. Call vision.locate_element(current, ref, prompt)
        5. If found with confidence >= 0.5: click at returned coordinates
        6. If not found: fall back to coordinate adaptation from recorded position
        """
        current_img = capture_screen()

        # Downscale images to max 1280px wide for API efficiency
        current_img = self._downscale(current_img, 1280)
        current_bytes = self._img_to_bytes(current_img)

        # Load reference frame if it exists
        ref_path = os.path.join(self.frames_dir, step.get("screenshot", ""))
        if os.path.exists(ref_path):
            from PIL import Image
            ref_img = Image.open(ref_path)
            ref_img = self._downscale(ref_img, 1280)
            ref_bytes = self._img_to_bytes(ref_img)
        else:
            ref_bytes = current_bytes

        # Build vision prompt and call Vision Provider
        description = self._build_vision_prompt(step)
        vision_result = self.vision.locate_element(current_bytes, ref_bytes, description)

        # Determine provider method name for reporting
        provider_method = type(self.vision).__name__.lower().replace("provider", "_vision")

        if vision_result.get("found") and vision_result.get("confidence", 0) >= 0.5:
            x = vision_result["x"]
            y = vision_result["y"]
            # Scale vision coordinates from downscaled image back to full screen
            scale_x = current_size[0] / current_img.width
            scale_y = current_size[1] / current_img.height
            full_x = round(x * scale_x)
            full_y = round(y * scale_y)
            # Adapt for screen resolution differences
            adapted = adapter.adapt(full_x, full_y, current_size[0], current_size[1])
            self.sim.click(adapted[0], adapted[1])
            print(f"  Clicked at ({adapted[0]}, {adapted[1]}) via {provider_method}")
            return {
                "step_id": step["id"],
                "status": "success",
                "method": provider_method,
                "position": {"x": adapted[0], "y": adapted[1]},
                "confidence": vision_result["confidence"],
            }

        # Fallback: coordinate adaptation from recorded position
        if step.get("position"):
            adapted = adapter.adapt(
                step["position"]["x"],
                step["position"]["y"],
                current_size[0],
                current_size[1],
            )
            self.sim.click(adapted[0], adapted[1])
            print(f"  Clicked at ({adapted[0]}, {adapted[1]}) via original_coords (fallback)")
            return {
                "step_id": step["id"],
                "status": "success",
                "method": "original_coords",
                "position": {"x": adapted[0], "y": adapted[1]},
            }

        # No position data available at all
        print(f"  Failed: no position data and vision did not locate element")
        return {"step_id": step["id"], "status": "failed", "reason": "vision not found and no position data"}

    def _replay_keypress(self, step):
        """Handle compound keys (ctrl+c) and simple keys."""
        key = step.get("key", "")
        if not key:
            return {"step_id": step["id"], "status": "failed", "reason": "no key specified"}

        if "+" in key:
            keys = key.split("+")
            for k in keys[:-1]:
                self.sim.key_down(k)
            self.sim.press_key(keys[-1])
            for k in reversed(keys[:-1]):
                self.sim.key_up(k)
            print(f"  Pressed compound: {key}")
        else:
            self.sim.press_key(key)
            print(f"  Pressed: {key}")

        return {"step_id": step["id"], "status": "success", "method": "keypress", "key": key}

    def _build_vision_prompt(self, step):
        """Build a vision prompt using semantic description + position hint.

        V3 uses the description from analysis. V2 (legacy) uses nearby_text.
        """
        parts = []

        description = step.get("description", "")
        if description:
            parts.append(description)

        # V2 legacy: nearby text labels provide context
        nearby_text = step.get("nearby_text")
        if nearby_text:
            labels = ", ".join(nearby_text)
            parts.append(f"near text labels: {labels}")

        # Original position gives a hint about where to look
        position = step.get("position")
        if position:
            parts.append(f"originally at position ({position['x']}, {position['y']})")

        return " | ".join(parts) if parts else "unknown element"

    def _print_summary(self):
        """Print replay summary including methods used count."""
        success = sum(1 for r in self.results if r["status"] == "success")
        failed = sum(1 for r in self.results if r["status"] == "failed")
        print(f"\nReplay complete: {success} succeeded, {failed} failed out of {len(self.results)} steps")
        if self.methods_used:
            methods_str = ", ".join(
                f"{method}: {count}" for method, count in sorted(self.methods_used.items())
            )
            print(f"Methods used: {{{methods_str}}}")

    @staticmethod
    def _downscale(img, max_width=1280):
        """Downscale image to max_width while preserving aspect ratio.

        Returns the downscaled image, or the original if already small enough.
        """
        if img.width <= max_width:
            return img
        ratio = max_width / img.width
        new_height = round(img.height * ratio)
        return img.resize((max_width, new_height), Image.LANCZOS)

    @staticmethod
    def _img_to_bytes(img):
        """Convert PIL Image to PNG bytes."""
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()


def main():
    parser = argparse.ArgumentParser(description="Replay recorded desktop operations")
    parser.add_argument("--task", required=True, help="Task name to replay")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    parser.add_argument("--mode", choices=["strict", "flexible"], default="flexible", help="Error handling mode")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between steps (seconds)")
    parser.add_argument("--provider", choices=["doubao", "anthropic"], default=None, help="Vision provider to use")
    args = parser.parse_args()
    player = Player(args.task, args.tasks_dir, args.mode, args.delay, args.provider)
    player.replay()


if __name__ == "__main__":
    main()
