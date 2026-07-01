"""Pluggable Vision Provider interface for desktop-automator V2.

Defines the VisionProvider protocol and concrete implementations:
- DoubaoProvider: default provider using doubao-seed-2.0-pro via OpenAI-compatible proxy
- AnthropicProvider: optional provider using Anthropic Claude Vision API
- get_provider(): factory function to select provider by name or env var
"""

import base64
import json
import logging
import os
import re
from io import BytesIO
from typing import Optional, Protocol, runtime_checkable

from PIL import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Protocol definition
# ---------------------------------------------------------------------------


@runtime_checkable
class VisionProvider(Protocol):
    """Protocol for vision-based element location and frame analysis providers.

    All providers must implement:
    - locate_element: find an element on current screen by comparing with reference
    - analyze_frame_pair: detect what operation happened between two consecutive frames
    """

    def locate_element(
        self,
        current_bytes: bytes,
        reference_bytes: bytes,
        description: str,
    ) -> dict:
        ...

    def analyze_frame_pair(
        self,
        prev_bytes: bytes,
        curr_bytes: bytes,
        frame_index: int,
    ) -> dict:
        ...


# ---------------------------------------------------------------------------
# DoubaoProvider
# ---------------------------------------------------------------------------


class DoubaoProvider:
    """Vision provider using doubao-seed-2.0-pro via OpenAI-compatible proxy.

    Uses the proxy at http://192.168.136.124:8080/v1 which exposes an
    OpenAI-compatible chat completions API. Sends the screenshot as a
    base64 image_url and a text prompt asking for JSON coordinates.

    Best grounding accuracy with ~25px offset tolerance.
    """

    DEFAULT_MODEL = "doubao-seed-2.0-pro"
    DEFAULT_BASE_URL = "http://192.168.136.124:8080/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model or self.DEFAULT_MODEL
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self._client = None

    def _get_client(self):
        """Lazily create the OpenAI client to avoid import at module load time."""
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
            )
        return self._client

    def locate_element(
        self,
        current_bytes: bytes,
        reference_bytes: bytes,
        description: str,
    ) -> dict:
        """Locate an element on the current screen by comparing with a reference."""
        if not self.api_key:
            return {
                "found": False,
                "x": 0,
                "y": 0,
                "confidence": 0.0,
                "method": "vision",
                "description": "No API key configured for DoubaoProvider",
            }

        current_b64 = base64.b64encode(current_bytes).decode("utf-8")
        reference_b64 = base64.b64encode(reference_bytes).decode("utf-8")

        try:
            current_img = Image.open(BytesIO(current_bytes))
            current_dims = f"{current_img.width}x{current_img.height}"
        except Exception:
            current_dims = "unknown"

        return self._call_api(current_b64, reference_b64, description, current_dims)

    def analyze_frame_pair(
        self,
        prev_bytes: bytes,
        curr_bytes: bytes,
        frame_index: int,
    ) -> dict:
        """Analyze two consecutive frames to detect what operation happened.

        Returns a dict with:
        - action: "click", "type", "keypress", "scroll", "none"
        - position: {"x": int, "y": int} or null
        - text: str or null (for type actions)
        - key: str or null (for keypress actions)
        - description: str — human-readable description of the change
        - confidence: float — 0..1
        """
        if not self.api_key:
            return {
                "action": "none",
                "position": None,
                "text": None,
                "key": None,
                "description": "No API key configured",
                "confidence": 0.0,
            }

        prev_b64 = base64.b64encode(prev_bytes).decode("utf-8")
        curr_b64 = base64.b64encode(curr_bytes).decode("utf-8")

        prompt = (
            f"Compare these two consecutive screenshots from a desktop recording.\n"
            f"The first (frame {frame_index}) was taken before the second (frame {frame_index + 1}).\n\n"
            f"Identify what the user did between these two frames. Possible actions:\n"
            f"- click: user clicked on something (provide x,y pixel coordinates of where they clicked)\n"
            f"- type: user typed text (provide the text they typed)\n"
            f"- keypress: user pressed a key like Enter, Tab, Escape, Ctrl+C etc. (provide the key name)\n"
            f"- scroll: user scrolled (provide direction)\n"
            f"- none: no significant change visible\n\n"
            f"Respond ONLY with a JSON object:\n"
            f"- \"action\": one of click/type/keypress/scroll/none\n"
            f"- \"position\": {{\"x\": int, \"y\": int}} for click (null for others)\n"
            f"- \"text\": string for type action (null for others)\n"
            f"- \"key\": string for keypress action (null for others)\n"
            f"- \"description\": brief Chinese description of what happened\n"
            f"- \"confidence\": your confidence from 0.0 to 1.0\n"
        )

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{prev_b64}"},
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{curr_b64}"},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
                max_tokens=1024,
            )

            raw_text = response.choices[0].message.content
            logger.debug("DoubaoProvider analyze response: %s", raw_text[:300])
            return self._parse_analysis_response(raw_text)

        except Exception as exc:
            logger.error("DoubaoProvider analyze call failed: %s", exc)
            return {
                "action": "none",
                "position": None,
                "text": None,
                "key": None,
                "description": f"API error: {exc}",
                "confidence": 0.0,
            }

    def _parse_analysis_response(self, raw_text: str) -> dict:
        """Parse JSON from frame analysis response.

        Strategy: try direct parse, then code blocks, then brace matching.
        Unlike locate_element, analysis responses have different keys (action, position, text, etc).
        """
        # Strategy 1: direct parse
        try:
            parsed = json.loads(raw_text)
            if "action" in parsed:
                return _normalize_analysis_result(parsed)
        except (json.JSONDecodeError, TypeError):
            pass

        # Strategy 2: extract from code blocks
        for pattern in [
            re.search(r"```json\s*\n?(.*?)\n?```", raw_text, re.DOTALL),
            re.search(r"```\s*\n?(.*?)\n?```", raw_text, re.DOTALL),
        ]:
            if pattern:
                try:
                    parsed = json.loads(pattern.group(1).strip())
                    if "action" in parsed:
                        return _normalize_analysis_result(parsed)
                except (json.JSONDecodeError, TypeError):
                    continue

        # Strategy 3: balanced braces
        brace_start = raw_text.find("{")
        if brace_start >= 0:
            depth = 0
            for i in range(brace_start, len(raw_text)):
                if raw_text[i] == "{":
                    depth += 1
                elif raw_text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = raw_text[brace_start : i + 1]
                        try:
                            parsed = json.loads(candidate)
                            if "action" in parsed:
                                return _normalize_analysis_result(parsed)
                        except (json.JSONDecodeError, TypeError):
                            break

        # Strategy 4: unparseable
        logger.warning("Could not parse DoubaoProvider analysis response: %s", raw_text[:200])
        return {
            "action": "none",
            "position": None,
            "text": None,
            "key": None,
            "description": f"Parse error: {raw_text[:200]}",
            "confidence": 0.0,
        }

    def _call_api(
        self,
        current_b64: str,
        reference_b64: str,
        description: str,
        current_dims: str,
    ) -> dict:
        """Send request to doubao proxy and parse response.

        Constructs the chat completion request with image_url content blocks
        and a text prompt requesting structured JSON output.
        """
        prompt = (
            f"Look at these two screenshots. "
            f"The first is the current screen state ({current_dims} pixels). "
            f"The second is a reference screenshot where the target element was visible.\n\n"
            f"I need to find \"{description}\" on the current screen.\n\n"
            f"Respond ONLY with a JSON object (no other text):\n"
            f"- \"found\": true or false\n"
            f"- \"x\": pixel x-coordinate of the center of the element (integer, if found)\n"
            f"- \"y\": pixel y-coordinate of the center of the element (integer, if found)\n"
            f"- \"confidence\": your confidence score from 0.0 to 1.0\n"
            f"- \"description\": brief description of what you found (or why not found)\n"
        )

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{current_b64}",
                                },
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{reference_b64}",
                                },
                            },
                            {
                                "type": "text",
                                "text": prompt,
                            },
                        ],
                    }
                ],
                max_tokens=1024,
            )

            raw_text = response.choices[0].message.content
            logger.debug("DoubaoProvider raw response: %s", raw_text[:300])
            return self._parse_json_response(raw_text)

        except Exception as exc:
            logger.error("DoubaoProvider API call failed: %s", exc)
            return {
                "found": False,
                "x": 0,
                "y": 0,
                "confidence": 0.0,
                "method": "vision",
                "description": f"DoubaoProvider API error: {exc}",
            }

    def _parse_json_response(self, raw_text: str) -> dict:
        """Parse JSON from the model response with robust fallback handling.

        Strategy:
        1. Direct json.loads — works if model returns clean JSON
        2. Extract from ```json``` code block — models often wrap JSON this way
        3. Find balanced {/} braces — handles partial responses with surrounding text
        4. Return not-found dict — unparseable response
        """
        # Strategy 1: direct parse
        try:
            result = json.loads(raw_text)
            return _normalize_result(result)
        except (json.JSONDecodeError, TypeError):
            pass

        # Strategy 2: extract from ```json``` code block
        json_block_match = re.search(r"```json\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
        if json_block_match:
            try:
                result = json.loads(json_block_match.group(1).strip())
                return _normalize_result(result)
            except (json.JSONDecodeError, TypeError):
                pass

        # Strategy 2b: also try ``` blocks without explicit json label
        code_block_match = re.search(r"```\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
        if code_block_match and code_block_match != json_block_match:
            try:
                result = json.loads(code_block_match.group(1).strip())
                return _normalize_result(result)
            except (json.JSONDecodeError, TypeError):
                pass

        # Strategy 3: find balanced braces — extract the largest valid JSON object
        brace_start = raw_text.find("{")
        if brace_start >= 0:
            # Find the matching closing brace by counting depth
            depth = 0
            for i in range(brace_start, len(raw_text)):
                if raw_text[i] == "{":
                    depth += 1
                elif raw_text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = raw_text[brace_start : i + 1]
                        try:
                            result = json.loads(candidate)
                            return _normalize_result(result)
                        except (json.JSONDecodeError, TypeError):
                            break  # no valid JSON found via brace matching

        # Strategy 4: unparseable — return not-found
        logger.warning("Could not parse doubao response as JSON: %s", raw_text[:200])
        return {
            "found": False,
            "x": 0,
            "y": 0,
            "confidence": 0.0,
            "method": "vision",
            "description": f"Parse error: could not extract JSON from response. Raw: {raw_text[:200]}",
        }


# ---------------------------------------------------------------------------
# AnthropicProvider
# ---------------------------------------------------------------------------


class AnthropicProvider:
    """Vision provider using Anthropic Claude Vision API.

    Optional provider for environments where Anthropic API is available.
    Uses the claude-sonnet model with vision capability.
    """

    DEFAULT_MODEL = "claude-sonnet-4-6"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = model or self.DEFAULT_MODEL
        self._client = None

    def _get_client(self):
        """Lazily create the Anthropic client."""
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self.api_key)
        return self._client

    def locate_element(
        self,
        current_bytes: bytes,
        reference_bytes: bytes,
        description: str,
    ) -> dict:
        """Locate an element using Anthropic Claude Vision API."""
        if not self.api_key:
            return {
                "found": False,
                "x": 0,
                "y": 0,
                "confidence": 0.0,
                "method": "vision",
                "description": "No API key configured for AnthropicProvider",
            }

        current_b64 = base64.b64encode(current_bytes).decode("utf-8")
        reference_b64 = base64.b64encode(reference_bytes).decode("utf-8")

        try:
            current_img = Image.open(BytesIO(current_bytes))
            current_dims = f"{current_img.width}x{current_img.height}"
        except Exception:
            current_dims = "unknown"

        return self._call_api(current_b64, reference_b64, description, current_dims)

    def analyze_frame_pair(
        self,
        prev_bytes: bytes,
        curr_bytes: bytes,
        frame_index: int,
    ) -> dict:
        """Analyze two consecutive frames to detect what operation happened."""
        if not self.api_key:
            return {
                "action": "none",
                "position": None,
                "text": None,
                "key": None,
                "description": "No API key configured",
                "confidence": 0.0,
            }

        prev_b64 = base64.b64encode(prev_bytes).decode("utf-8")
        curr_b64 = base64.b64encode(curr_bytes).decode("utf-8")

        prompt = (
            "Compare these two consecutive screenshots from a desktop recording.\n"
            f"The first (frame {frame_index}) was taken before the second (frame {frame_index + 1}).\n\n"
            "Identify what the user did between these two frames. Possible actions:\n"
            "- click: user clicked on something (provide x,y pixel coordinates)\n"
            "- type: user typed text (provide the text)\n"
            "- keypress: user pressed a key like Enter, Tab, Escape, Ctrl+C (provide the key name)\n"
            "- scroll: user scrolled (provide direction)\n"
            "- none: no significant change visible\n\n"
            "Respond ONLY with a JSON object:\n"
            "- \"action\": one of click/type/keypress/scroll/none\n"
            "- \"position\": {\"x\": int, \"y\": int} for click (null for others)\n"
            "- \"text\": string for type action (null for others)\n"
            "- \"key\": string for keypress action (null for others)\n"
            "- \"description\": brief Chinese description of what happened\n"
            "- \"confidence\": your confidence from 0.0 to 1.0\n"
        )

        try:
            client = self._get_client()
            message = client.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": prev_b64,
                                },
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": curr_b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )

            raw_text = message.content[0].text
            logger.debug("AnthropicProvider analyze response: %s", raw_text[:300])
            return self._parse_analysis_response(raw_text)

        except Exception as exc:
            logger.error("AnthropicProvider analyze call failed: %s", exc)
            return {
                "action": "none",
                "position": None,
                "text": None,
                "key": None,
                "description": f"API error: {exc}",
                "confidence": 0.0,
            }

    def _parse_analysis_response(self, raw_text: str) -> dict:
        """Parse JSON from frame analysis response."""
        # Try direct parse first
        try:
            parsed = json.loads(raw_text)
            return _normalize_analysis_result(parsed)
        except (json.JSONDecodeError, TypeError):
            pass

        # Try code blocks
        for pattern in [
            re.search(r"```json\s*\n?(.*?)\n?```", raw_text, re.DOTALL),
            re.search(r"```\s*\n?(.*?)\n?```", raw_text, re.DOTALL),
        ]:
            if pattern:
                try:
                    parsed = json.loads(pattern.group(1).strip())
                    return _normalize_analysis_result(parsed)
                except (json.JSONDecodeError, TypeError):
                    continue

        # Try balanced braces
        brace_start = raw_text.find("{")
        if brace_start >= 0:
            depth = 0
            for i in range(brace_start, len(raw_text)):
                if raw_text[i] == "{":
                    depth += 1
                elif raw_text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = raw_text[brace_start : i + 1]
                        try:
                            parsed = json.loads(candidate)
                            return _normalize_analysis_result(parsed)
                        except (json.JSONDecodeError, TypeError):
                            break

        logger.warning("Could not parse Anthropic analysis response: %s", raw_text[:200])
        return {
            "action": "none",
            "position": None,
            "text": None,
            "key": None,
            "description": f"Parse error: {raw_text[:200]}",
            "confidence": 0.0,
        }

    def _call_api(
        self,
        current_b64: str,
        reference_b64: str,
        description: str,
        current_dims: str,
    ) -> dict:
        """Send request to Anthropic Claude Vision API."""
        prompt = (
            f"Look at these two screenshots. "
            f"The first is the current screen state ({current_dims} pixels). "
            f"The second is a reference screenshot where the target element was visible.\n\n"
            f"I need to find \"{description}\" on the current screen.\n\n"
            f"Respond ONLY with a JSON object (no other text):\n"
            f"- \"found\": true or false\n"
            f"- \"x\": pixel x-coordinate of the center of the element (integer, if found)\n"
            f"- \"y\": pixel y-coordinate of the center of the element (integer, if found)\n"
            f"- \"confidence\": your confidence score from 0.0 to 1.0\n"
            f"- \"description\": brief description of what you found (or why not found)\n"
        )

        try:
            client = self._get_client()
            message = client.messages.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": current_b64,
                                },
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": reference_b64,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }
                ],
            )

            raw_text = message.content[0].text
            logger.debug("AnthropicProvider raw response: %s", raw_text[:300])
            return self._parse_json_response(raw_text)

        except Exception as exc:
            logger.error("AnthropicProvider API call failed: %s", exc)
            return {
                "found": False,
                "x": 0,
                "y": 0,
                "confidence": 0.0,
                "method": "vision",
                "description": f"AnthropicProvider API error: {exc}",
            }

    def _parse_json_response(self, raw_text: str) -> dict:
        """Parse JSON response using the same robust strategy as DoubaoProvider."""
        # Strategy 1: direct parse
        try:
            result = json.loads(raw_text)
            return _normalize_result(result)
        except (json.JSONDecodeError, TypeError):
            pass

        # Strategy 2: extract from ```json``` code block
        json_block_match = re.search(r"```json\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
        if json_block_match:
            try:
                result = json.loads(json_block_match.group(1).strip())
                return _normalize_result(result)
            except (json.JSONDecodeError, TypeError):
                pass

        # Strategy 2b: generic code block
        code_block_match = re.search(r"```\s*\n?(.*?)\n?```", raw_text, re.DOTALL)
        if code_block_match and code_block_match != json_block_match:
            try:
                result = json.loads(code_block_match.group(1).strip())
                return _normalize_result(result)
            except (json.JSONDecodeError, TypeError):
                pass

        # Strategy 3: find balanced braces
        brace_start = raw_text.find("{")
        if brace_start >= 0:
            depth = 0
            for i in range(brace_start, len(raw_text)):
                if raw_text[i] == "{":
                    depth += 1
                elif raw_text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = raw_text[brace_start : i + 1]
                        try:
                            result = json.loads(candidate)
                            return _normalize_result(result)
                        except (json.JSONDecodeError, TypeError):
                            break

        # Strategy 4: unparseable
        logger.warning("Could not parse Anthropic response as JSON: %s", raw_text[:200])
        return {
            "found": False,
            "x": 0,
            "y": 0,
            "confidence": 0.0,
            "method": "vision",
            "description": f"Parse error: could not extract JSON from response. Raw: {raw_text[:200]}",
        }


# ---------------------------------------------------------------------------
# Result normalization
# ---------------------------------------------------------------------------


def _normalize_result(result: dict) -> dict:
    """Normalize a parsed JSON result to ensure all required keys are present.

    Guarantees the return dict has: found, x, y, confidence, method, description.
    """
    found = bool(result.get("found", False))
    return {
        "found": found,
        "x": int(result.get("x", 0)) if found else 0,
        "y": int(result.get("y", 0)) if found else 0,
        "confidence": float(result.get("confidence", 0.0)),
        "method": str(result.get("method", "vision")),
        "description": str(result.get("description", "")),
    }


def _normalize_analysis_result(result: dict) -> dict:
    """Normalize a frame analysis result to ensure all required keys are present.

    Guarantees: action, position, text, key, description, confidence.
    """
    action = str(result.get("action", "none"))
    pos = result.get("position")
    if pos is not None and isinstance(pos, dict):
        pos = {"x": int(pos.get("x", 0)), "y": int(pos.get("y", 0))}
    return {
        "action": action,
        "position": pos,
        "text": result.get("text") if action == "type" else None,
        "key": result.get("key") if action == "keypress" else None,
        "description": str(result.get("description", "")),
        "confidence": float(result.get("confidence", 0.5)),
    }


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

_PROVIDERS = {
    "doubao": DoubaoProvider,
    "anthropic": AnthropicProvider,
}


def get_provider(name: Optional[str] = None) -> VisionProvider:
    """Return a VisionProvider instance by name.

    If name is None, uses the VISION_PROVIDER env var, defaulting to "doubao".

    Args:
        name: Provider name ("doubao" or "anthropic"). None = use env/default.

    Returns:
        An instance of the named provider.

    Raises:
        ValueError: If the provider name is not recognized.
    """
    if name is None:
        name = os.environ.get("VISION_PROVIDER", "doubao")

    name = name.lower()
    cls = _PROVIDERS.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown vision provider '{name}'. "
            f"Available providers: {', '.join(sorted(_PROVIDERS.keys()))}"
        )
    return cls()
