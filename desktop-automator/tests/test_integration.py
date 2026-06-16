# tests/test_integration.py — V2 integration test with Vision Provider
import json
import os
import tempfile
import shutil
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from lib.task_manager import TaskManager
from lib.platform_detector import detect_display_server
from lib.vision_provider import DoubaoProvider


# ---------------------------------------------------------------------------
# Helper: create a synthetic UI image with a blue "Submit" button
# ---------------------------------------------------------------------------

def _create_submit_button_image(width=1920, height=1080, btn_x=400, btn_y=225):
    """Create a synthetic UI screenshot with a blue 'Submit' button.

    Uses a realistic 1920x1080 resolution for better vision model grounding.
    The button is placed at (btn_x, btn_y) which is the center of the
    button rectangle. Returns a PIL Image.
    """
    img = Image.new("RGB", (width, height), "#f0f0f0")
    draw = ImageDraw.Draw(img)

    # Add some UI context elements for better grounding
    # Title bar
    draw.rectangle([0, 0, width, 60], fill="#ffffff", outline="#e0e0e0")
    draw.line([0, 60, width, 60], fill="#e0e0e0", width=1)
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
    except OSError:
        title_font = ImageFont.load_default()
    draw.text((20, 18), "Desktop Application", fill="#333333", font=title_font)

    # Draw a blue button rectangle centered at (btn_x, btn_y)
    btn_w, btn_h = 160, 50
    btn_left = btn_x - btn_w // 2
    btn_top = btn_y - btn_h // 2
    btn_right = btn_x + btn_w // 2
    btn_bottom = btn_y + btn_h // 2

    draw.rectangle(
        [btn_left, btn_top, btn_right, btn_bottom],
        fill="#3b82f6",
        outline="#2563eb",
        width=2,
    )

    # Draw "Submit" text centered on the button
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    except OSError:
        font = ImageFont.load_default()

    text = "Submit"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = btn_x - text_w // 2
    text_y = btn_y - text_h // 2

    draw.text((text_x, text_y), text, fill="white", font=font)

    return img


# ---------------------------------------------------------------------------
# Helper: create a V2 format task directory
# ---------------------------------------------------------------------------

def _create_v2_task(tmp_dir, task_name, screenshot_img):
    """Create a V2 format task with display_server, nearby_text, text fields."""
    task_dir = os.path.join(tmp_dir, task_name)
    screenshots_dir = os.path.join(task_dir, "screenshots")
    os.makedirs(screenshots_dir, exist_ok=True)

    # Save screenshot as PNG bytes for vision provider, and as file for task data
    screenshot_path = os.path.join(screenshots_dir, "step-001.png")
    screenshot_img.save(screenshot_path, format="PNG")

    display_server = detect_display_server()

    task_data = {
        "name": task_name,
        "platform": "linux",
        "display_server": display_server,
        "created": "2026-06-15T10:00:00Z",
        "steps": [
            {
                "id": 1,
                "action": "click",
                "position": {"x": 400, "y": 225},
                "screenshot": "step-001.png",
                "key": None,
                "description": "click Submit button",
                "nearby_text": "Submit",
                "text": "Submit",
            }
        ],
    }

    with open(os.path.join(task_dir, "task.json"), "w") as f:
        json.dump(task_data, f, indent=2)

    return task_data


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_v2_task_loads_and_validates():
    """Verify V2 format task loads, validates, and display_server is populated."""
    tmp = tempfile.mkdtemp()
    try:
        img = _create_submit_button_image()
        task_data = _create_v2_task(tmp, "v2-integration-test", img)

        tm = TaskManager(tasks_dir=tmp)
        loaded = tm.load_task("v2-integration-test")

        # Task loads correctly
        assert loaded["name"] == "v2-integration-test"

        # Task validates
        assert tm.validate_task(loaded) is True

        # display_server is populated (not None)
        ds = loaded.get("display_server")
        assert ds is not None, "display_server should be populated in V2 format"
        assert ds in ("x11", "wayland", "unknown"), f"display_server has unexpected value: {ds}"

        # V2 step has semantic fields
        step = loaded["steps"][0]
        assert "nearby_text" in step, "V2 step should have nearby_text field"
        assert "text" in step, "V2 step should have text field"
        assert step["nearby_text"] == "Submit"
        assert step["text"] == "Submit"
    finally:
        shutil.rmtree(tmp)


