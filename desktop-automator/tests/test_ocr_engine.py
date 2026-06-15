# tests/test_ocr_engine.py
import os
import tempfile
from PIL import Image, ImageDraw, ImageFont
from scripts.ocr_engine import OcrEngine

def make_test_image(text, width=400, height=100):
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 30), text, fill="black")
    return img

def test_ocr_extract_text_blocks():
    engine = OcrEngine()
    img = make_test_image("Click Here")
    blocks = engine.extract_text_blocks(img)
    found = any("Click" in b["text"] or "Here" in b["text"] for b in blocks)
    assert found, f"Expected 'Click Here' in OCR results, got: {blocks}"

def test_ocr_find_text_position():
    engine = OcrEngine()
    img = make_test_image("Settings")
    blocks = engine.extract_text_blocks(img)
    pos = engine.find_text_position("Settings", blocks)
    assert pos is not None, "Expected to find 'Settings' position"
    assert pos["x"] > 0 and pos["y"] > 0

def test_ocr_find_text_not_found():
    engine = OcrEngine()
    img = make_test_image("Hello")
    blocks = engine.extract_text_blocks(img)
    pos = engine.find_text_position("Nonexistent", blocks)
    assert pos is None
