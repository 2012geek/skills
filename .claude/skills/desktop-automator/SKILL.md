---
name: desktop-automator
description: "录制桌面操作并自动回放。V2 架构：语义录制（按键合并+语义步骤）+ Vision Provider 回放（doubao/Anthropic 视觉识别）+ computer-use 循环。支持 X11 和 Wayland。"
license: MIT
---

# Desktop Automator V2

LLM-driven desktop automation with semantic recording and Vision Provider replay.

## Commands

### Record Desktop Operations

```
/desktop-automator record <task-name>
```

Steps:
1. Run: `cd desktop-automator && python3 scripts/recorder.py --name <task-name>`
2. An OSD floating window appears showing recording state (REC indicator, step count, elapsed time)
3. The recorder captures mouse clicks and keyboard input, merging consecutive keypresses into semantic steps (not raw 206 events)
4. Each step saves a screenshot and records nearby text for later matching
5. Stop recording by: clicking 'Stop Recording' button in OSD window, pressing Esc, or Ctrl+C
6. On stop, task data is saved to `tasks/<task-name>/task.json` and OSD window closes

### Replay Recorded Operations

```
/desktop-automator replay <task-name>
```

Steps:
1. Run: `cd desktop-automator && python3 scripts/player.py --task <task-name> --provider doubao`
2. Observe output, report each step status
3. Replay uses the screenshot→Vision→execute→verify loop:
   - Take screenshot of current screen
   - Send to Vision Provider for analysis and action decision
   - Execute the decided action (click/type/wait)
   - Verify result, loop to next step
4. If a step fails:
   - In flexible mode: report and continue
   - In strict mode: stop replay
5. After completion, summarize results

Options:
- `--provider doubao|anthropic` — Vision Provider (default: doubao via proxy)
- `--mode strict|flexible` — Error handling mode
- `--delay <seconds>` — Step delay (default 1.0s)
- `--use-computer-use` — Enable Anthropic computer-use loop for replay

### List Recorded Tasks

```
/desktop-automator list
```

Run: `cd desktop-automator && python3 scripts/task_manager.py list`

Shows task name, step count, display_server (X11/Wayland), and creation time.

### Task Info and Delete

```
/desktop-automator info <task-name>
/desktop-automator delete <task-name>
```

### Check Recording Status

```
/desktop-automator status
```

Run: `cd desktop-automator && python3 scripts/task_manager.py status`

Shows:
- If recording active: task name, step count, elapsed time, PID
- If incomplete recording: warning about dead PID, cleanup suggestion
- If no recording: "No recording in progress"

## Prerequisites

### System Dependencies
- **Linux X11**: `sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim`
- **Linux Wayland**: `grim` (screenshot), `gnome-screenshot` (GNOME fallback)
- **Windows**: [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)

### Python Dependencies
```bash
cd desktop-automator && pip install -r requirements.txt
```
Requires: `openai>=1.0.0`, `anthropic>=0.40.0`, `numpy>=1.24.0`, `opencv-python>=4.8.0`

### Vision Provider Configuration
- **doubao** (default): Uses `doubao-seed-2.0-pro` via OpenAI-compatible proxy at `http://192.168.136.124:8080/v1`
- **anthropic**: Requires `ANTHROPIC_API_KEY` environment variable

## Architecture

V2 uses a semantic recording + Vision Provider replay architecture:

1. **Semantic Recording**: Raw events (e.g., 206 keypresses) are merged into ~15 semantic steps with nearby text annotations
2. **Vision Provider Replay**: Instead of OCR-first strategy, V2 uses Vision Provider as primary strategy:
   - Screenshot → Send to Vision Provider → Get action decision → Execute → Verify → Loop
3. **Computer-Use Loop**: Anthropic computer-use API enables iterative screenshot analysis and action execution

The screenshot→Vision→execute→verify loop replaces V1's fragile OCR-matching approach with robust visual understanding.
