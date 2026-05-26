# GLM Coding Pro Sniper v2.0

Tampermonkey 用户脚本，在 [智谱 GLM Coding](https://bigmodel.cn/glm-coding) 页面自动抢购 "连续包年套餐" Pro 版本。

## v2.0 升级亮点

综合了 [GLM Coding Rush](https://gist.github.com/LessUp/e609e779fb7773cf279942f57a65719a) 和 [Greasyfork 前端按钮工具](https://greasyfork.org/en/scripts/571507) 的核心实现：

1. **JSON.parse 深层补丁** — 在解析层面翻转 `isSoldOut`/`disabled`/`soldOut`/`stock` 状态
2. **定向 API 拦截** — 精准拦截 `/api/biz/pay/preview` 和 `/api/biz/pay/check`，不再依赖关键词猜测
3. **Preview + Check 双重校验** — 获取 bizId 后通过 check API 验证有效性，过滤无效订单
4. **3 阶段重试引擎** — Burst(20ms) → Regular(80ms) → Backoff(160ms)，带随机抖动防检测
5. **成功响应缓存/重放** — 缓存有效订单响应(TTL 12s)，用于错误弹窗恢复
6. **支付弹窗检测** — GLM 专用选择器 (`.white-mask-bg .pay-dialog`)，精确识别支付界面
7. **错误弹窗自动恢复** — 检测"购买人数过多"等错误弹窗，自动关闭并重放成功响应
8. **按钮解锁** — `temporarilyEnableButton()` 临时解除 disabled，带自动恢复
9. **完整手势模拟** — PointerEvent + MouseEvent 全链路事件分发
10. **定时触发** — 自适应 tick 频率 (1s → 300ms → 100ms → 40ms)

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 新建脚本，将 `glm-coding-sniper.user.js` 内容粘贴进去
3. 修改 `CONFIG.TARGET_TIME` 为实际补货时间（ISO 格式）
4. 启用脚本

## 使用

1. 打开 https://bigmodel.cn/glm-coding
2. 手动登录（如未登录）
3. 确认页面右下角出现 "GLM Sniper v2.0" 状态面板
4. **点击一次目标套餐的"购买/订阅"按钮**，让脚本捕获 `/api/biz/pay/preview` 请求参数
5. 捕获成功后，状态面板显示 "Channel: api (ready)"
6. 可选：点击面板上的 "RUSH NOW" 按钮立即抢购，或等待定时触发
7. 成功后状态面板变绿，发出提示音

## 配置

编辑脚本顶部的 `CONFIG` 对象：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `TARGET_TIME` | `2026-05-26T10:00:00+08:00` | 目标补货时间（ISO 格式） |
| `EARLY_START_SEC` | `120` | 提前开始低频轮询的秒数 |
| `HIGH_FREQ_OFFSET_SEC` | `30` | 提前切换高频的秒数 |
| `WATCH_WINDOW_SEC` | `600` | 开售后的抢购窗口秒数 |
| `BURST_COUNT` | `40` | 极速阶段的请求次数 |
| `BURST_DELAY` | `20` | 极速阶段间隔(ms) |
| `REGULAR_DELAY` | `80` | 常规阶段间隔(ms) |
| `BACKOFF_DELAY` | `160` | 限流退避间隔(ms) |
| `MAX_RETRIES` | `1600` | 最大重试次数 |
| `CACHE_TTL` | `12000` | 成功缓存有效期(ms) |
| `CACHE_REPLAY_COUNT` | `2` | 缓存重放次数 |

## 工作原理

```
页面加载 → JSON.parse 补丁生效 → 按钮/状态解锁
                                    ↓
用户点击购买按钮 → 拦截 /api/biz/pay/preview 请求
                                    ↓
                    ┌── 检查缓存 ──→ 有缓存 → 返回缓存响应
                    ↓
              3阶段重试引擎启动
              ├─ Burst(20ms × 40次)
              ├─ Regular(80ms × N次)
              └─ Backoff(160ms on 555)
                    ↓
          获取 bizId → /api/biz/pay/check 校验
                    ↓
          ┌─── 校验通过 → 成功! → 触发支付流程
          └─── EXPIRE/失败 → 继续重试
                    ↓
          错误弹窗检测 → 自动关闭 → 重放成功缓存
```

## 参考脚本

- `references/glm-coding-rush.user.js` — GLM Coding Rush v1.1.0 by LessUp
- `references/greasyfork-button-unlock.user.js` — 智谱 GLM Coding 前端按钮工具 v3.2.5
