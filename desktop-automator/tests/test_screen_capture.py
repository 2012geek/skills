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