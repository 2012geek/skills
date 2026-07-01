# scripts/analyzer.py
"""V3 frame analyzer — Vision Provider batch analysis of recorded frames.

Reads task.json with status="raw", loads frame images, detects pixel
differences between consecutive frames, sends changed pairs to Vision
Provider for operation detection, merges into semantic steps, and
updates task.json to status="analyzed".
"""
import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.task_manager import TaskManager
from lib.vision_provider import get_provider

# Pixel change threshold: percentage of pixels that changed significantly
PIXEL_CHANGE_THRESHOLD = 0.005  # 0.5% of pixels changed = worth analyzing


def compute_pixel_diff(prev_img: Image.Image, curr_img: Image.Image) -> float:
    """Compute pixel change ratio between two images.

    Returns the fraction of pixels that changed by more than a perceptual
    threshold (30/255 per channel). This is more sensitive than mean absolute
    difference — a small region change on a large screen still registers.

    Returns 0.0 for identical images, approaching 1.0 for completely different.
    """
    if prev_img.size != curr_img.size:
        return 1.0

    prev_arr = np.array(prev_img.convert("RGB"), dtype=np.float32)
    curr_arr = np.array(curr_img.convert("RGB"), dtype=np.float32)

    # Per-pixel per-channel absolute difference
    per_pixel_diff = np.max(np.abs(prev_arr - curr_arr), axis=2)

    # Count pixels where any channel changed by more than 30/255
    changed = np.sum(per_pixel_diff > 30) / per_pixel_diff.size
    return float(changed)


def _downscale(img, max_width=1280):
    """Downscale image to max_width while preserving aspect ratio."""
    if img.width <= max_width:
        return img
    ratio = max_width / img.width
    new_height = round(img.height * ratio)
    return img.resize((max_width, new_height), Image.LANCZOS)


def load_frames(frames_dir):
    """Load all frame images sorted by filename.

    Returns list of (frame_name, PIL Image) tuples.
    """
    if not os.path.isdir(frames_dir):
        print(f"Error: frames directory not found: {frames_dir}")
        return []

    frames = []
    for name in sorted(os.listdir(frames_dir)):
        if not name.endswith(".png"):
            continue
        path = os.path.join(frames_dir, name)
        try:
            img = Image.open(path)
            img.load()  # Force load so we can use it later
            frames.append((name, img))
        except Exception as e:
            print(f"  Warning: could not load {name}: {e}")

    return frames


def merge_steps(raw_steps):
    """Merge consecutive type actions into single steps.

    If multiple consecutive frames all detected 'type' actions, merge
    them into one step with combined text. Click and keypress steps
    stay as individual steps.
    """
    if not raw_steps:
        return []

    merged = []
    type_buffer = []

    for step in raw_steps:
        if step["action"] == "type":
            type_buffer.append(step)
        else:
            # Flush any accumulated type steps
            if type_buffer:
                merged_text = "".join(s.get("text", "") or "" for s in type_buffer)
                merged.append({
                    "action": "type",
                    "text": merged_text,
                    "screenshot": type_buffer[-1]["screenshot"],
                    "description": f"输入 '{merged_text}'",
                    "position": type_buffer[-1].get("position"),
                })
                type_buffer = []
            merged.append(step)

    # Flush remaining type buffer
    if type_buffer:
        merged_text = "".join(s.get("text", "") or "" for s in type_buffer)
        merged.append({
            "action": "type",
            "text": merged_text,
            "screenshot": type_buffer[-1]["screenshot"],
            "description": f"输入 '{merged_text}'",
            "position": type_buffer[-1].get("position"),
        })

    # Assign sequential IDs
    for i, step in enumerate(merged, start=1):
        step["id"] = i

    return merged


