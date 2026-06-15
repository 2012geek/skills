# scripts/ocr_engine.py
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytesseract
from PIL import Image

class OcrEngine:
    def __init__(self, lang="eng+chi_sim"):
        self.lang = lang

    def extract_text_blocks(self, image):
        data = pytesseract.image_to_data(image, lang=self.lang, output_type=pytesseract.Output.DICT)
        blocks = []
        for i in range(len(data["text"])):
            text = data["text"][i].strip()
            if text:
                blocks.append({
                    "text": text,
                    "x": data["left"][i],
                    "y": data["top"][i],
                    "width": data["width"][i],
                    "height": data["height"][i],
                    "confidence": int(data["conf"][i])
                })
        return blocks

    def find_text_position(self, target_text, blocks, min_confidence=30):
        candidates = []
        for b in blocks:
            if b["confidence"] >= min_confidence and target_text.lower() in b["text"].lower():
                candidates.append(b)
        if not candidates:
            return None
        best = max(candidates, key=lambda b: b["confidence"])
        return {
            "x": best["x"] + best["width"] // 2,
            "y": best["y"] + best["height"] // 2,
            "text": best["text"],
            "confidence": best["confidence"]
        }

    def match_reference_area(self, current_blocks, reference_blocks, target_x, target_y, search_radius=100):
        ref_texts = []
        for b in reference_blocks:
            if b["confidence"] >= 30:
                dist = abs(b["x"] + b["width"] // 2 - target_x) + abs(b["y"] + b["height"] // 2 - target_y)
                if dist <= search_radius:
                    ref_texts.append(b["text"].lower())
        if not ref_texts:
            return None
        for text in ref_texts:
            pos = self.find_text_position(text, current_blocks)
            if pos:
                return pos
        return None
