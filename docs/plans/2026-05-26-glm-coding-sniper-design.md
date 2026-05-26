# GLM Coding Pro 抢购脚本设计

## 目标

在 https://bigmodel.cn/glm-coding 页面自动抢购 "连续包年套餐" Pro 版本。
补货时间：2026-05-26 10:00。

## 方案选择

- **形态**: Tampermonkey 用户脚本
- **策略**: 网络分析 + API 直调（主通道）+ UI 按钮点击（回退通道）

## 架构

```
Tampermonkey Script (@match bigmodel.cn/glm-coding*)
├── NetworkInterceptor: Hook fetch/XHR，记录购买相关 API
├── APIAnalyzer: 从拦截的请求中识别下单 API 和库存查询 API
├── Scheduler: 时间驱动的轮询调度（9:58 开始，200ms 高频）
│   ├── API 通道: 直接 fetch 下单 API（优先）
│   └── UI 通道: 轮询按钮状态并 click（回退）
├── UIOverlay: 右下角状态面板（倒计时/状态/通道）
└── DedupGuard: 成功后停止所有通道，防止重复下单
```

## 模块细节

### NetworkInterceptor
- Hook `window.fetch` 和 `XMLHttpRequest.prototype.send`
- 过滤 URL 关键词: `order|pay|purchase|subscribe|plan|product|sku|create|renew|contract`
- 记录完整 URL、method、headers、body

### APIAnalyzer
- 下单 API 匹配优先级: `create` > `order` > `subscribe` > `purchase`
- 库存/状态 API 匹配: `product|plan|sku|stock|detail|status|info`
- 自动提取参数格式（JSON body schema）

### Scheduler
- Phase 1 (页面打开 → 09:57:59): 静默记录网络请求
- Phase 2 (09:58:00 → 09:59:39): 低频轮询库存 API (1s)
- Phase 3 (09:59:40 → 成功): 高频轮询 (200ms)，API 优先
- 回退: API 通道连续 3 次失败 → 切 UI 通道
- 超时: 10:01:00 仍未成功 → 提示手动

### UIOverlay
- 位置: 页面右下角 fixed
- 内容: 倒计时 | 当前通道 | 最近请求状态
- 颜色: 绿(成功) / 黄(轮询中) / 红(失败)
- 可折叠/最小化

### DedupGuard
- 下单成功后 `scheduler.stop()`，设置 `isPurchased = true`
- 所有轮询立即停止

## 文件结构

```
glm-coding-sniper/
├── SKILL.md
├── glm-coding-sniper.user.js    # Tampermonkey 脚本
└── README.md
```

## 配置

脚本内可直接修改：
- `TARGET_TIME`: 目标时间 (默认 "2026-05-26T10:00:00+08:00")
- `POLL_INTERVAL`: 高频轮询间隔 (默认 200ms)
- `EARLY_START`: 提前开始时间 (默认 120s，即 09:58)
- `HIGH_FREQ_OFFSET`: 高频切换时间 (默认 20s，即 09:59:40)
