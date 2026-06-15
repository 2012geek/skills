"""Tests for screen_capture module.

test_capture_screen_not_black is the CRITICAL test: on Wayland, mss
returns all-black images, so the multi-backend fallback must produce
real pixels. This test validates that the chosen backend works.
"""

import os
import numpy as np
from lib.screen_capture import capture_screen, save_screenshot, detect_display_server


def test_capture_screen_returns_pil_image():
    """capture_screen should return a valid PIL Image with non-zero dimensions."""
    img = capture_screen()
    assert img is not None
    assert img.size[0] > 0
    assert img.size[1] > 0


def test_capture_screen_not_black():
    """CRITICAL: screenshot must not be all-black on Wayland.

    mss returns black images on Wayland (all pixels = 0). OCR and Vision
    API cannot work on black images. This test verifies that the capture
    backend produces real screen content by checking mean pixel value > 0.
    """
    img = capture_screen()
    arr = np.array(img)
    mean_pixel = arr.mean()
    assert mean_pixel > 0, (
        f"Screenshot is all-black (mean={mean_pixel}). "
        f"Screen capture backend failed on Wayland."
    )


def test_save_screenshot_creates_file():
    """save_screenshot should create a file at the given path."""
    img = capture_screen()
    path = "/tmp/test_screenshot.png"
    save_screenshot(img, path)
    assert os.path.exists(path)
    os.remove(path)


def test_detect_display_server_available():
    """detect_display_server should return wayland, x11, or unknown."""
    result = detect_display_server()
    assert result in ("wayland", "x11", "unknown"), f"Unexpected display server: {result}"
