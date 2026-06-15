---
name: desktop-automator
description: "录制桌面操作并自动回放。支持鼠标点击、键盘输入的录制，通过本地 OCR 和远端视觉 API 识别 UI 元素进行自适应回放。跨平台支持 Linux 和 Windows。"
license: MIT
---

# Desktop Automator

录制桌面操作并自动回放，支持 AI 视觉识别。

## Commands

### 录制桌面操作

```
/desktop-automator record <task-name>
```

执行以下步骤：
1. 运行: `cd desktop-automator && python scripts/recorder.py --name <task-name>`
2. 告知用户：录制已开始，按 Esc 键停止
3. 录制脚本会自动捕获鼠标点击和键盘输入，每步保存截图
4. 当脚本结束时，确认录制数据已保存

### 回放录制操作

```
/desktop-automator replay <task-name>
```

执行以下步骤：
1. 运行: `cd desktop-automator && python scripts/player.py --task <task-name> --mode flexible --delay 1.0`
2. 观察输出，每步报告执行状态
3. 如果某步失败：
   - 在 flexible 模式下，报告失败但继续
   - 在 strict 模式下，停止回放
4. 回放结束后，汇总结果

可选参数：
- `--mode strict|flexible` — 严格模式遇错停止，灵活模式跳过继续
- `--delay <seconds>` — 步骤间延迟（默认 1.0 秒）

### 列出已录制任务

```
/desktop-automator list
```

运行: `cd desktop-automator && python scripts/task_manager.py list`

## 前置条件

### 系统依赖
- **Linux**: `sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim`
- **Windows**: 下载安装 [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)

### Python 依赖
```bash
cd desktop-automator && pip install -r requirements.txt
```

### API Key（可选，用于远端视觉识别）
设置环境变量: `ANTHROPIC_API_KEY=sk-ant-...`
如果不设置，回放将只使用本地 OCR，识别能力受限。

## 录制说明

- 录制时每次鼠标点击或键盘输入都会自动截屏并记录
- 建议操作时缓慢、明确，避免快速连续操作
- 按 Esc 键停止录制
- 录制数据保存在 `tasks/<task-name>/` 目录

## 回放说明

回放使用混合视觉识别策略：
1. **本地 OCR**（优先）— 提取屏幕文字，通过文字匹配定位目标元素
2. **远端视觉 API**（兜底）— 当 OCR 无法匹配时，调用 Claude Vision 分析截图
3. **坐标回退** — 如果以上都失败，使用录制时的原始坐标（可能因分辨率变化不准确）

如果遇到分辨率变化，会自动缩放坐标。

## Platform Support

- **Linux**: X11 显示服务器，需要桌面环境
- **Windows**: Win32，原生支持