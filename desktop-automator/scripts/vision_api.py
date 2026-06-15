# scripts/vision_api.py
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import base64
import json
import anthropic


class VisionApi:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.client = anthropic.Anthropic(api_key=self.api_key) if self.api_key else None

    def locate_element(self, current_image_bytes, reference_image_bytes, target_description):
        if not self.client:
            return {"found": False, "description": "No API key configured"}
        current_b64 = base64.b64encode(current_image_bytes).decode("utf-8")
        reference_b64 = base64.b64encode(reference_image_bytes).decode("utf-8")
        return self._call_api(current_b64, reference_b64, target_description)

    def _call_api(self, current_b64, reference_b64, target_description):
        prompt = f"""Look at these two screenshots. The first is the current screen state. The second is a reference screenshot where the target element was at a specific position.

I need to find "{target_description}" on the current screen.

Respond ONLY with a JSON object:
- "found": true/false
- "x": pixel x-coordinate of the center of the element (if found)
- "y": pixel y-coordinate of the center of the element (if found)
- "description": brief description of what you found"""

        message = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": current_b64}},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": reference_b64}},
                    {"type": "text", "text": prompt}
                ]
            }]
        )
        try:
            text = message.content[0].text
            return json.loads(text)
        except (json.JSONDecodeError, IndexError):
            return {"found": False, "description": f"API response parse error: {text[:200]}"}
