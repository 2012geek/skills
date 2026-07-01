# Desktop Automator V3

截屏→Vision 架构：零权限、跨平台、无需事件拦截。

## Architecture

V3 uses a three-stage screenshot→Vision analysis architecture:

| Stage | Purpose |
|-------|---------|
| **Record** | Periodic screenshot collection (1fps), no event interception |
| **Analyze** | Vision Provider batch analysis of frame pairs to detect operations |
| **Replay** | Vision re-location using semantic description + reference frame |

### Vision Providers

| Provider | Model | Endpoint | Notes |
|----------|-------|----------|-------|
| doubao | doubao-seed-2.0-pro | `http://192.168.136.124:8080/v1` (OpenAI-compatible proxy) | Default, high accuracy on Chinese UI |
| anthropic | claude-sonnet-4-20250514 | Anthropic API (`ANTHROPIC_API_KEY`) | Supports computer-use loop |

## Features

- Zero permissions: no sudo, no udev rules, no `/dev/input` access needed
- Cross-platform: same code on Wayland, X11, Windows, macOS
- 1fps screenshot recording: no event interception, works everywhere
- Vision Provider analysis: semantic understanding replaces OCR
- Semantic description replay: Vision re-locates elements by description, not coordinates
- Pixel difference detection: skip unchanged frames during analysis (saves API calls)
- OSD floating window: live recording feedback with frame count and elapsed time
- Signal handling: SIGTERM/SIGINT safely saves recording data before exit
- Recording status: `.recording` file enables external status queries
- Resolution-adaptive coordinate scaling
- Step merging: consecutive type actions merged into single steps

## Quick Start

### Install dependencies

```bash
# Wayland screenshot support
sudo apt-get install grim  # Wayland screenshot tool
# Or on GNOME: gnome-screenshot

# Python packages
pip install -r requirements.txt
```

No Tesseract, pynput, or udev setup needed!

### Record a task

```bash
python3 scripts/recorder.py --name my-task
# OSD shows REC indicator, elapsed time, and frame count
# Stop by: clicking Stop button, pressing Esc, or Ctrl+C
```

### Analyze recorded frames

```bash
python3 scripts/analyzer.py --task my-task --provider doubao
# Vision Provider analyzes frame pairs and identifies operations
# task.json updated: status="raw" → "analyzed", steps populated
```

### Replay a task

```bash
python3 scripts/player.py --task my-task --provider doubao
```

### Check recording status

```bash
python3 scripts/task_manager.py status
# Shows: active recording (task name, frames, elapsed time) or "No recording in progress"
```

### Use as Claude Code Skill

```
/desktop-automator record my-task
/desktop-automator analyze my-task
/desktop-automator replay my-task
/desktop-automator status
/desktop-automator list
/desktop-automator info my-task
/desktop-automator delete my-task
```

## Comparison with V2

| Dimension | V2 (Event Interception) | V3 (Screenshot→Vision) |
|-----------|------------------------|------------------------|
| Wayland support | Requires sudo + udev + evdev | Works as normal user |
| Windows support | Needs separate implementation | Same code |
| Mouse precision | Estimated, has drift | Vision directly identifies |
| Keyboard input | Needs key mapping tables | Vision sees what appears on screen |
| Permission needs | Root-level | Normal user |
| Dependencies | pynput, tesseract, opencv | None of those |
| Recording feedback | Shows step count | Shows frame count + time |
| Analysis delay | None (real-time) | A few seconds post-recording |

## Task Format

V3 `task.json` has a two-stage lifecycle:

### After recording (status="raw")

```json
{
  "name": "打开谷歌",
  "platform": "linux",
  "display_server": "wayland",
  "status": "raw",
  "frames_count": 15,
  "frames_dir": "frames",
  "steps": []
}
```

### After analysis (status="analyzed")

```json
{
  "name": "打开谷歌",
  "platform": "linux",
  "display_server": "wayland",
  "status": "analyzed",
  "frames_count": 15,
  "frames_dir": "frames",
  "steps": [
    {
      "id": 1,
      "action": "click",
      "position": {"x": 282, "y": 65},
      "description": "点击 Chrome 图标",
      "screenshot": "frame-002.png"
    },
    {
      "id": 2,
      "action": "type",
      "text": "天气",
      "description": "输入 '天气'",
      "screenshot": "frame-006.png"
    }
  ]
}
```

Key differences from V2:
- `status`: "raw" or "analyzed" — lifecycle indicator
- `frames_dir`/`frames_count`: frame-based, not step-based
- `description`: Chinese semantic description (not raw coordinates)
- No `nearby_text` — Vision Provider provides semantic understanding
