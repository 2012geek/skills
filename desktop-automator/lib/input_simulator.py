"""Multi-backend input simulation with Wayland/X11 auto-detection.

On Wayland, pyautogui uses X11 XTest which the Wayland compositor blocks
entirely — clicks and keypresses silently do nothing. This module detects
the display server and chooses the appropriate backend:

  Wayland: xdg-desktop-portal RemoteDesktop (D-Bus async)
  X11/Windows/macOS: pyautogui (existing reliable method)

Follows the same pattern as lib/screen_capture.py.
"""

from lib.platform_detector import detect_display_server


class InputSimulator:
    """Protocol for input simulation backends."""

    def click(self, x: int, y: int) -> None:
        """Click at the given screen coordinates."""
        raise NotImplementedError

    def type_text(self, text: str, interval: float = 0.05) -> None:
        """Type a string of text with optional interval between chars."""
        raise NotImplementedError

    def press_key(self, key: str) -> None:
        """Press a single key (e.g., 'enter', 'esc')."""
        raise NotImplementedError

    def key_down(self, key: str) -> None:
        """Hold a key down (for compound keys like ctrl+c)."""
        raise NotImplementedError

    def key_up(self, key: str) -> None:
        """Release a held key."""
        raise NotImplementedError

    def get_screen_size(self) -> tuple[int, int]:
        """Return (width, height) of the full screen."""
        raise NotImplementedError


def get_input_simulator(display_server=None) -> InputSimulator:
    """Get the appropriate InputSimulator backend for the current environment.

    Auto-detects display server if not specified. Returns PortalBackend
    for Wayland, PyautoguiBackend for everything else.
    """
    if display_server is None:
        display_server = detect_display_server()

    if display_server == "wayland":
        from lib.input_simulator_portal import PortalBackend
        return PortalBackend()
    else:
        from lib.input_simulator_pyautogui import PyautoguiBackend
        return PyautoguiBackend()
