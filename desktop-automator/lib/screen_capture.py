import mss
from PIL import Image

def capture_screen():
    with mss.MSS() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

def save_screenshot(img, path):
    img.save(path)