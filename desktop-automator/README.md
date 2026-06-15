# Desktop Automator

Claude Code skill for recording and replaying desktop operations with AI-powered visual recognition.

## Features

- Record mouse clicks and keyboard input with automatic screenshots
- Replay with hybrid visual recognition (OCR + Vision API)
- Cross-platform: Linux and Windows
- Resolution-adaptive coordinate scaling
- Strict and flexible error handling modes

## Quick Start

### Install dependencies

```bash
# System: Tesseract OCR
sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim  # Linux
# Windows: download from https://github.com/UB-Mannheim/tesseract/wiki

# Python packages
pip install -r requirements.txt
```

### Record a task

```bash
python scripts/recorder.py --name my-task
# Click and type on screen, then press Esc to stop
```

### Replay a task

```bash
python scripts/player.py --task my-task
```

### Use as Claude Code Skill

In Claude Code:
```
/desktop-automator record my-task
/desktop-automator replay my-task
/desktop-automator list
```

## Vision API (Optional)

Set `ANTHROPIC_API_KEY` environment variable to enable Claude Vision fallback for complex UI elements that OCR cannot find.

Without the API key, replay relies solely on local OCR text matching.
