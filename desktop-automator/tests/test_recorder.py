"""Tests for KeyMerger class in recorder.py.

Only KeyMerger is tested here because Recorder requires a live GUI environment.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from scripts.recorder import KeyMerger


def test_key_merger_consecutive_chars():
    """Consecutive printable chars should be accumulated into buffer.
    'z','h','i','s','h','i' -> flush gives {action:"type", text:"zhishi"}
    """
    merger = KeyMerger()
    for ch in ["z", "h", "i", "s", "h", "i"]:
        flushed, special = merger.add_key(ch)
        assert flushed is None
        assert special is None

    result = merger.flush()
    assert result is not None
    assert result["action"] == "type"
    assert result["text"] == "zhishi"


def test_key_merger_special_key_flushes():
    """Special key (enter) flushes accumulated text first, then emits as keypress.
    'z','h' accumulated, then 'enter' flushes 'zh' first, emits enter as keypress.
    """
    merger = KeyMerger()
    for ch in ["z", "h"]:
        flushed, special = merger.add_key(ch)
        assert flushed is None
        assert special is None

    flushed, special = merger.add_key("enter")
    # 'zh' should be flushed as a type event
    assert flushed is not None
    assert flushed["action"] == "type"
    assert flushed["text"] == "zh"
    # 'enter' should be emitted as a keypress event
    assert special is not None
    assert special["action"] == "keypress"
    assert special["key"] == "enter"


def test_key_merger_modifiers_not_merged():
    """Modifier keys should not be accumulated; they emit as keypress events.
    'ctrl' -> keypress event, not accumulated into buffer.
    """
    merger = KeyMerger()
    flushed, special = merger.add_key("ctrl")
    assert flushed is None
    assert special is not None
    assert special["action"] == "keypress"
    assert special["key"] == "ctrl"


def test_key_merger_space_included():
    """Space should be included as a character in the buffer.
    'h','e','l','l','o','space','w','o','r','l','d' -> "hello world"
    """
    merger = KeyMerger()
    keys = ["h", "e", "l", "l", "o", "space", "w", "o", "r", "l", "d"]
    for key in keys:
        flushed, special = merger.add_key(key)
        assert flushed is None
        assert special is None

    result = merger.flush()
    assert result is not None
    assert result["action"] == "type"
    assert result["text"] == "hello world"


def test_key_merger_empty_flush():
    """Flushing with nothing in buffer returns None."""
    merger = KeyMerger()
    result = merger.flush()
    assert result is None
