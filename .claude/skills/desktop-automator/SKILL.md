---
name: desktop-automator
description: "录制桌面操作并自动回放。V3 架构：截屏→Vision 分析录制 + Vision Provider 回放。零权限、跨平台、无需事件拦截。"
license: MIT
---

# Desktop Automator V3

截屏→Vision 架构：零权限、跨平台、无需事件拦截。

## Commands

### Record Desktop Operations

```
/desktop-automator record <task-name>
```

Steps:
1. Run: `cd desktop-automator && python3 scripts/recorder.py --name <task-name>`
2. An OSD floating window appears showing REC indicator, elapsed time, and frame count
3. The recorder captures 1 screenshot per second (no event interception needed)
4. Frames are saved as `frames/frame-001.png`, `frame-002.png`, etc.
5. Stop recording by: clicking 'Stop Recording' button in OSD window, pressing Esc, or Ctrl+C
6. On stop, task.json is saved with `status="raw"` (no steps yet)

### Analyze Recorded Frames

```
/desktop-automator analyze <task-name>
```

Steps:
1. Run: `cd desktop-automator && python3 scripts/analyzer.py --task <task-name> --provider doubao`
2. Analyzer loads frames and computes pixel differences between consecutive frames
3. Changed frame pairs (diff >= 5%) are sent to Vision Provider for operation detection
4. Vision Provider returns action type, position, text, and semantic description
5. Consecutive type actions are merged into single steps
6. task.json is updated with `status="analyzed"` and populated steps

Options:
- `--provider doubao|anthropic` — Vision Provider (default: doubao via proxy)

### Replay Recorded Operations

```
/desktop-automator replay <task-name>
```

Steps:
1. Run: `cd desktop-automator && python3 scripts/player.py --task <task-name> --provider doubao`
2. Replay uses semantic description + reference frame for Vision re-location
3. For click actions: current screenshot + reference frame + description → Vision locates element → click
4. For type actions: pyautogui.write() directly
5. For keypress actions: pyautogui key sequence
6. After completion, summarize results

Options:
- `--provider doubao|anthropic` — Vision Provider (default: doubao via proxy)
- `--mode strict|flexible` — Error handling mode
- `--delay <seconds>` — Step delay (default 1.0s)

### List Recorded Tasks

```
/desktop-automator list
```

Run: `cd desktop-automator && python3 scripts/task_manager.py list`

Shows task name, status (raw/analyzed), step count, frame count, and display server.

### Analyze via Task Manager

```
/desktop-automator analyze <task-name>
```

Also available via: `python3 scripts/task_manager.py analyze --name <task-name>`

### Other Commands

```
/desktop-automator info <task-name>
/desktop-automator delete <task-name>
/desktop-automator status
```

## Prerequisites

### System Dependencies
- **Linux Wayland**: `grim` (screenshot) or `gnome-screenshot` (GNOME fallback)
- **Linux X11**: no extra dependencies (uses mss)
- **Windows/macOS**: no extra dependencies

### Python Dependencies
```bash
cd desktop-automator && pip install -r requirements.txt
```
Requires: `openai>=1.0.0`, `anthropic>=0.40.0`, `numpy>=1.24.0`, `Pillow>=9.0.0`, `mss>=6.0.0`, `pyautogui>=0.9.0`

No longer requires: `pynput`, `pytesseract`, `opencv-python`

### Vision Provider Configuration
- **doubao** (default): Uses `doubao-seed-2.0-pro` via OpenAI-compatible proxy at `http://192.168.136.124:8080/v1`
- **anthropic**: Requires `ANTHROPIC_API_KEY` environment variable

## Architecture

V3 uses a screenshot→Vision analysis architecture (three-stage flow):

1. **Record**: Periodic screenshot collection (1fps), no event interception. Zero permissions needed.
2. **Analyze**: Vision Provider batch analysis of frame pairs. Pixel diff skips unchanged frames. Merges consecutive operations into semantic steps.
3. **Replay**: Vision re-location using semantic description + reference frame. Coordinate adaptation as fallback.

Key advantages over V2:
- Works on Wayland without sudo/udev
- Same code on Windows/macOS/Linux
- Vision semantic understanding replaces OCR text matching
- No pynput, evdev, or Tesseract dependencies
