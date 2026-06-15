# tests/test_vision_api.py
import base64
from unittest.mock import patch
from PIL import Image
from scripts.vision_api import VisionApi


def make_test_image_bytes():
    img = Image.new("RGB", (100, 100), "white")
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_vision_api_init():
    api = VisionApi(api_key="test-key")
    assert api.api_key == "test-key"


@patch("scripts.vision_api.VisionApi._call_api")
def test_locate_element_returns_coordinates(mock_call):
    mock_call.return_value = {
        "found": True,
        "x": 150,
        "y": 200,
        "description": "Settings button at top-right"
    }
    api = VisionApi(api_key="test-key")
    img_bytes = make_test_image_bytes()
    result = api.locate_element(img_bytes, img_bytes, "Settings button")
    assert result["found"] is True
    assert result["x"] == 150
    assert result["y"] == 200


@patch("scripts.vision_api.VisionApi._call_api")
def test_locate_element_not_found(mock_call):
    mock_call.return_value = {
        "found": False,
        "description": "Element not visible on screen"
    }
    api = VisionApi(api_key="test-key")
    img_bytes = make_test_image_bytes()
    result = api.locate_element(img_bytes, img_bytes, "Nonexistent")
    assert result["found"] is False
