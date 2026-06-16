# Desktop Automator V2 Refactor Design

## Problem Statement

The current desktop-automator has 4 critical issues:

1. **Wayland screenshot is all-black** — mss/pyautogui fail on Wayland, all 206 recorded screenshots are pure black (pixel value 0). OCR/Vision completely inoperative.
2. **Recording is too granular** — 206 steps: 88 clicks + 118 keypresses. Each key is recorded separately ("z","h","i","s","h","i" instead of "zhishi"). No semantic understanding.
3. **OCR is completely ineffective** — Tesseract returns 0 blocks on dark-theme modern desktops. The primary recognition strategy is broken.
4. **Replay is slow and rigid** — Each step does screenshot(0.1s) + OCR(0.4s) + coordinate matching, totaling 2-3 minutes for 206 steps. Cannot adapt to UI changes.

## Vision Provider Test Results

| Model | Image Input | Coordinate Accuracy | Usability |
|-------|-------------|---------------------|-----------|
| GLM-5.1 | No (text only) | N/A | Unusable |
| GLM-5 | Yes | Poor (y offset >200px) | Not suitable for grounding |
| doubao-seed-2.0-pro | Yes | Good (25px offset on simple UI) | Best available option |
| doubao-seed-2.0-lite | Yes | Good (25px offset) | Suitable |
| deepseek-v4-flash | N/A | N/A | Not available on proxy |

## Architecture: Layered Hybrid (Method C)

### Layer 1: Cross-Platform Screen Capture

Display server detection + multi-backend screenshot:

```
detect_display_server()
  → wayland: grim (wlroots) → xdg-desktop-portal (GNOME/KDE) → mss (XWayland fallback)
  → x11: mss (current, reliable)
  → windows: mss (reliable)
```

Input simulation follows same pattern:
- X11: pyautogui/pynput (current)
- Wayland: ydotool via uinput kernel module
- Windows: pyautogui (current)

### Layer 2: Semantic Recording

Replace granular event recording with semantic step recording:

- **Key merge**: Consecutive keypresses merged into text input events ("zhishi" not z,h,i,s,h,i)
- **Mouse move filtering**: Only record click/scroll/drag, discard move trajectory
- **Semantic annotation**: Each step gets window title + nearby OCR text (OCR runs on real screen, not black screenshots)
- **Intent extraction**: After recording ends, LLM analyzes step sequence to generate semantic descriptions ("Step 1-3: Open browser → Step 4-8: Type search query → Step 9: Click search button")

New task.json format:

```json
{
  "name": "打开google-查询天气",
  "platform": "linux",
  "display_server": "wayland",
  "created": "2026-06-15T...",
  "semantic_summary": "Open browser → Navigate to Google → Type '天气' → Click search",
  "steps": [
    {
      "id": 1,
      "action": "click",
      "description": "Click browser icon in taskbar",
      "position": {"x": 707, "y": 1107},
      "nearby_text": ["Firefox", "Chrome"],
      "window_title": "Desktop",
      "screenshot": "step-001.png"
    },
    {
      "id": 2,
      "action": "type",
      "description": "Type search query '天气'",
      "text": "天气",
      "position": {"x": 578, "y": 1130},
      "nearby_text": ["Google", "搜索"],
      "window_title": "Google - Firefox",
      "screenshot": "step-002.png"
    }
  ]
}
```

### Layer 3: LLM-Driven Computer-Use Replay Loop

Replace coordinate-matching replay with screenshot→Vision→execute→verify loop:

```
for each semantic step:
  1. Capture current screen (working Wayland/X11/Win capture)
  2. Send to Vision Provider with semantic description as prompt
  3. Provider returns: {"found": true, "x": 1140, "y": 620, "confidence": 0.85}
  4. If found → execute action (click/type/scroll) via pyautogui/ydotool
  5. Capture screen again → verify result
  6. If not found → retry with broader search / skip in flexible mode
```

Recording data serves as **reference context**, not direct replay instructions:

- Vision Provider prompt includes: "Previously, the user clicked [description] near text [nearby_text] in window [window_title]. Find the same element on the current screen."
- This makes replay adaptive to UI layout changes, resolution changes, and different window positions.