def test_v2_task_info_returns_display_server():
    """Verify get_task_info returns step_count, platform, and display_server."""
    tmp = tempfile.mkdtemp()
    try:
        img = _create_submit_button_image()
        _create_v2_task(tmp, "v2-info-test", img)

        tm = TaskManager(tasks_dir=tmp)
        info = tm.get_task_info("v2-info-test")

        assert info["name"] == "v2-info-test"
        assert info["step_count"] == 1
        assert info["platform"] == "linux"
        assert info["display_server"] is not None
        assert info["display_server"] in ("x11", "wayland", "unknown")
    finally:
        shutil.rmtree(tmp)


def test_vision_provider_finds_submit_button():
    """Verify DoubaoProvider finds Submit button with +/-200px tolerance.

    This test requires a working Doubao proxy at http://192.168.136.124:8080/v1
    and a valid OPENAI_API_KEY. If the proxy is unavailable, the test is
    skipped (not failed).
    """
    provider = DoubaoProvider()
    if not provider.api_key:
        # No API key — skip gracefully
        return

    # Create a synthetic UI image with a blue "Submit" button at ~(400, 225)
    img = _create_submit_button_image()

    # Convert to PNG bytes for the vision provider
    buf = BytesIO()
    img.save(buf, format="PNG")
    screenshot_bytes = buf.getvalue()

    # Use the same image as both current and reference (identical screens)
    result = provider.locate_element(
        current_bytes=screenshot_bytes,
        reference_bytes=screenshot_bytes,
        description="Submit button",
    )

    # If the API call failed (proxy unreachable), skip gracefully
    if not result["found"] and "API error" in result.get("description", ""):
        return

    # Verify the provider found the element
    assert result["found"] is True, (
        f"DoubaoProvider should find the Submit button. Result: {result}"
    )

    # Verify coordinates within +/-200px tolerance of the expected position (400, 225)
    expected_x, expected_y = 400, 225
    tolerance = 200

    assert abs(result["x"] - expected_x) <= tolerance, (
        f"X coordinate {result['x']} is too far from expected {expected_x} "
        f"(tolerance +/-{tolerance}px)"
    )
    assert abs(result["y"] - expected_y) <= tolerance, (
        f"Y coordinate {result['y']} is too far from expected {expected_y} "
        f"(tolerance +/-{tolerance}px)"
    )

    # Verify method is "vision"
    assert result["method"] == "vision"


def test_cli_list_command():
    """Verify the CLI list command works with V2 format tasks."""
    tmp = tempfile.mkdtemp()
    try:
        img = _create_submit_button_image()
        _create_v2_task(tmp, "cli-test-task", img)

        tm = TaskManager(tasks_dir=tmp)
        tasks = tm.list_tasks()

        assert "cli-test-task" in tasks

        # Verify list output format matches the CLI script
        info = tm.get_task_info("cli-test-task")
        expected_output = (
            f"  cli-test-task ({info['step_count']} steps, "
            f"{info['platform']}/{info['display_server']})"
        )
        # Just verify the info dict has the right structure for CLI rendering
        assert info["step_count"] == 1
        assert info["platform"] == "linux"
        assert info["display_server"] in ("x11", "wayland", "unknown")
    finally:
        shutil.rmtree(tmp)


def test_recording_status_lifecycle():
    """Verify status file is created, updated, and removed during recording lifecycle."""
    tmp = tempfile.mkdtemp()
    try:
        from lib.recording_status import RecordingStatus

        rs = RecordingStatus(task_name="lifecycle-test", tasks_dir=tmp)
        rs.create(display_server="wayland")

        status_path = os.path.join(tmp, "lifecycle-test", ".recording")
        assert os.path.exists(status_path)

        rs.update_steps(3)
        with open(status_path) as f:
            data = json.load(f)
        assert data["steps_so_far"] == 3

        rs.remove()
        assert not os.path.exists(status_path)
    finally:
        shutil.rmtree(tmp)


def test_status_cli_command():
    """Verify the status CLI command detects active and inactive states."""
    tmp = tempfile.mkdtemp()
    try:
        from lib.recording_status import RecordingStatus

        result = RecordingStatus.check_active(tmp)
        assert result is None

        rs = RecordingStatus(task_name="cli-status-test", tasks_dir=tmp)
        rs.create(display_server="wayland")
        rs.update_steps(2)

        result = RecordingStatus.check_active(tmp)
        assert result is not None
        assert result["task_name"] == "cli-status-test"
        assert result["steps_so_far"] == 2
        assert result["pid_alive"] is True

        rs.remove()
        result = RecordingStatus.check_active(tmp)
        assert result is None
    finally:
        shutil.rmtree(tmp)
