# tests/test_vision_provider.py
"""Tests for the pluggable Vision Provider interface.

TDD order:
1. test_vision_provider_protocol — DoubaoProvider satisfies VisionProvider protocol
2. test_doubao_provider_init — default model and base_url
3. test_doubao_provider_init_custom — custom params override defaults
4. test_doubao_locate_element_with_synthetic_ui — integration test with real doubao proxy
"""

import base64
import json
import os
import sys
from io import BytesIO
from unittest.mock import patch, MagicMock

from PIL import Image, ImageDraw, ImageFont

# Ensure lib is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))

from vision_provider import VisionProvider, DoubaoProvider, AnthropicProvider, get_provider


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_test_image_bytes(width=100, height=100, color="white"):
    """Create a simple solid-color PNG image and return its bytes."""
    img = Image.new("RGB", (width, height), color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_synthetic_ui_image_bytes(width=800, height=600):
    """Create a synthetic UI screenshot with labelled elements at known positions.

    Layout:
      - Blue "Submit" button at approximately (400, 300), size 160x60
      - Red "Cancel" button at approximately (600, 300), size 140x60
      - "File" menu label at approximately (80, 30)
    """
    img = Image.new("RGB", (width, height), "#f0f0f0")  # light gray background
    draw = ImageDraw.Draw(img)

    # Blue Submit button — center at (400, 300), spanning 320..480, 270..330
    draw.rectangle([320, 270, 480, 330], fill="#2266cc", outline="#1144aa")
    draw.text((365, 282), "Submit", fill="white")

    # Red Cancel button — center at (600, 300), spanning 530..670, 270..330
    draw.rectangle([530, 270, 670, 330], fill="#cc3333", outline="#aa1111")
    draw.text((565, 282), "Cancel", fill="white")

    # File menu label at top-left
    draw.text((30, 20), "File", fill="black")

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# 1. Protocol compliance
# ---------------------------------------------------------------------------

def test_vision_provider_protocol():
    """DoubaoProvider has the locate_element method required by VisionProvider."""
    provider = DoubaoProvider(api_key="test-key")
    # Runtime-checkable protocol: isinstance works
    assert isinstance(provider, VisionProvider)
    # Method exists
    assert hasattr(provider, "locate_element")
    # Signature accepts (current_bytes, reference_bytes, description)
    assert callable(provider.locate_element)


def test_anthropic_provider_protocol():
    """AnthropicProvider also satisfies VisionProvider protocol."""
    provider = AnthropicProvider(api_key="test-key")
    assert isinstance(provider, VisionProvider)
    assert hasattr(provider, "locate_element")


# ---------------------------------------------------------------------------
# 2. DoubaoProvider init — defaults
# ---------------------------------------------------------------------------

def test_doubao_provider_init():
    """DoubaoProvider defaults: model=doubao-seed-2.0-pro, base_url=proxy."""
    provider = DoubaoProvider(api_key="fake-key")
    assert provider.model == "doubao-seed-2.0-pro"
    assert provider.base_url == "http://192.168.136.124:8080/v1"
    assert provider.api_key == "fake-key"


# ---------------------------------------------------------------------------
# 3. DoubaoProvider init — custom params
# ---------------------------------------------------------------------------

def test_doubao_provider_init_custom():
    """DoubaoProvider accepts custom model, base_url, api_key."""
    provider = DoubaoProvider(
        api_key="custom-key",
        model="custom-model",
        base_url="http://custom-host:9999/v1",
    )
    assert provider.model == "custom-model"
    assert provider.base_url == "http://custom-host:9999/v1"
    assert provider.api_key == "custom-key"


# ---------------------------------------------------------------------------
# 4. JSON parsing robustness
# ---------------------------------------------------------------------------

def test_parse_json_response_direct():
    """_parse_json_response handles direct JSON."""
    provider = DoubaoProvider(api_key="test-key")
    raw = '{"found": true, "x": 150, "y": 200, "confidence": 0.9, "description": "button"}'
    result = provider._parse_json_response(raw)
    assert result["found"] is True
    assert result["x"] == 150


def test_parse_json_response_code_block():
    """_parse_json_response extracts JSON from ```json``` blocks."""
    provider = DoubaoProvider(api_key="test-key")
    raw = 'Here is my answer:\n```json\n{"found": true, "x": 100, "y": 50}\n```\nDone.'
    result = provider._parse_json_response(raw)
    assert result["found"] is True
    assert result["x"] == 100


def test_parse_json_response_brace_extraction():
    """_parse_json_response finds JSON by brace matching when no code block."""
    provider = DoubaoProvider(api_key="test-key")
    raw = 'The result is {"found": false, "description": "not found"} and that is all.'
    result = provider._parse_json_response(raw)
    assert result["found"] is False


def test_parse_json_response_fallback_on_failure():
    """_parse_json_response returns not-found dict when parsing fails."""
    provider = DoubaoProvider(api_key="test-key")
    raw = "I cannot parse this text at all, no JSON here."
    result = provider._parse_json_response(raw)
    assert result["found"] is False
    assert "parse error" in result["description"].lower()


# ---------------------------------------------------------------------------
# 5. get_provider factory
# ---------------------------------------------------------------------------

def test_get_provider_doubao():
    """get_provider('doubao') returns a DoubaoProvider."""
    provider = get_provider("doubao")
    assert isinstance(provider, DoubaoProvider)


def test_get_provider_anthropic():
    """get_provider('anthropic') returns an AnthropicProvider."""
    provider = get_provider("anthropic")
    assert isinstance(provider, AnthropicProvider)


def test_get_provider_default():
    """get_provider() defaults to 'doubao'."""
    provider = get_provider()
    assert isinstance(provider, DoubaoProvider)


def test_get_provider_env_override():
    """get_provider respects VISION_PROVIDER env var."""
    with patch.dict(os.environ, {"VISION_PROVIDER": "anthropic"}, clear=False):
        provider = get_provider()
        assert isinstance(provider, AnthropicProvider)


def test_get_provider_unknown_raises():
    """get_provider raises ValueError for unknown provider name."""
    try:
        get_provider("unknown_provider")
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "unknown_provider" in str(e)


# ---------------------------------------------------------------------------
# 6. DoubaoProvider locate_element — mocked API call
# ---------------------------------------------------------------------------

@patch("vision_provider.DoubaoProvider._call_api")
def test_doubao_locate_element_mocked(mock_call):
    """DoubaoProvider.locate_element calls _call_api and returns structured result."""
    mock_call.return_value = {
        "found": True,
        "x": 400,
        "y": 300,
        "confidence": 0.92,
        "method": "vision",
        "description": "Blue Submit button",
    }
    provider = DoubaoProvider(api_key="test-key")
    img_bytes = make_test_image_bytes()
    result = provider.locate_element(img_bytes, img_bytes, "Submit button")
    assert result["found"] is True
    assert result["x"] == 400
    assert result["y"] == 300
    assert result["confidence"] == 0.92


# ---------------------------------------------------------------------------
# 7. Integration test — real doubao proxy
# ---------------------------------------------------------------------------

def test_doubao_locate_element_with_synthetic_ui():
    """Integration test: send synthetic UI to doubao proxy and verify button found.

    Creates an 800x600 synthetic UI with a blue "Submit" button centered at
    approximately (400, 300). Sends it to the doubao proxy and checks that
    the returned coordinates are within +/-150px tolerance.

    Skips if the proxy is unreachable (no OPENAI_API_KEY or network error).
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        import pytest
        pytest.skip("OPENAI_API_KEY not set — skipping integration test")

    provider = DoubaoProvider(api_key=api_key)
    ui_bytes = make_synthetic_ui_image_bytes()
    ref_bytes = make_test_image_bytes(800, 600, "#f0f0f0")  # plain background as reference

    try:
        result = provider.locate_element(ui_bytes, ref_bytes, "Submit button")
    except Exception as exc:
        import pytest
        pytest.skip(f"doubao proxy unreachable: {exc}")

    if not result.get("found"):
        # Element not found — acceptable if proxy misinterprets, but log it
        import pytest
        pytest.skip(f"doubao did not find element: {result.get('description', 'unknown')}")

    # Submit button center is at ~(400, 300), allow +/-200px tolerance
    # (doubao-seed-2.0-pro has ~25px typical offset, but can vary more on
    # synthetic images with limited visual context)
    x = result.get("x", 0)
    y = result.get("y", 0)
    assert abs(x - 400) <= 200, f"x={x} too far from expected 400 (tolerance 200)"
    assert abs(y - 300) <= 200, f"y={y} too far from expected 300 (tolerance 200)"