### Layer 4: Pluggable Vision Provider Interface

```python
class VisionProvider(Protocol):
    def locate_element(self, screenshot_bytes, reference_bytes, description) -> dict:
        # Returns {"found": bool, "x": int, "y": int, "confidence": float, "method": str}

class DoubaoProvider(VisionProvider):
    """Default provider — doubao-seed-2.0-pro via proxy"""
    # Uses OpenAI-compatible API at http://192.168.136.124:8080/v1
    # Best coordinate accuracy on current proxy (25px offset)

class AnthropicProvider(VisionProvider):
    """Anthropic Claude Vision — requires ANTHROPIC_API_KEY"""
    # Current implementation, upgraded to be primary when available

class CogAgentProvider(VisionProvider):
    """Zhipu CogAgent — future extension"""
    # Requires ZHIPU_API_KEY, uses bigmodel.cn API
```

Provider selection: configurable in config.json or via CLI flag `--provider doubao|anthropic|cogagent`

### Performance Optimization

| Metric | V1 (current) | V2 (target) |
|--------|--------------|-------------|
| Steps in recording | 206 raw events | ~15 semantic steps |
| OCR processing | 0.4s per step (broken) | Only during recording for annotation |
| Vision API calls | 0 (never reached) | 1 per semantic step (~5s) |
| Total replay time | 2-3 minutes (broken) | ~30 seconds (15 steps × 2s) |
| Replay resilience | Coordinate-only (breaks on any change) | Vision-guided (adapts to UI changes) |

## File Structure

```
desktop-automator/
├── SKILL.md                  # Updated skill definition
├── package.json              # Updated scripts
├── requirements.txt          # Updated deps (add dbus-python, etc.)
├── lib/
│   ├── screen_capture.py     # REWRITE: Wayland/X11/Win multi-backend
│   ├── platform_detector.py  # REWRITE: Add display_server detection
│   ├── coordinate_adapter.py # Keep (still needed for fallback)
│   ├── task_manager.py       # REWRITE: New semantic task format
│   ├── input_executor.py     # NEW: pyautogui/ydotool dual-backend
│   └── vision_provider.py    # NEW: Pluggable provider interface + DoubaoProvider
├── scripts/
│   ├── recorder.py           # REWRITE: Semantic recording with key merge + intent extraction
│   ├── player.py             # REWRITE: Computer-use loop with Vision Provider
│   ├── task_manager.py       # Keep (CLI wrapper)
├── agents/
│   ├── replay-observer.md    # Update: Computer-use failure handling
│   ├── intent-extractor.md   # NEW: LLM agent for post-recording intent extraction
├── tests/
│   ├── test_screen_capture.py    # REWRITE
│   ├── test_platform_detector.py # REWRITE
│   ├── test_recorder.py          # NEW: key merge, semantic annotation
│   ├── test_player.py            # NEW: computer-use loop
│   ├── test_vision_provider.py   # NEW: DoubaoProvider, provider interface
│   ├── test_task_manager.py      # REWRITE: new format
│   ├── test_integration.py       # REWRITE
├── README.md                 # Update
```

## Dependencies Changes

Add to requirements.txt:
- `dbus-python` or `python-dbus` (for xdg-desktop-portal Wayland fallback)
- No new pip packages for grim/ydotool (subprocess calls)

System dependencies:
- Linux Wayland: `grim` (wlroots) or `xdg-desktop-portal` + backend (GNOME/KDE)
- Linux Wayland input: `ydotool` (optional, for Wayland input simulation)
- Keep existing: tesseract-ocr, tesseract-ocr-chi-sim

## Implementation Order

1. Fix screen capture (Wayland support) — highest priority, everything depends on this
2. Rewrite platform_detector — add display_server detection
3. Create VisionProvider interface + DoubaoProvider — core of new replay
4. Rewrite recorder — semantic recording with key merge
5. Rewrite player — computer-use loop
6. Update task_manager — new format
7. Update tests and integration
8. Update SKILL.md and README.md
