---
name: desktop-automator
description: "录制桌面操作并自动回放。支持鼠标点击、键盘输入的录制，通过本地 OCR 和远端视觉 API 识别 UI 元素进行自适应回放。"
license: MIT
---

# Desktop Automator

录制桌面操作并自动回放。

## Usage

录制桌面操作:
```bash
python scripts/recorder.py --name <task-name>
```

回放录制操作:
```bash
python scripts/player.py --task <task-name>
```

列出已录制任务:
```bash
python scripts/task_manager.py list
```

## Recording

启动录制后，脚本监听鼠标点击和键盘输入，每次操作自动截屏。
按 Esc 键停止录制，数据保存为 JSON + 截图文件。

## Replay

回放时逐步执行录制操作，每步先截取当前屏幕：
1. 本地 OCR 文字匹配定位元素（优先）
2. 远端视觉 API 分析截图定位元素（兜底）
3. 用识别到的坐标执行操作

## Platform Support

- Linux: X11 (xdotool, mss, pynput)
- Windows: Win32 (pyautogui, mss, pynput)

## Dependencies

系统依赖: Tesseract-OCR
Python 依赖: 见 requirements.txt