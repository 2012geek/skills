# Desktop Automator V3 Architecture

> 截屏→Vision 架构：零权限、跨平台、无需事件拦截

## 设计动机

V2 的事件拦截方案在 Wayland 上失败（pynput 被 GNOME 屏蔽，evdev 需要 sudo 权限），在 Windows 上需要另一套实现。核心问题：**拦截输入事件本质上是不可靠的**。

V3 改用"截屏→Vision 分析"架构：
- 录制阶段只做定时截图（1fps），不拦截任何事件
- 分析阶段把截图序列发给 Vision Provider，识别操作步骤
- 回放阶段沿用现有 Vision Provider 架构

**优势：**
- 零权限问题，普通用户即可运行
- 跨平台统一（Windows/macOS/Linux 同一套代码）
- 不依赖 Tesseract OCR、pynput、evdev
- Vision Provider 直接理解 UI 语义，比 OCR 更可靠

---

## 三阶段流程

```
录制 (Record)          →    分析 (Analyze)         →    回放 (Replay)
定时截图 1fps               Vision Provider 识别步骤      现有架构
OSD: REC+时间+帧数          分析进度窗口                  截图→Vision→执行→验证
task.json status=raw       task.json status=analyzed    task.json steps[]
```

---

## 阶段 1: 录制

### 录制器 = 定时截图收集器

录制器不再拦截任何输入事件，只做一件事：每秒截一张图。

**流程：**
1. 启动后，每秒调用 `capture_screen()` 截图
2. 保存为 `frames/frame-001.png`, `frame-002.png` ...
3. OSD 窗口显示：REC 标志 + 已录制时间 + 截图帧数
4. 停止方式：Esc / OSD Stop 按钮 / Ctrl+C
5. 信号安全：SIGTERM/SIGINT 安全保存数据
6. 不拦截任何输入事件，不需要 `/dev/input` 权限

### OSD 窗口（简化版）

录制期间只显示：
- **REC** 标志
- **时间**：已录制时长（MM:SS 格式）
- **帧数**：已截取的帧数
- **Stop** 按钮

步数在分析后才知道，录制期间不显示。

### task.json（录制阶段）

```json
{
  "name": "打开谷歌",
  "platform": "linux",
  "display_server": "wayland",
  "created": "2026-06-18T09:30:00Z",
  "status": "raw",
  "frames_count": 15,
  "frames_dir": "frames",
  "steps": []
}
```

`status: "raw"` 表示尚未分析。`steps` 为空，分析后填充。

---

## 阶段 2: 分析

### Vision Provider 批量分析

录制结束后立即启动分析（也可稍后手动触发）。

**分析流程：**

1. 读取 `task.json`，获取帧数和帧目录
2. 逐帧发送给 Vision Provider，每次发 2 张连续截图（当前帧 + 前一帧）
3. Vision Provider 对比前后帧差异，返回操作描述
4. 合并连续变化为语义步骤

**Vision 分析输入（每帧）：**

```
对比 frame-001.png 和 frame-002.png
→ Vision 返回: "用户点击了 Chrome 图标 at (282,65)"

对比 frame-005.png 和 frame-006.png
→ Vision 返回: "用户在搜索框输入了'天气'"

对比 frame-008.png 和 frame-009.png
→ Vision 返回: "用户按了回车键"
```

**帧差异检测（跳过无变化帧）：**
- 前后帧像素差异 <5% → 跳过，不发给 Vision（屏幕没变化）
- 前后帧像素差异 >=5% → 发给 Vision 分析（屏幕有变化）

**步骤合并：**
- 连续多帧都是同一类操作（输入文字）→ 合并为一个 "type" 步骤
- 单帧变化（点击）→ 单独一个 "click" 步骤

### 分析进度窗口

独立的 tkinter 窗口：
- 显示 "正在分析..." 标题
- 进度条：已分析 X / Y 帧
- 分析完成后显示 "识别到 N 个步骤"
- 自动关闭

### task.json（分析后）