class Analyzer:
    """Analyze recorded frames using Vision Provider to detect operations."""

    def __init__(self, task_name, tasks_dir=None, provider_name=None):
        self.tm = TaskManager(tasks_dir)
        self.task_name = task_name
        self.task_dir = os.path.join(self.tm.tasks_dir, task_name)
        self.vision = get_provider(provider_name)

    def analyze(self):
        """Run full analysis pipeline on the recorded task.

        1. Load task.json and verify status="raw"
        2. Load all frames from frames/ directory
        3. Compute pixel differences between consecutive frames
        4. Send changed frame pairs to Vision Provider
        5. Merge results into semantic steps
        6. Update task.json with status="analyzed" and populated steps
        """
        task_data = self.tm.load_task(self.task_name)

        if task_data.get("status") != "raw":
            print(f"Task status is '{task_data.get('status')}', expected 'raw'. Skipping.")
            return

        frames_dir = os.path.join(self.task_dir, task_data.get("frames_dir", "frames"))
        frames = load_frames(frames_dir)

        if not frames:
            print("No frames found to analyze.")
            return

        print(f"Analyzing {len(frames)} frames for task '{self.task_name}'...")
        print(f"  Using vision provider: {type(self.vision).__name__}")

        raw_steps = []
        # Anchor: the frame we compare against. Starts as frame 0,
        # updates to the post-change frame after each detected operation.
        anchor_name, anchor_img = frames[0]

        for i in range(1, len(frames)):
            curr_name, curr_img = frames[i]

            # Compare current frame against anchor (not just previous frame)
            diff = compute_pixel_diff(anchor_img, curr_img)
            print(f"  Frame {i}: {curr_name} vs anchor {anchor_name} — diff={diff:.4f}")

            if diff < PIXEL_CHANGE_THRESHOLD:
                print(f"    Skipping (diff < {PIXEL_CHANGE_THRESHOLD})")
                continue

            # Convert anchor and current images to PNG bytes for Vision Provider
            # Downscale to 1280px wide for API efficiency
            from io import BytesIO
            anchor_scaled = _downscale(anchor_img, 1280)
            anchor_buf = BytesIO()
            anchor_scaled.save(anchor_buf, format="PNG")
            anchor_bytes = anchor_buf.getvalue()

            curr_scaled = _downscale(curr_img, 1280)
            curr_buf = BytesIO()
            curr_scaled.save(curr_buf, format="PNG")
            curr_bytes = curr_buf.getvalue()

            # Send to Vision Provider
            result = self.vision.analyze_frame_pair(anchor_bytes, curr_bytes, i)

            action = result.get("action", "none")
            description = result.get("description", "")
            confidence = result.get("confidence", 0.0)

            print(f"    Detected: {action} — {description} (conf={confidence:.2f})")

            if action != "none" and confidence >= 0.3:
                raw_steps.append({
                    "action": action,
                    "position": result.get("position"),
                    "text": result.get("text"),
                    "key": result.get("key"),
                    "screenshot": curr_name,
                    "description": description,
                })
                # Update anchor: next comparisons use this frame as baseline
                anchor_name, anchor_img = curr_name, curr_img

        # Merge consecutive type steps
        steps = merge_steps(raw_steps)

        # Update task.json
        task_data["status"] = "analyzed"
        task_data["steps"] = steps
        task_path = os.path.join(self.task_dir, "task.json")
        with open(task_path, "w") as f:
            json.dump(task_data, f, indent=2)

        print(f"\nAnalysis complete: {len(steps)} steps identified")
        for step in steps:
            print(f"  Step {step['id']}: {step['action']} — {step['description']}")


def main():
    parser = argparse.ArgumentParser(description="Analyze recorded frames with Vision Provider")
    parser.add_argument("--task", required=True, help="Task name to analyze")
    parser.add_argument("--tasks-dir", default=None, help="Custom tasks directory")
    parser.add_argument("--provider", choices=["doubao", "anthropic"], default=None,
                        help="Vision provider to use")
    args = parser.parse_args()
    analyzer = Analyzer(args.task, args.tasks_dir, args.provider)
    analyzer.analyze()


if __name__ == "__main__":
    main()
