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