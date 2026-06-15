import sys
import os
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

def detect_display_server():
    # Check XDG_SESSION_TYPE first (most reliable)
    session_type = os.environ.get("XDG_SESSION_TYPE", "")
    if session_type == "wayland":
        return "wayland"
    if session_type == "x11":
        return "x11"

    # Fallback: WAYLAND_DISPLAY env var
    if os.environ.get("WAYLAND_DISPLAY", ""):
        return "wayland"

    # Fallback: DISPLAY env var
    if os.environ.get("DISPLAY", ""):
        return "x11"

    return "unknown"