# Desktop Automator V2

LLM-driven desktop automation with semantic recording and Vision Provider replay.

## Architecture

V2 uses a 4-layer architecture:

| Layer | Purpose |
|-------|---------|
| Screen Capture | Cross-platform screenshots (X11/Wayland/Win32) with `mss` + `grim` |
| Semantic Recording | Merge raw events into semantic steps with nearby text annotations |
| Computer-Use Replay | Screenshot→Vision→execute→verify loop for adaptive replay |
| Vision Provider | doubao-seed-2.0-pro (default) or Anthropic Claude Vision for UI understanding |

### Vision Providers

| Provider | Model | Endpoint | Notes |
|----------|-------|----------|-------|
| doubao | doubao-seed-2.0-pro | `http://192.168.136.124:8080/v1` (OpenAI-compatible proxy) | Default, high accuracy on Chinese UI |
| anthropic | claude-sonnet-4-20250514 | Anthropic API (`ANTHROPIC_API_KEY`) | Supports computer-use loop |

## Features

- Semantic recording: consecutive keypresses merged into ~15 steps (not 206 raw events)
- Vision Provider replay: visual understanding replaces fragile OCR matching
- Computer-use loop: iterative screenshot analysis and action execution
- OSD floating window: live recording feedback with step count, elapsed time, and stop button
- Signal handling: SIGTERM/SIGINT safely saves recording data before exit
- Recording status: `.recording` file enables external status queries (`/desktop-automator status`)
- Cross-platform: X11, Wayland, and Windows
- Resolution-adaptive coordinate scaling
- Strict and flexible error handling modes

## Quick Start

### Install dependencies

```bash
# System: Tesseract OCR (optional, for fallback)
sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim  # Linux X11

# Wayland support
sudo apt-get install grim  # Wayland screenshot tool
# Or on GNOME: gnome-screenshot

# Python packages
pip install -r requirements.txt
```

### Record a task

```bash
python3 scripts/recorder.py --name my-task
# An OSD floating window appears showing recording state (REC indicator, step count, elapsed time)
# Stop recording by: clicking "Stop Recording" button, pressing Esc, or Ctrl+C
```

### Check recording status

```bash
python3 scripts/task_manager.py status
# Shows: active recording (task name, steps, elapsed time) or "No recording in progress"
```

### Replay a task

```bash
# Default: doubao Vision Provider
python3 scripts/player.py --task my-task --provider doubao

# Anthropic Vision Provider
python3 scripts/player.py --task my-task --provider anthropic --use-computer-use
```

### Use as Claude Code Skill

```
/desktop-automator record my-task
/desktop-automator replay my-task
/desktop-automator status
/desktop-automator list
/desktop-automator info my-task
/desktop-automator delete my-task
```

## Wayland Support

V2 adds Wayland support alongside X11:

- **X11**: Uses `mss` for screen capture (default on most Linux desktops)
- **Wayland**: Uses `grim` for screen capture (Wayland-native screenshot tool)
- The recorder detects the display server at startup and saves it in `task.json`

## Performance Comparison

| Metric | V1 | V2 |
|--------|----|----|
| Recorded steps | 206 raw events | ~15 semantic steps |
| Replay strategy | OCR-first, fragile | Vision Provider, robust |
| OCR failures | Common (broken matching) | Rare (Vision understands context) |
| Typical replay time | 2-3 minutes | ~30 seconds |
| Wayland support | None | Full (grim + gnome-screenshot) |
| Recording feedback | Terminal only | OSD window + status command |
| Data safety | Lost on interruption | SIGTERM/SIGINT saves data |

## Task Format

V2 `task.json` includes semantic fields:

```json
{
  "name": "my-task",
  "display_server": "wayland",
  "steps": [
    {
      "type": "click",
      "x": 500,
      "y": 300,
      "nearby_text": "Save",
      "text": "Save",
      "description": "Click Save button",
      "screenshot": "step_001.png"
    },
    {
      "type": "type",
      "text": "Hello World",
      "description": "Type greeting in text field",
      "screenshot": "step_002.png"
    }
  ]
}
```

Key new fields:
- `display_server`: "x11" or "wayland" — detected at record time
- `nearby_text`: Text near the click location for Vision matching
- `text`: The typed text or button label
- `description`: Human-readable step description
