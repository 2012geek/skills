import sys
import os
import shutil
import subprocess
import tempfile
from io import BytesIO

import pyautogui
from PIL import Image

def detect_platform():
    if sys.platform.startswith("linux"):
        return "linux"
    elif sys.platform == "win32":
        return "windows"
    elif sys.platform == "darwin":
        return "macos"
    return "unknown"

def _wayland_screen_size_grim():
    """Get screen dimensions via grim (wlroots compositors: Sway, Hyprland)."""
    result = subprocess.run(
        ["grim", "-"],
        capture_output=True,
        check=True,
        timeout=10,
    )
    img = Image.open(BytesIO(result.stdout))
    img.load()
    return (img.width, img.height)

def _wayland_screen_size_gnome_screenshot():
    """Get screen dimensions via gnome-screenshot (GNOME/Mutter compositors)."""
    clean_env = {
        "HOME": os.environ.get("HOME", ""),
        "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", ""),
        "WAYLAND_DISPLAY": os.environ.get("WAYLAND_DISPLAY", ""),
        "DISPLAY": os.environ.get("DISPLAY", ""),
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "XDG_SESSION_TYPE": os.environ.get("XDG_SESSION_TYPE", ""),
        "XDG_CURRENT_DESKTOP": os.environ.get("XDG_CURRENT_DESKTOP", ""),
        "USER": os.environ.get("USER", ""),
        "LANG": os.environ.get("LANG", ""),
        "DBUS_SESSION_BUS_ADDRESS": os.environ.get("DBUS_SESSION_BUS_ADDRESS", ""),
    }

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["gnome-screenshot", "-f", tmp_path],
            env=clean_env,
            capture_output=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise RuntimeError(f"gnome-screenshot failed (exit={result.returncode})")
        img = Image.open(tmp_path)
        img.load()
        return (img.width, img.height)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

def get_screen_size():
    """Return screen (width, height) using appropriate method for display server.

    On Wayland, pyautogui.size() returns wrong dimensions (single monitor
    vs full multi-monitor). Uses grim/gnome-screenshot output dimensions.
    """
    display_server = detect_display_server()
    if display_server == "wayland":
        # Try grim (wlroots compositors)
        if shutil.which("grim"):
            try:
                return _wayland_screen_size_grim()
            except (subprocess.CalledProcessError, OSError):
                pass
        # Try gnome-screenshot (GNOME/Mutter)
        if shutil.which("gnome-screenshot"):
            try:
                return _wayland_screen_size_gnome_screenshot()
            except (subprocess.CalledProcessError, RuntimeError, OSError):
                pass
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