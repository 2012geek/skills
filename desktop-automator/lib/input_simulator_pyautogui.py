"""Pyautogui input simulation backend for X11, Windows, and macOS."""

import pyautogui

pyautogui.FAILSAFE = False  # Required for coordinates near screen edges
pyautogui.PAUSE = 0.3


class PyautoguiBackend:
    """Input simulation via pyautogui — works on X11, Windows, macOS."""

    def click(self, x: int, y: int) -> None:
        pyautogui.click(x, y)

    def type_text(self, text: str, interval: float = 0.05) -> None:
        pyautogui.write(text, interval=interval)

    def press_key(self, key: str) -> None:
        pyautogui.press(key)

    def key_down(self, key: str) -> None:
        pyautogui.keyDown(key)

    def key_up(self, key: str) -> None:
        pyautogui.keyUp(key)

    def get_screen_size(self) -> tuple[int, int]:
        return pyautogui.size()
