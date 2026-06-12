import sys
from lib.platform_detector import detect_platform, get_screen_size

def test_detect_platform_returns_known_value():
    result = detect_platform()
    assert result in ("linux", "windows", "macos")

def test_detect_platform_matches_sys():
    result = detect_platform()
    if sys.platform.startswith("linux"):
        assert result == "linux"
    elif sys.platform == "win32":
        assert result == "windows"
    elif sys.platform == "darwin":
        assert result == "macos"

def test_get_screen_size_returns_positive():
    w, h = get_screen_size()
    assert w > 0 and h > 0