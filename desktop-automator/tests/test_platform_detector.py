import sys
import os
from unittest.mock import patch

from lib.platform_detector import detect_platform, get_screen_size, detect_display_server


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


def test_detect_display_server_returns_known_value():
    result = detect_display_server()
    assert result in ("wayland", "x11", "unknown")


def test_detect_display_server_env_variable():
    # XDG_SESSION_TYPE=wayland
    with patch.dict(os.environ, {"XDG_SESSION_TYPE": "wayland"}, clear=False):
        assert detect_display_server() == "wayland"

    # XDG_SESSION_TYPE=x11
    with patch.dict(os.environ, {"XDG_SESSION_TYPE": "x11"}, clear=False):
        assert detect_display_server() == "x11"


def test_detect_display_server_fallback_env():
    # WAYLAND_DISPLAY fallback (no XDG_SESSION_TYPE)
    env = {"WAYLAND_DISPLAY": "wayland-0"}
    with patch.dict(os.environ, env, clear=True):
        # clear=True removes all env vars, so XDG_SESSION_TYPE is absent
        assert detect_display_server() == "wayland"

    # DISPLAY fallback (no XDG_SESSION_TYPE, no WAYLAND_DISPLAY)
    env = {"DISPLAY": ":0"}
    with patch.dict(os.environ, env, clear=True):
        assert detect_display_server() == "x11"

    # No relevant env vars at all
    with patch.dict(os.environ, {}, clear=True):
        assert detect_display_server() == "unknown"
