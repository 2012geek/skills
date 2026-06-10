# desktop-automator Skill Design

**Date:** 2026-06-10
**Status:** Approved

## Overview

A Claude Code skill that records user desktop operations (screenshots + event logs) and replays them autonomously. Uses a hybrid visual recognition strategy (local OCR + remote vision API) to locate UI elements during replay. Supports Linux and Windows platforms.

## Motivation

No existing tool fully satisfies "record user actions + AI-adaptive replay + cross-platform":
- **OpenAdapt**: closest match but ML module broken (issue #999), Linux support experimental, replay unreliable, heavy dependencies
- **Agent-S / OS-Copilot**: goal-driven, not record-replay workflow
- **Microsoft UFO**: Windows-only
- **Anthropic Computer Use**: no recording, container-only

Decision: self-build lightweight Python engine, borrowing OpenAdapt's architecture ideas (screenshot + event log recording, LLM replay).

## Architecture

### Recording Module

Python script using `pynput` for event listening + `mss` for screenshots.

**Flow:**
```
User: /desktop-automator record <task-name>
  -> Claude Code runs: python scripts/recorder.py --name <task-name>
  -> Recorder captures mouse clicks, keyboard input, screenshots per step
  -> Each step: save screenshot + event JSON entry
  -> User presses Esc to stop
  -> Save task.json + screenshots/ folder
```

**Event format:**
```json
{
  "name": "task-name",
  "platform": "linux",
  "created": "2026-06-10T10:00:00Z",
  "steps": [
    {
      "id": 1,
      "action": "click",
      "position": { "x": 950, "y": 25 },
      "screenshot": "step-001.png",
      "description": "click icon at top-left",
      "key": null
    },
    {
      "id": 2,
      "action": "keypress",
      "key": "ctrl+shift+p",
      "screenshot": "step-002.png",
      "description": "open command palette"
    }
  ]
}
```

### Replay Module

Claude Code reads recorded data, executes step-by-step with visual recognition.

**Flow per step:**
```
1. Capture current screen screenshot
2. Load reference screenshot from recording
3. Visual recognition (hybrid strategy):
   - Priority 1: Local OCR text matching (Tesseract/PaddleOCR)
   - Priority 2: Remote vision API (Claude Vision) when OCR fails
   - Priority 3: OpenCV template matching (optional)
4. Execute action with pyautogui (click/type/keypress)
5. Wait for UI response (configurable delay)
6. Optional: verify by comparing post-action screenshot
```

**Local OCR strategy:**
- OCR current screen -> get text blocks with coordinates
- OCR reference screenshot -> extract "text near target area"
- Match reference text in current screen -> calculate target element coordinates
- Fast, zero cost, works well for buttons/menus with text labels

**Remote vision API strategy:**
- Send current screenshot + reference screenshot to Claude Vision API
- API returns element location description and coordinate suggestions
- Convert to screen absolute coordinates
- High accuracy but requires API cost and network

### Error Handling

- If recognition fails on a step, pause and report to Claude Code
- Claude Code can adjust strategy or skip step based on context
- `--strict` mode: stop on any failure
- `--flexible` mode: skip failures and continue

## Skill Interface

Commands defined in SKILL.md:

- `/desktop-automator record <task-name>` — start recording
- `/desktop-automator replay <task-name>` — replay recorded task
- `/desktop-automator list` — list all recorded tasks

SKILL.md instructs Claude Code to:
- For record: run `python scripts/recorder.py --name <task-name>` via Bash
- For replay: run `python scripts/player.py --task <task-name>` via Bash, process output to decide next actions
- For list: run `python scripts/task_manager.py list` via Bash

## Cross-Platform Support

| Function | Linux | Windows |
|----------|-------|---------|
| Screen capture | mss / X11 | mss / Win32 |
| Mouse/key listening | pynput (X11) | pynput (Win32) |
| Mouse/key execution | pyautogui | pyautogui |
| OCR | Tesseract / PaddleOCR | Tesseract / PaddleOCR |

## File Structure

```
desktop-automator/
├── SKILL.md                    # Skill definition (Claude Code entry point)
├── README.md                   # User documentation
├── package.json                # Node.js package (skill convention)
├── requirements.txt            # Python dependencies
├── scripts/
│   ├── recorder.py             # Recording: event listening + screenshot capture
│   ├── player.py               # Replay engine: read task, recognize, execute
│   ├── ocr_engine.py           # Local OCR recognition (Tesseract/PaddleOCR)
│   ├── vision_api.py           # Remote vision API (Anthropic SDK)
│   └── screen_capture.py       # Cross-platform screenshot utility
├── lib/
│   ├── task_manager.py         # Task management (list/read/validate)
│   ├── coordinate_adapter.py   # Coordinate adaptation (resolution/DPI scaling)
│   └── platform_detector.py    # Platform detection (Linux/Windows)
├── tasks/                      # Recorded task storage
│   └── <task-name>/
│       ├── task.json           # Task step data
│       └── screenshots/        # Screenshot folder
├── agents/
│   └── replay-observer.md      # Replay observer agent (handle anomalies)
└── tests/
    ├── test_ocr_engine.py      # OCR recognition tests
    └── test_coordinate.py      # Coordinate adaptation tests
```

## Dependencies

Python (`requirements.txt`):
- pyautogui — cross-platform mouse/keyboard operations
- pynput — cross-platform mouse/keyboard event listening
- mss — fast cross-platform screenshot capture
- pillow — image processing
- pytesseract — Tesseract OCR Python interface
- paddleocr — PaddleOCR (optional, better Chinese OCR)
- anthropic — remote vision API calls
- opencv-python — template matching (optional)

System-level:
- Tesseract-OCR — must be installed separately (apt/brew/windows installer)
- Python >= 3.10

## Research References

- OpenAdapt (https://github.com/OpenAdaptAI/OpenAdapt) — architecture inspiration, but ML module broken, Linux support poor
- OmniParser (https://github.com/microsoft/OmniParser) — optional UI element detection layer
- Anthropic Computer Use API — reference for vision-based desktop interaction loop
- Agent-S (https://github.com/simular-ai/Agent-S) — reference for reflective planning in replay