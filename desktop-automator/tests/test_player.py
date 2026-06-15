"""Tests for Player class — computer-use replay loop with Vision Provider.

TDD order:
1. test_player_init — Player loads task data correctly
2. test_player_step_format — Player understands V2 semantic format
3. test_player_build_vision_prompt — _build_vision_prompt combines fields correctly
"""

import json
import os
import sys
import tempfile

from unittest.mock import MagicMock, patch

# Ensure lib and scripts are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from scripts.player import Player


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def setup_task(tmp_path, task_name, steps):
    """Create a task directory with task.json for testing."""
    task_dir = os.path.join(tmp_path, task_name)
    screenshots_dir = os.path.join(task_dir, "screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)
    task_data = {
        "name": task_name,
        "platform": "linux",
        "display_server": "wayland",
        "created": "2026-06-15T10:00:00Z",
        "steps": steps,
    }
    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f)
    return task_dir


V2_STEPS = [
    {
        "id": 1,
        "action": "click",
        "position": {"x": 400, "y": 225},
        "screenshot": "step-001.png",
        "key": None,
        "text": None,
        "description": "Click Submit button",
        "nearby_text": ["Submit", "Cancel"],
    },
    {
        "id": 2,
        "action": "type",
        "position": None,
        "screenshot": "step-002.png",
        "key": None,
        "text": "hello world",
        "description": "type 'hello world'",
        "nearby_text": None,
    },
    {
        "id": 3,
        "action": "keypress",
        "position": None,
        "screenshot": "step-003.png",
        "key": "ctrl+c",
        "text": None,
        "description": "key press ctrl+c",
        "nearby_text": None,
    },
]


# ---------------------------------------------------------------------------
# 1. Player init — loads task data correctly
# ---------------------------------------------------------------------------

def test_player_init():
    """Player loads task data correctly from task.json."""
    with tempfile.TemporaryDirectory() as tmp_path:
        setup_task(tmp_path, "test_task", V2_STEPS)
        player = Player("test_task", tasks_dir=tmp_path, provider_name="doubao")
        # Task data loaded
        assert player.task_data["name"] == "test_task"
        assert len(player.task_data["steps"]) == 3
        # Steps accessible
        assert player.task_data["steps"][0]["action"] == "click"
        assert player.task_data["steps"][1]["action"] == "type"
        assert player.task_data["steps"][2]["action"] == "keypress"
        # Internal state
        assert player.task_name == "test_task"
        assert player.mode == "flexible"
        assert player.delay == 1.0
        # Screenshots dir set
        expected_dir = os.path.join(tmp_path, "test_task", "screenshots")
        assert player.screenshots_dir == expected_dir


# ---------------------------------------------------------------------------
# 2. Player understands V2 semantic format
# ---------------------------------------------------------------------------

def test_player_step_format():
    """Player understands V2 semantic format (type action with text field, nearby_text)."""
    with tempfile.TemporaryDirectory() as tmp_path:
        setup_task(tmp_path, "format_test", V2_STEPS)
        player = Player("format_test", tasks_dir=tmp_path, provider_name="doubao")

        # V2 format has 'text' field on type steps
        type_step = player.task_data["steps"][1]
        assert type_step["action"] == "type"
        assert "text" in type_step
        assert type_step["text"] == "hello world"

        # V2 format has 'nearby_text' on click steps
        click_step = player.task_data["steps"][0]
        assert click_step["action"] == "click"
        assert "nearby_text" in click_step
        assert click_step["nearby_text"] == ["Submit", "Cancel"]

        # keypress steps have compound keys with '+' separator
        keypress_step = player.task_data["steps"][2]
        assert keypress_step["action"] == "keypress"
        assert keypress_step["key"] == "ctrl+c"


# ---------------------------------------------------------------------------
# 3. _build_vision_prompt combines description, nearby_text, position
# ---------------------------------------------------------------------------

def test_player_build_vision_prompt():
    """_build_vision_prompt combines description, nearby_text, position into prompt string."""
    with tempfile.TemporaryDirectory() as tmp_path:
        setup_task(tmp_path, "prompt_test", V2_STEPS)
        player = Player("prompt_test", tasks_dir=tmp_path, provider_name="doubao")

        # Click step with description, nearby_text, and position
        click_step = V2_STEPS[0]
        prompt = player._build_vision_prompt(click_step)

        # Should contain the description
        assert "Submit" in prompt
        # Should contain nearby_text labels
        assert "Submit" in prompt
        assert "Cancel" in prompt
        # Should contain original position
        assert "400" in prompt
        assert "225" in prompt
        # Should follow the format pattern
        assert "near text labels" in prompt.lower()
        assert "originally at position" in prompt.lower()

        # Step without nearby_text — should still work
        type_step = V2_STEPS[1]
        prompt2 = player._build_vision_prompt(type_step)
        # Should contain the description even without nearby_text
        assert "hello" in prompt2


def test_player_build_vision_prompt_no_nearby_text():
    """_build_vision_prompt handles steps with no nearby_text gracefully."""
    with tempfile.TemporaryDirectory() as tmp_path:
        step_no_nearby = {
            "id": 1,
            "action": "click",
            "position": {"x": 100, "y": 200},
            "screenshot": "step-001.png",
            "key": None,
            "text": None,
            "description": "Click menu item",
            "nearby_text": None,
        }
        setup_task(tmp_path, "no_nearby", [step_no_nearby])
        player = Player("no_nearby", tasks_dir=tmp_path, provider_name="doubao")

        prompt = player._build_vision_prompt(step_no_nearby)
        assert "Click menu item" in prompt
        assert "100" in prompt
        assert "200" in prompt
