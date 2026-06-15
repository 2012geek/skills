"""Multi-backend screen capture with Wayland/X11 auto-detection.

On Wayland, mss and pyautogui return all-black screenshots because they
use X11 APIs that don't work under Wayland compositors. This module
detects the display server and chooses the appropriate backend:

Wayland fallback chain:
  1. grim (wlroots compositors: Sway, Hyprland)
  2. gnome-screenshot (GNOME/Mutter compositors)
  3. xdg-desktop-portal D-Bus API
  4. mss (XWayland, may still be black)

X11: mss (current reliable method).
"""

import os
import shutil
import subprocess
import tempfile
from io import BytesIO

import mss
from PIL import Image


def detect_display_server():
    """Detect whether the session is running on Wayland, X11, or unknown.

    Checks XDG_SESSION_TYPE first (most reliable), then falls back to
    WAYLAND_DISPLAY and DISPLAY environment variables.
    """
    session_type = os.environ.get("XDG_SESSION_TYPE", "")
    if session_type == "wayland":
        return "wayland"
    if session_type == "x11":
        return "x11"

    if os.environ.get("WAYLAND_DISPLAY", ""):
        return "wayland"

    if os.environ.get("DISPLAY", ""):
        return "x11"

    return "unknown"


def _capture_wayland_grim():
    """Capture screenshot via grim (wlroots compositors like Sway/Hyprland).

    grim writes PNG bytes to stdout when called with '-' argument.
    Returns a PIL Image, or raises an exception if grim is unavailable.
    """
    result = subprocess.run(
        ["grim", "-"],
        capture_output=True,
        check=True,
        timeout=10,
    )
    return Image.open(BytesIO(result.stdout))


def _capture_wayland_gnome_screenshot():
    """Capture screenshot via gnome-screenshot (GNOME/Mutter compositors).

    gnome-screenshot must be invoked with a clean environment to avoid
    snap's LD_LIBRARY_PATH pollution which causes symbol lookup errors.
    Uses a temp file because gnome-screenshot only supports -f (file output).
    Returns a PIL Image, or raises an exception if gnome-screenshot fails.
    """
    # Build a clean environment to bypass snap LD_LIBRARY_PATH interference
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
            raise RuntimeError(
                f"gnome-screenshot failed (exit={result.returncode}): "
                f"{result.stderr.decode()[:200]}"
            )
        img = Image.open(tmp_path)
        # Force load so we can safely delete the temp file
        img.load()
        return img
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _capture_wayland_portal():
    """Capture screenshot via xdg-desktop-portal D-Bus API.

    Uses the org.freedesktop.portal.Screenshot interface. This requires
    a running portal service and may prompt the user for confirmation
    (interactive dialog). Not suitable for fully headless/automated use
    but included as a fallback for environments where grim and
    gnome-screenshot are unavailable.

    NOTE: This method uses dbus-python which requires a GLib main loop
    for async signal handling. If dbus is not available or the portal
    response times out, it will raise an exception.

    Returns a PIL Image, or raises an exception if the portal fails.
    """
    try:
        import dbus
    except ImportError:
        raise RuntimeError("dbus-python not available for portal screenshot")

    bus = dbus.SessionBus()
    portal_obj = bus.get_object(
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
    )
    portal_iface = dbus.Interface(portal_obj, "org.freedesktop.portal.Screenshot")

    # Request non-interactive screenshot
    options = {"interactive": dbus.Boolean(False)}
    request_path = portal_iface.Screenshot("", options)

    # Set up a GLib main loop to receive the Response signal
    try:
        import gi
        gi.require_version("GLib", "2.0")
        from gi.repository import GLib
    except ImportError:
        raise RuntimeError("PyGObject/GLib not available for portal signal handling")

    captured_uri = None
    loop = GLib.MainLoop()

    def on_portal_response(connection, sender, path, iface, signal, params):
        nonlocal captured_uri
        response, results = params.unpack()
        if response == 0:  # Success
            uri = results.get("uri", "")
            if isinstance(uri, dbus.String):
                uri = str(uri)
            captured_uri = uri
        loop.quit()

    import gi
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio

    gio_bus = Gio.bus_get_sync(Gio.BusType.SESSION)
    gio_bus.signal_subscribe(
        None,
        "org.freedesktop.portal.Request",
        "Response",
        None,
        None,
        Gio.DBusSignalFlags.NONE,
        on_portal_response,
        None,
    )

    # Timeout after 15 seconds
    GLib.timeout_add_seconds(15, lambda: loop.quit())
    loop.run()

    if captured_uri and captured_uri.startswith("file://"):
        path = captured_uri[7:]
        if os.path.exists(path):
            img = Image.open(path)
            img.load()
            os.unlink(path)
            return img

    raise RuntimeError("Portal screenshot did not produce a usable image")


def _capture_x11_mss():
    """Capture screenshot via mss (X11 native, reliable on X11 sessions).

    Returns a PIL Image converted from mss BGRA format.
    """
    with mss.MSS() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")


def _capture_wayland():
    """Capture screenshot on Wayland, trying backends in priority order.

    Fallback chain: grim -> gnome-screenshot -> portal -> mss (last resort).
    """
    # 1. Try grim (wlroots compositors: Sway, Hyprland)
    if shutil.which("grim"):
        try:
            return _capture_wayland_grim()
        except (subprocess.CalledProcessError, FileNotFoundError, OSError):
            pass

    # 2. Try gnome-screenshot (GNOME/Mutter compositors)
    if shutil.which("gnome-screenshot"):
        try:
            return _capture_wayland_gnome_screenshot()
        except (subprocess.CalledProcessError, FileNotFoundError, RuntimeError, OSError):
            pass

    # 3. Try xdg-desktop-portal D-Bus API
    try:
        return _capture_wayland_portal()
    except (RuntimeError, ImportError, OSError):
        pass

    # 4. Last resort: mss via XWayland (may return all-black)
    return _capture_x11_mss()


def capture_screen():
    """Capture a screenshot of the current screen.

    Auto-detects the display server (Wayland/X11/unknown) and chooses
    the appropriate capture backend. On Wayland, tries multiple backends
    in fallback order to avoid the all-black image problem with mss.
    """
    display_server = detect_display_server()

    if display_server == "wayland":
        return _capture_wayland()
    elif display_server == "x11":
        return _capture_x11_mss()
    else:
        # Unknown display server -- try mss as default
        return _capture_x11_mss()


def save_screenshot(img, path):
    """Save a PIL Image to the given file path."""
    img.save(path)