```json
{
  "name": "打开谷歌",
  "platform": "linux",
  "display_server": "wayland",
  "created": "2026-06-18T09:30:00Z",
  "status": "analyzed",
  "frames_count": 15,
  "frames_dir": "frames",
  "steps": [
    {
      "id": 1,
      "action": "click",
      "position": {"x": 282, "y": 65},
      "screenshot": "frame-002.png",
      "description": "点击 Chrome 图标"
    },
    {
      "id": 2,
      "action": "type",
      "position": null,
      "screenshot": "frame-006.png",
      "text": "天气",
      "description": "输入 '天气'"
    },
    {
      "id": 3,
      "action": "keypress",
      "position": null,
      "screenshot": "frame-009.png",
      "key": "enter",
      "description": "按回车键"
    }
  ]
}
```

---

## 阶段 3: 回放

### 语义理解驱动的精准定位

V3 回放的核心改进是**语义理解**，分两层实现：

**第一层：分析阶段生成语义描述**

分析时 Vision Provider 不仅返回坐标，还返回**完整语义描述**：

```json
{
  "action": "click",
  "position": {"x": 282, "y": 65},
  "description": "点击 Chrome 图标"
}
```

对比 V2 的 OCR 方案：

| | V2（OCR） | V3（Vision） |
|--|-----------|--------------|
| 录制时的语义信息 | `nearby_text: ["Chrome", "Kiwi", "@Man"]` — OCR 抽取的零散文字碎片 | `description: "点击 Chrome 图标"` — Vision 理解的完整语义 |
| 语义质量 | 文字碎片，无上下文，容易误匹配 | 完整语义，知道"这是浏览器图标"，不是"屏幕上有 Chrome 字样" |

**第二层：回放阶段 Vision 重新定位**

回放时**不直接点录制坐标 (282,65)**，而是让 Vision Provider 重新定位：

```
输入: 当前屏幕截图 + 参考帧(frame-002.png) + 语义描述("点击 Chrome 图标")
→ Vision Provider 对比当前屏幕和参考帧
→ 返回当前屏幕上 Chrome 图标的真实位置 (300, 70)
→ pyautogui.click(300, 70)
```

为什么需要重新定位：
- 录制时 Chrome 在 (282,65)
- 回放时窗口位置可能变了，Chrome 移到了 (300,70)
- Vision Provider 对比当前屏幕和参考帧，重新找到目标元素的当前位置
- 语义描述作为关键提示词，帮助 Vision Provider 知道要找什么

**定位 fallback 链：**

```
1. Vision 定位（语义描述 + 参考帧）→ 最精准，适应界面变化
2. 坐标适配（CoordinateAdapter）→ 同分辨率直接点，不同分辨率缩放坐标
```

**回放精准度对比：**

| 场景 | V2 | V3 |
|------|----|----|
| 窗口位置变化 | OCR 文字匹配可能失败 | Vision 语义理解重新定位，成功率更高 |
| 界面布局变化 | OCR 找到的文字可能不在同一位置 | Vision 理解"Chrome 图标在哪"，不管位置 |
| 分辨率变化 | CoordinateAdapter 缩放坐标 | Vision 直接在新分辨率下定位 + 坐标适配 fallback |

### 回放实现

回放基本沿用 V2 架构，调整数据来源：

| 变化点 | V2 | V3 |
|--------|----|----|
| 截图目录 | `screenshots/` | `frames/` |
| 参考帧文件名 | `step-001.png` | `frame-NNN.png` |
| 步骤来源 | 录制时实时生成 | 分析后从 task.json 读取 |
| Vision 提示词 | `nearby_text + 原始坐标` | `语义描述 + 参考帧 + 原始坐标(fallback)` |
| pyautogui.FAILSAFE | 默认 True | False（避免边缘坐标崩溃） |

**回放流程：**
- click → 截图当前屏幕 + 参考帧 + 语义描述 → Vision Provider 重新定位 → pyautogui.click()
- type → pyautogui.write(text)
- keypress → pyautogui keyDown/press/keyUp

---

## 文件结构

### 任务目录

```
tasks/打开谷歌/
├── task.json          # status="raw" → "analyzed"
├── frames/            # 录制帧 (frame-001.png ~ frame-NNN.png)
│   ├── frame-001.png
│   ├── frame-002.png
│   └── ...
└── .recording         # 录制状态（分析前删除）
```

### 项目代码

| 文件 | V3 状态 | 说明 |
|------|---------|------|
| `scripts/recorder.py` | **重写** | 定时截图收集器，不再拦截事件 |
| `scripts/player.py` | **小修改** | 读取 frames/ 目录，FAILSAFE=False |
| `scripts/analyzer.py` | **新增** | Vision Provider 批量分析 + 进度窗口 |
| `scripts/task_manager.py` | **修改** | 增加 `analyze` 命令 |
| `lib/vision_provider.py` | **修改** | 增加帧对比分析能力 |
| `lib/screen_capture.py` | **保留** | 核心功能不变 |
| `lib/recording_status.py` | **保留** | 状态文件机制不变 |
| `lib/coordinate_adapter.py` | **保留** | 回放坐标适配不变 |
| `lib/osd_window.py` | **修改** | 简化为帧数+时间（不显示步数） |
| `lib/input_listener.py` | **删除** | 不再需要事件拦截 |
| `scripts/ocr_engine.py` | **删除** | Vision Provider 替代 OCR |
| `setup.sh` | **删除** | 不再需要 udev 规则 |

### requirements.txt 变化

| 包 | V2 | V3 | 原因 |
|----|----|----|------|
| pynput | 有 | **删除** | 不再拦截事件 |
| pytesseract | 有 | **删除** | Vision Provider 替代 OCR |
| pyautogui | 有 | 保留 | 回放需要 |
| mss | 有 | 保留 | X11 截图 |
| Pillow | 有 | 保留 | 截图处理 + 像素差异检测 |
| opencv-python | 有 | 保留 | 图像处理 |
| numpy | 有 | 保留 | opencv 依赖 |
| anthropic | 有 | 保留 | Vision Provider |
| openai | 有 | 保留 | doubao proxy |
| psutil | 有 | 保留 | 录制状态 PID 检查 |

---

## CLI 命令

```bash
# 录制（定时截图，不拦截事件）
python3 scripts/recorder.py --name 打开谷歌

# 录制结束后自动分析，也可手动触发
python3 scripts/analyzer.py --task 打开谷歌
python3 scripts/task_manager.py analyze 打开谷歌

# 回放（和 V2 一样）
python3 scripts/player.py --task 打开谷歌 --provider doubao

# 状态查询
python3 scripts/task_manager.py status 打开谷歌
# 输出: raw=未分析, analyzed=已分析可回放
```

---

## 1fps 的局限性

1fps 截图可能遗漏 <1秒内的快速操作。实际影响评估：

| 场景 | 风险 | 原因 |
|------|------|------|
| 普通桌面操作（点击、输入） | 低 | 每步通常 >1秒 |
| 快速连续点击 | 中 | <1秒内2次点击可能合并到1帧 |
| 快速按键组合 (Ctrl+C) | 中 | 1帧内完成，Vision 只能看到结果 |

缓解：Vision Provider 看的是前后帧差异，即使快速操作合并到1帧，只要下一帧能看到结果变化，Vision 能推断中间发生了什么。

未来可选增强：像素差异触发加速采样（变化时多截1-2帧），当前暂不实现。

---

## 与 V2 对比

| 维度 | V2（事件拦截） | V3（截图→Vision） |
|------|---------------|-------------------|
| Wayland 支持 | 需要 sudo + udev + evdev | 普通 user 即可 |
| Windows 支持 | 需要另一套实现 | 同一套代码 |
| 鼠标位置精度 | 估算累积，有偏差 | Vision 直接识别 |
| 键盘输入 | 需要键盘映射表 | Vision 看到屏幕上出现什么字 |
| 权限需求 | root 级别 | 普通用户 |
| 维护复杂度 | 3平台3套代码 | 1套代码全平台 |
| 录制实时反馈 | 显示步数 | 只显示帧数和时间 |
| 分析延迟 | 无（实时） | 录制后几秒到几十秒 |
