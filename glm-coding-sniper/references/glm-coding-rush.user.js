// ==UserScript==
// @name         GLM Coding Rush - 智谱编程助手抢购脚本
// @namespace    https://gist.github.com/LessUp
// @version      1.1.0
// @description  智谱 GLM Coding 一键抢购脚本 — 自动解锁售罄按钮 / 高速重试引擎 / bizId 双重校验 / 错误弹窗自动恢复 / 支付弹窗保护 / 秒级定时触发 / 可拖拽浮动面板
// @author       LessUp
// @match        *://www.bigmodel.cn/*
// @match        https://bigmodel.cn/glm-coding*
// @run-at       document-start
// @grant        none
// @license      MIT
// @homepageURL  https://gist.github.com/LessUp/e609e779fb7773cf279942f57a65719a
// @supportURL   https://gist.github.com/LessUp/e609e779fb7773cf279942f57a65719a
// ==/UserScript==
/**
* ═══════════════════════════════════════════════════════════════
* GLM Coding Rush v1.1.0 — 智谱编程助手抢购脚本
* ═══════════════════════════════════════════════════════════════
*
* 项目地址 : https://gist.github.com/LessUp (Star ⭐ 收藏)
* 邀请链接 : https://www.bigmodel.cn/glm-coding?ic=XCGTIPDIID
* (通过邀请链接新购可立减 5%)
*
* ─── 核心功能 ─────────────────────────────────────────────────
* 1. 自动解锁 — 移除 disabled / 售罄状态，提前激活购买入口
* 2. 高速重试 — 极速阶段 30ms 间隔，自适应退避策略
* 3. 双重校验 — preview + check 两步验证，过滤无效订单
* 4. 弹窗恢复 — 错误弹窗自动关闭并恢复购买流程
* 5. 支付保护 — 检测到支付界面时自动暂停一切操作
* 6. 定时触发 — 精确到秒级，后台标签页防漂移轮询
* 7. 控制面板 — 可拖拽浮窗，实时日志 / 参数调节 / 一键启停
*
* ─── 安装方式 ─────────────────────────────────────────────────
* 1. 安装 Tampermonkey / Violentmonkey 浏览器扩展
* 2. 点击 Gist「Raw」按钮 → 弹出安装提示 → 确认安装
* 3. 访问 https://www.bigmodel.cn/glm-coding 即生效
*
* ─── 使用流程 ─────────────────────────────────────────────────
* Step 1 打开 GLM Coding 购买页，脚本自动加载
* Step 2 手动点击一次「购买/订阅」按钮，让脚本捕获请求参数
* Step 3 点击面板「⚡ 立即抢购」或「⏰ 定时抢购」自动触发
* Step 4 抢购成功后弹出支付二维码，完成付款即可
*
* ─── 重要提示 ─────────────────────────────────────────────────
* 本脚本会自动携带开发者邀请码 (ic=XCGTIPDIID)，通过该邀请码
* 购买可享受新用户 5% 优惠。如不需要可在脚本中搜索 INVITE_CODE
* 并修改或清空。
*
* ─── 免责声明 ─────────────────────────────────────────────────
* 本脚本仅供学习交流，请遵守平台使用规则。
* 因使用本脚本产生的任何后果由使用者自行承担。
*
* ─── 反馈交流 ─────────────────────────────────────────────────
* 欢迎在 Gist 评论区留言反馈 Bug 或功能建议！
* 觉得好用请 Star ⭐ 并分享给需要的朋友 🙏
*
* ─── 更新日志 ─────────────────────────────────────────────────
* v1.1.0 UI优化："主动抢购"→"立即抢购"+"定时抢购"双按钮布局
*        逻辑增强：GLM专用支付弹窗检测 / 空价弹窗恢复 / 繁忙弹窗检测
*        重试优化：随机延迟抖动避免请求模式检测
*        新增：配置持久化 (localStorage) / 邀请码友好提示
*        修复：去除重复 @match / 清理冗余 CSS
* v1.0.0 全面重构：代码风格优化 / UI 全新设计 / 注释规范化
*        功能合并：UI 补丁 + 全自动引擎 + 支付弹窗保护
*        性能优化：UI 节流 / 自适应退避 / 极速阶段
*        新增：邀请码自动注入 + 使用提示
*
* ═══════════════════════════════════════════════════════════════
*/
(function () {
'use strict';
/* ────────────────────────────────────────────
* 常量 & 配置
* ──────────────────────────────────────────── */
const VERSION = '1.1.0';
const SCRIPT_NAME = 'GLM Coding Rush';
const INVITE_CODE = 'XCGTIPDIID';

const CYCLE_LABELS = {
  month : '连续包月',
  quarter : '连续包季',
  year : '连续包年',
};
const CYCLE_ALIASES = {
  month : ['连续包月', '包月', 'monthly', 'month'],
  quarter : ['连续包季', '包季', 'quarterly', 'quarter'],
  year : ['连续包年', '包年', 'yearly', 'annual', 'year'],
};
const PLAN_ALIASES = {
  Lite : ['lite', '轻量', '基础'],
  Pro : ['pro', '专业'],
  Max : ['max', '旗舰', '尊享'],
};

const BUY_TEXT_RE = /立即购买|立即抢购|立刻购买|去支付|去购买|购买|抢购|订阅|下单|buy\s*now|purchase|subscribe|checkout|pay\s*now|order|buy|pay/i;
const SOLD_OUT_TEXT_RE = /售罄|缺货|已抢完|敬请期待|sold\s*out|out\s*of\s*stock|coming\s*soon/i;

const I18N = {
  zh: {
    mode_extreme: '极限模式',
    mode_steady: '稳健模式',
    mode_custom: '自定义',
    mode_short_extreme: '极限',
    mode_short_steady: '稳健',
    mode_short_custom: '自定义',
    cycle_month: '连续包月',
    cycle_quarter: '连续包季',
    cycle_year: '连续包年',
    cycle_short_month: '包月',
    cycle_short_quarter: '包季',
    cycle_short_year: '包年',
    label_mode: '模式',
    label_plan: '套餐',
    label_cycle: '周期',
    label_time: '定时',
    label_early: '提前',
    label_window: '窗口',
    label_delay: '间隔',
    label_max: '上限',
    label_burst: 'Burst',
    label_burst_delay: '速点',
    label_backoff: '退避',
    btn_rush_now: '立即抢购',
    btn_schedule: '定时抢购',
    btn_stop: '停止',
    log_welcome: '感谢使用！本脚本通过作者邀请码 (ic={code}) 为您自动享受新用户优惠。',
    tip_recommended: '推荐配置：{mode} · {plan} · {time} (UTC+8) · 提前 {early}s · 窗口 {window}s',
    capture_idle: '请求未捕获 — 当前目标 {target} · {mode}',
    capture_ready: '已捕获 {method} · {target} · …{tail}',
    status_idle: '等待中',
    status_retrying: '重试中… {count}/{max}',
    status_success: '成功！bizId={bizId}',
    status_failed: '失败 ({count})',
    timer_default: '默认 {time} (UTC+8) · 提前 {early}s · 窗口 {window}s',
    timer_before_start: '{time} (UTC+8) 预启动倒计时 {countdown}',
    timer_before_open: '预启动中 · 距开售 {countdown}',
    timer_in_window: '开售窗口中 · 剩余 {countdown}',
    timer_ended: '时间窗口结束',
    note_custom: '自定义模式：你可以手动调整所有重试参数。',
    note_locked: '{mode}已锁定推荐参数：{delay}ms / {max}次 / Burst {burst}',
    alert_need_capture: '请先点击目标套餐购买按钮，或确认页面已切到目标套餐/周期。',
    alert_need_buy_click: '请先手动点一次"购买/订阅"按钮，让脚本捕获请求参数',
    alert_manual_recover: '已获取到商品！请立即手动点击购买按钮！',
    header_lang: 'EN',
    header_lang_title: '切换到 English',
    header_min_title: '最小化',
    panel_loaded: '已加载',
  },
  en: {
    mode_extreme: 'Extreme',
    mode_steady: 'Steady',
    mode_custom: 'Custom',
    mode_short_extreme: 'Extreme',
    mode_short_steady: 'Steady',
    mode_short_custom: 'Custom',
    cycle_month: 'Monthly',
    cycle_quarter: 'Quarterly',
    cycle_year: 'Yearly',
    cycle_short_month: 'Month',
    cycle_short_quarter: 'Quarter',
    cycle_short_year: 'Year',
    label_mode: 'Mode',
    label_plan: 'Plan',
    label_cycle: 'Cycle',
    label_time: 'Time',
    label_early: 'Early',
    label_window: 'Window',
    label_delay: 'Delay',
    label_max: 'Max',
    label_burst: 'Burst',
    label_burst_delay: 'Burst Delay',
    label_backoff: 'Backoff',
    btn_rush_now: 'Rush Now',
    btn_schedule: 'Schedule',
    btn_stop: 'Stop',
    log_welcome: 'Thanks for using this script! Invite code (ic={code}) is applied for a 5% new-user discount.',
    tip_recommended: 'Recommended: {mode} · {plan} · {time} (UTC+8) · Early {early}s · Window {window}s',
    capture_idle: 'Request not captured — Target {target} · {mode}',
    capture_ready: 'Captured {method} · {target} · …{tail}',
    status_idle: 'Idle',
    status_retrying: 'Retrying… {count}/{max}',
    status_success: 'Success! bizId={bizId}',
    status_failed: 'Failed ({count})',
    timer_default: 'Default {time} (UTC+8) · Early {early}s · Window {window}s',
    timer_before_start: '{time} (UTC+8) pre-start in {countdown}',
    timer_before_open: 'Pre-start active · opens in {countdown}',
    timer_in_window: 'Rush window active · left {countdown}',
    timer_ended: 'Rush window ended',
    note_custom: 'Custom mode: you can adjust all retry parameters.',
    note_locked: '{mode} uses locked presets: {delay}ms / {max} tries / Burst {burst}',
    alert_need_capture: 'Click the target plan button first, or make sure the page is on the correct plan and billing cycle.',
    alert_need_buy_click: 'Please click the buy/subscribe button once so the script can capture the request.',
    alert_manual_recover: 'The item is available. Please click the purchase button manually right now.',
    header_lang: '中',
    header_lang_title: 'Switch to 中文',
    header_min_title: 'Minimize',
    panel_loaded: 'loaded',
  },
};

const MODE_PRESETS = {
  extreme : { retryDelay: 80, maxRetries: 1600, burstCount: 40, burstDelay: 20, backoffDelay: 160 },
  steady : { retryDelay: 120, maxRetries: 900, burstCount: 18, burstDelay: 32, backoffDelay: 280 },
};

let customTuning = {
  retryDelay : 100,
  maxRetries : 300,
  burstCount : 15,
  burstDelay : 30,
  backoffDelay : 300,
};

/** 运行参数（可通过面板实时调整） */
const Config = {
  locale : 'zh',
  mode : 'extreme',
  targetPlan : 'Pro',
  billingCycle : 'month',
  targetTime : '10:00:00',
  earlyStartSeconds : 8,
  watchWindowSeconds: 180,
  retryDelay : MODE_PRESETS.extreme.retryDelay,
  maxRetries : MODE_PRESETS.extreme.maxRetries,
  burstCount : MODE_PRESETS.extreme.burstCount,
  burstDelay : MODE_PRESETS.extreme.burstDelay,
  backoffDelay : MODE_PRESETS.extreme.backoffDelay,
  uiThrottle : 500, // UI 刷新最小间隔 (ms)
  cacheTTL : 12000, // 缓存有效期 (ms)
  cacheReplayCount: 2, // 缓存重放次数
  previewAPI : '/api/biz/pay/preview',
  checkAPI : '/api/biz/pay/check',
};

/* ────────────────────────────────────────────
* 全局运行时状态
* ──────────────────────────────────────────── */
const State = {
  phase : 'idle', // idle | retrying | success | failed
  retryCount : 0,
  bizId : null,
  captured : null, // 捕获到的请求参数
  cache : null, // 缓存的成功响应
  lastSuccess: null,
  lastCaptureAt: 0,
  proactive : false,
  timerId : null,
  scheduleTargetAt : 0,
  scheduleStartAt : 0,
  scheduleEndAt : 0,
  scheduleStarted : false,
  paymentVisible : false,
  paymentWaitSource: '',
  panelMinimized : false,
  panelPosition : null,
  logs : [],
};

let stopRequested = false;
let isRecovering = false;
let recoveryAttempts = 0;
let hasDataPatched = false;
let lastUITimestamp = 0;
let preferredBuyButton = null;
let dialogObserver = null;
let dialogCheckTimer = null;
let lastCycleSwitchAt = 0;
let scheduleLaunching = false;

/* ────────────────────────────────────────────
* 工具函数
* ──────────────────────────────────────────── */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timestamp = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, '');
}

function currentMessages() {
  return I18N[Config.locale] || I18N.zh;
}

function template(text, params = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
}

function t(key, params) {
  const messages = currentMessages();
  const fallback = I18N.zh[key] || key;
  return template(messages[key] || fallback, params);
}

function currentCycleLabel(short = false) {
  const suffix = short ? 'short_' : '';
  return t(`cycle_${suffix}${Config.billingCycle}`);
}

function currentTargetLabel() {
  return `${Config.targetPlan} ${currentCycleLabel(Config.locale !== 'zh')}`;
}

function modeLabel(mode = Config.mode) {
  return t(`mode_${mode}`);
}

function modeShortLabel(mode = Config.mode) {
  return t(`mode_short_${mode}`);
}

function syncCustomTuningFromConfig() {
  customTuning = {
    retryDelay : Config.retryDelay,
    maxRetries : Config.maxRetries,
    burstCount : Config.burstCount,
    burstDelay : Config.burstDelay,
    backoffDelay : Config.backoffDelay,
  };
}

function applyModePreset(mode) {
  if (mode === Config.mode) return;
  if (Config.mode === 'custom' && mode !== 'custom') syncCustomTuningFromConfig();
  Config.mode = mode;
  if (mode === 'custom') {
    Object.assign(Config, customTuning);
    return;
  }
  Object.assign(Config, MODE_PRESETS[mode] || MODE_PRESETS.extreme);
}

/* ── 配置持久化 (localStorage) ── */
const CONFIG_STORAGE_KEY = 'glm-rush-config';
function loadSavedConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.locale === 'zh' || saved.locale === 'en') Config.locale = saved.locale;
    if (saved.mode && (MODE_PRESETS[saved.mode] || saved.mode === 'custom')) {
      if (saved.mode !== Config.mode) applyModePreset(saved.mode);
      else if (saved.mode === 'custom') Config.mode = 'custom';
    }
    if (saved.targetPlan && PLAN_ALIASES[saved.targetPlan]) Config.targetPlan = saved.targetPlan;
    if (saved.billingCycle && CYCLE_LABELS[saved.billingCycle]) Config.billingCycle = saved.billingCycle;
    if (saved.targetTime) Config.targetTime = saved.targetTime;
    if (saved.earlyStartSeconds) Config.earlyStartSeconds = Math.max(1, Math.min(120, +saved.earlyStartSeconds));
    if (saved.watchWindowSeconds) Config.watchWindowSeconds = Math.max(30, Math.min(600, +saved.watchWindowSeconds));
    if (saved.mode === 'custom' && saved.customTuning) {
      Object.assign(customTuning, saved.customTuning);
      Object.assign(Config, customTuning);
    }
  } catch (_) { /* ignore corrupted data */ }
}

function saveCurrentConfig() {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({
      locale: Config.locale,
      mode: Config.mode,
      targetPlan: Config.targetPlan,
      billingCycle: Config.billingCycle,
      targetTime: Config.targetTime,
      earlyStartSeconds: Config.earlyStartSeconds,
      watchWindowSeconds: Config.watchWindowSeconds,
      customTuning: Config.mode === 'custom' ? {
        retryDelay: Config.retryDelay,
        maxRetries: Config.maxRetries,
        burstCount: Config.burstCount,
        burstDelay: Config.burstDelay,
        backoffDelay: Config.backoffDelay,
      } : undefined,
    }));
  } catch (_) { /* quota exceeded etc. */ }
}

function rewriteAvailabilityText(text) {
  if (typeof text !== 'string') return { text, changed: false };
  const next = text
    .replace(/"isSoldOut":true/g, '"isSoldOut":false')
    .replace(/"disabled":true/g, '"disabled":false')
    .replace(/"soldOut":true/g, '"soldOut":false')
    .replace(/"stock":0/g, '"stock":999');
  return { text: next, changed: next !== text };
}

function markPatchedData() {
  hasDataPatched = true;
  setTimeout(markActivatedButtons, 500);
  setTimeout(markActivatedButtons, 1500);
}

async function patchFetchAvailabilityResponse(response) {
  const contentType = response?.headers?.get?.('content-type') || '';
  if (!contentType.includes('application/json')) return response;
  try {
    const originalText = await response.clone().text();
    const rewritten = rewriteAvailabilityText(originalText);
    if (!rewritten.changed) return response;
    markPatchedData();
    return new Response(rewritten.text, {
      status : response.status,
      statusText : response.statusText,
      headers : response.headers,
    });
  } catch (_) {
    return response;
  }
}

function patchXhrAvailabilityResponse(xhr) {
  try {
    const contentType = xhr.getResponseHeader('content-type') || '';
    if (!contentType.includes('application/json')) return;
    const rewritten = rewriteAvailabilityText(xhr.responseText);
    if (!rewritten.changed) return;
    Object.defineProperty(xhr, 'responseText', { get: () => rewritten.text, configurable: true });
    Object.defineProperty(xhr, 'response', { get: () => rewritten.text, configurable: true });
    markPatchedData();
  } catch (_) { }
}

function getTargetTimestampUtc8(timeStr) {
  const [hour, minute, second = 0] = timeStr.split(':').map((item) => Number(item) || 0);
  const now = Date.now();
  const beijingNow = new Date(now + 8 * 60 * 60 * 1000);
  let target = Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate(),
    hour, minute, second, 0
  ) - 8 * 60 * 60 * 1000;
  if (target <= now) target += 24 * 60 * 60 * 1000;
  return target;
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getScheduleTickDelay(remaining) {
  if (remaining > 60_000) return 1000;
  if (remaining > 10_000) return 300;
  if (remaining > 3_000) return 100;
  if (remaining > 0) return 40;
  return 150;
}

function getButtonState(button) {
  if (!button) return { text: '', disabled: true };
  return {
    text : normalizeText(button.textContent),
    disabled : button.disabled
      || button.getAttribute('aria-disabled') === 'true'
      || button.classList.contains('is-disabled')
      || button.classList.contains('disabled'),
  };
}

function temporarilyEnableButton(button) {
  if (!button) return () => { };
  const previous = {
    disabled : button.disabled,
    disabledAttr : button.getAttribute('disabled'),
    ariaDisabled : button.getAttribute('aria-disabled'),
    className : button.className,
  };
  button.disabled = false;
  button.removeAttribute('disabled');
  button.setAttribute('aria-disabled', 'false');
  button.classList.remove('is-disabled', 'disabled');
  return () => {
    button.disabled = previous.disabled;
    if (previous.disabledAttr === null) button.removeAttribute('disabled');
    else button.setAttribute('disabled', previous.disabledAttr);
    if (previous.ariaDisabled === null) button.removeAttribute('aria-disabled');
    else button.setAttribute('aria-disabled', previous.ariaDisabled);
    button.className = previous.className;
  };
}

/** 追加日志并同步输出到控制台 */
function log(message) {
  State.logs.push(`${timestamp()} ${message}`);
  if (State.logs.length > 80) State.logs.shift();
  console.log(`[${SCRIPT_NAME}] ${message}`);
  refreshLogPanel();
}

/** 将各种格式的 headers 统一转换为普通对象 */
function normalizeHeaders(raw) {
  const result = {};
  if (!raw) return result;
  if (raw instanceof Headers) { raw.forEach((v, k) => (result[k] = v)); }
  else if (Array.isArray(raw)) { raw.forEach(([k, v]) => (result[k] = v)); }
  else { Object.entries(raw).forEach(([k, v]) => (result[k] = v)); }
  return result;
}

function primeSuccessCache(payload) {
  if (!payload?.text) return;
  State.cache = {
    text : payload.text,
    data : payload.data,
    expiresAt : Date.now() + Config.cacheTTL,
    remainingUses: Config.cacheReplayCount,
  };
}

function consumeSuccessCache() {
  const cached = State.cache;
  if (!cached) return null;
  if (cached.expiresAt <= Date.now() || cached.remainingUses <= 0) {
    State.cache = null;
    return null;
  }
  cached.remainingUses -= 1;
  if (cached.remainingUses <= 0) {
    State.cache = null;
  }
  recoveryAttempts = 0;
  return {
    text : cached.text,
    data : cached.data,
    remainingUses: cached.remainingUses,
  };
}

function getElementTextSnapshot(el) {
  if (!el) return '';
  const parts = [
    el.textContent,
    el.getAttribute?.('title'),
    el.getAttribute?.('aria-label'),
    el.getAttribute?.('placeholder'),
    el.getAttribute?.('data-title'),
    el.getAttribute?.('data-name'),
    el.getAttribute?.('data-testid'),
  ].filter(Boolean);
  return normalizeText(parts.join(' '));
}

function matchesAliases(text, aliases = []) {
  const haystack = normalizeText(text).toLowerCase();
  return aliases.some((alias) => haystack.includes(normalizeText(alias).toLowerCase()));
}

function isSelectedNode(node) {
  if (!node) return false;
  return node.classList.contains('active')
    || node.classList.contains('is-active')
    || node.classList.contains('selected')
    || node.classList.contains('current')
    || node.classList.contains('ant-segmented-item-selected')
    || node.getAttribute('aria-selected') === 'true'
    || node.getAttribute('data-state') === 'active';
}

function findCycleTab(cycle) {
  const aliases = CYCLE_ALIASES[cycle] || [CYCLE_LABELS[cycle] || cycle];
  return Array.from(document.querySelectorAll(
    '.switch-tab-item, [class*="switch-tab-item"], [role="tab"], .ant-segmented-item, [class*="segment"]'
  )).find((node) => {
    return isVisibleElement(node) && matchesAliases(getElementTextSnapshot(node), aliases);
  }) || null;
}

function ensureBillingCycleSelected() {
  const tab = findCycleTab(Config.billingCycle);
  if (!tab) return false;
  if (isSelectedNode(tab) || isSelectedNode(tab.parentElement)) return true;
  if (Date.now() - lastCycleSwitchAt < 320) return false;
  lastCycleSwitchAt = Date.now();
  const target = tab.querySelector('.switch-tab-item-content') || tab;
  log(`🧭 切换周期到 ${currentCycleLabel()}`);
  try { target.focus({ preventScroll: true }); } catch (_) { }
  try { target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (_) { }
  try { target.click(); } catch (_) { }
  return false;
}

function findPlanCard(planName) {
  const aliases = PLAN_ALIASES[planName] || [planName];
  const cards = document.querySelectorAll(
    '.package-card-box .package-card, .package-card, [class*="package-card"], [class*="plan-card"]'
  );
  let bestCard = null;
  let bestScore = -Infinity;
  for (const card of cards) {
    if (!isVisibleElement(card)) continue;
    const title = card.querySelector(
      '.package-card-title .font-prompt, .package-card-title, [class*="card-title"], [class*="title"], [class*="name"]'
    );
    const titleText = getElementTextSnapshot(title || card);
    if (!matchesAliases(titleText, aliases) && !matchesAliases(getElementTextSnapshot(card), aliases)) continue;
    let score = 0;
    if (title && matchesAliases(getElementTextSnapshot(title), aliases)) score += 60;
    if (matchesAliases(getElementTextSnapshot(card), aliases)) score += 20;
    if (isSelectedNode(card)) score += 18;
    if (matchesAliases(getElementTextSnapshot(card), CYCLE_ALIASES[Config.billingCycle] || [])) score += 10;
    if (score > bestScore) { bestCard = card; bestScore = score; }
  }
  return bestCard;
}

function findTargetBuyButton() {
  const card = findPlanCard(Config.targetPlan);
  if (!card) return null;
  const buttons = card.querySelectorAll(
    'button.buy-btn, .package-card-btn-box button, button, a, [role="button"], div[class*="btn"], span[class*="btn"]'
  );
  let bestButton = null;
  let bestScore = -Infinity;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const text = getElementTextSnapshot(button);
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (!BUY_TEXT_RE.test(text) || SOLD_OUT_TEXT_RE.test(text)) continue;
    const state = getButtonState(button);
    let score = 80;
    if (!state.disabled) score += 20;
    if (/立即购买|立即抢购|buynow|purchase|checkout|paynow/i.test(text)) score += 30;
    if (matchesAliases(text, CYCLE_ALIASES[Config.billingCycle] || [])) score += 15;
    if (button.tagName === 'BUTTON') score += 10;
    if (score > bestScore) { bestButton = button; bestScore = score; }
  }
  return bestButton;
}

function isVisibleElement(el) {
  if (!el || !document.contains(el)) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || cs.pointerEvents === 'none') return false;
  if (!el.offsetParent && cs.position !== 'fixed') return false;
  return true;
}

function isBuyCandidate(el) {
  const panel = document.getElementById('glm-rush');
  const text = getElementTextSnapshot(el);
  if (!el || panel?.contains(el)) return false;
  if (!BUY_TEXT_RE.test(text) || text.length >= 48) return false;
  if (SOLD_OUT_TEXT_RE.test(text)) return false;
  return isVisibleElement(el);
}

function rememberBuyButton(el) {
  if (!isBuyCandidate(el)) return false;
  preferredBuyButton = el;
  return true;
}

function scoreBuyButton(el) {
  if (!isBuyCandidate(el)) return -Infinity;
  const text = getElementTextSnapshot(el);
  const rect = el.getBoundingClientRect();
  let score = 0;
  const card = el.closest(
    '.package-card-box .package-card, .package-card, [class*="package-card"], [class*="plan-card"]'
  );
  if (el === preferredBuyButton) score += 200;
  if (/立即购买|立即抢购|立刻购买|去支付|去购买|buy\s*now|purchase|checkout|pay\s*now/i.test(text)) score += 60;
  if (BUY_TEXT_RE.test(text)) score += 40;
  if (card && card === findPlanCard(Config.targetPlan)) score += 90;
  if (card && matchesAliases(getElementTextSnapshot(card), CYCLE_ALIASES[Config.billingCycle] || [])) score += 18;
  if (el.tagName === 'BUTTON') score += 18;
  if (el.getAttribute('role') === 'button') score += 12;
  if (rect.width >= 64) score += 10;
  if (rect.height >= 28) score += 8;
  if (rect.top >= 0 && rect.top < window.innerHeight) score += 6;
  if (rect.left >= 0 && rect.left < window.innerWidth) score += 4;
  return score;
}

function dispatchBuyGesture(el) {
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + Math.max(rect.width / 2, 1);
  const clientY = rect.top + Math.max(rect.height / 2, 1);
  const base = {
    bubbles : true,
    cancelable: true,
    composed : true,
    view : window,
    clientX,
    clientY,
    button : 0,
  };
  if (typeof PointerEvent === 'function') {
    el.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  if (typeof PointerEvent === 'function') {
    el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  el.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0, detail: 1 }));
}

async function triggerBuyButton(reason) {
  let btn = findBuyButton();
  if (!btn) {
    ensureBillingCycleSelected();
    await sleep(140);
    btn = findBuyButton();
  }
  if (!btn) return false;
  rememberBuyButton(btn);
  const previousCaptureAt = State.lastCaptureAt;
  const beforeText = getButtonState(btn).text;
  let restoreButton = null;
  const state = getButtonState(btn);
  log(`🎯 ${reason}：定位按钮「${(getElementTextSnapshot(btn) || 'button').slice(0, 24)}」${state.disabled ? ' (原为禁用)' : ''}`);
  if (state.disabled) {
    restoreButton = temporarilyEnableButton(btn);
    log(`⚡ ${reason}：已临时解除按钮禁用`);
  }
  try { btn.focus({ preventScroll: true }); }
  catch (_) {
    try { btn.focus(); } catch (_) { }
  }
  try { btn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (_) { }
  try {
    try { dispatchBuyGesture(btn); } catch (_) { }
    await sleep(60);
    if (State.lastCaptureAt > previousCaptureAt || isPaymentDialogVisible()) {
      log(`🖱 ${reason}：已触发购买按钮`);
      return true;
    }
    try { btn.click(); } catch (_) { }
    await sleep(90);
    let triggered = State.lastCaptureAt > previousCaptureAt || isPaymentDialogVisible() || !btn.isConnected || getButtonState(btn).text !== beforeText;
    if (!triggered && btn.isConnected) {
      try { dispatchBuyGesture(btn); } catch (_) { }
      await sleep(70);
      triggered = State.lastCaptureAt > previousCaptureAt || isPaymentDialogVisible() || !btn.isConnected || getButtonState(btn).text !== beforeText;
    }
    log(triggered ? `🖱 ${reason}：已自动点击购买按钮` : `⚠️ ${reason}：点击后未观察到 preview 请求`);
    return triggered;
  } finally {
    if (restoreButton) {
      setTimeout(() => {
        try { restoreButton(); } catch (_) { }
      }, 1200);
    }
  }
}

function queueDialogRecoveryCheck() {
  if (dialogCheckTimer) return;
  dialogCheckTimer = setTimeout(() => {
    dialogCheckTimer = null;
    if (isPaymentDialogVisible()) return;
    if (State.lastSuccess && !isRecovering && recoveryAttempts < 3) {
      if (findErrorDialog()) autoRecover();
    }
  }, 80);
}

function trackBuyButton(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const candidate = target.closest('button, a, [role="button"], div[class*="btn"], span[class*="btn"]');
  if (candidate) rememberBuyButton(candidate);
}
document.addEventListener('pointerdown', trackBuyButton, true);
document.addEventListener('click', trackBuyButton, true);

/* ────────────────────────────────────────────
* 邀请码自动注入
* ──────────────────────────────────────────── */
(function injectInviteCode() {
  try {
    const { pathname, search, origin, hash } = window.location;
    if (!pathname.startsWith('/glm-coding')) return;
    const params = new URLSearchParams(search);
    if (params.get('ic') === INVITE_CODE) return;
    params.set('ic', INVITE_CODE);
    const targetUrl = `${origin}${pathname}?${params.toString()}${hash}`;
    window.history.replaceState(null, '', targetUrl);
    if (document.readyState === 'complete' && !sessionStorage.getItem('glm_ic_injected')) {
      sessionStorage.setItem('glm_ic_injected', '1');
      location.replace(targetUrl);
    }
  } catch (_) { /* 静默失败，不影响主流程 */ }
})();

/* ────────────────────────────────────────────
* JSON.parse 深层补丁 — 解锁售罄 / disabled 状态
* ──────────────────────────────────────────── */
const nativeParse = JSON.parse;
JSON.parse = function (text, reviver) {
  const result = nativeParse(text, reviver);
  try {
    let patched = false;
    (function traverse(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.isSoldOut === true) { obj.isSoldOut = false; patched = true; }
      if (obj.soldOut === true) { obj.soldOut = false; patched = true; }
      if (obj.disabled === true && (obj.price !== undefined || obj.productId || obj.title)) {
        obj.disabled = false;
        patched = true;
      }
      if (obj.stock === 0) { obj.stock = 999; patched = true; }
      for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object') traverse(obj[key]);
      }
    })(result);
    if (patched) {
      markPatchedData();
    }
  } catch (_) { /* 忽略解析异常 */ }
  return result;
};

/* ────────────────────────────────────────────
* 按钮激活标记
* ──────────────────────────────────────────── */
function markActivatedButtons() {
  const panel = document.getElementById('glm-rush');
  const candidates = document.querySelectorAll(
    'button, a, [role="button"], div[class*="btn"], span[class*="btn"]'
  );
  for (const el of candidates) {
    if (panel && panel.contains(el)) continue;
    const text = (el.textContent || '').trim();
    if (!/购买|抢购|立即|下单|订阅/.test(text) || text.length >= 20) continue;
    if (el.offsetParent === null || el.dataset.glmMarked) continue;
    el.dataset.glmMarked = '1';
    el.style.position = 'relative';
    const badge = document.createElement('span');
    badge.className = 'glm-badge';
    badge.textContent = '⚡ 脚本已激活';
    badge.title = '此按钮由脚本提前解锁，官方尚未开放抢购';
    el.parentElement.style.position = 'relative';
    el.parentElement.appendChild(badge);
  }
}

function injectBadgeStyles() {
  if (document.getElementById('glm-badge-css')) return;
  const style = document.createElement('style');
  style.id = 'glm-badge-css';
  style.textContent = `
.glm-badge {
  position: absolute;
  top: -10px; right: -10px;
  background: linear-gradient(135deg, #f39c12, #e74c3c);
  color: #fff;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
  animation: glm-badge-pulse 2s ease-in-out infinite;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  font-family: system-ui, sans-serif;
}
@keyframes glm-badge-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.96); }
}
`;
  document.head.appendChild(style);
}

/* ────────────────────────────────────────────
* 核心：高速重试引擎
* ──────────────────────────────────────────── */
const nativeFetch = window.fetch;
let activeRetryJob = null;

async function executeRetry(url, opts) {
  if (activeRetryJob) {
    log('⏳ 已有重试任务运行中，合并请求…');
    return activeRetryJob;
  }
  stopRequested = false;
  activeRetryJob = (async () => {
    State.phase = 'retrying';
    State.retryCount = 0;
    refreshStatusPanel();
    const { signal, ...cleanOpts } = opts || {};
    for (let i = 1; i <= Config.maxRetries; i++) {
      if (stopRequested) { log('⏹ 重试已被手动停止'); break; }
      State.retryCount = i;
      const now = Date.now();
      if (now - lastUITimestamp >= Config.uiThrottle || i === 1) {
        lastUITimestamp = now;
        refreshStatusPanel();
      }
      try {
        const resp = await nativeFetch(url, { ...cleanOpts, credentials: 'include' });
        const text = await resp.text();
        let data;
        try { data = nativeParse(text); } catch { data = null; }
        if (data?.code === 200 && data?.data?.bizId) {
          const bizId = data.data.bizId;
          log(`🔑 获取 bizId=${bizId}，校验 check 接口…`);
          try {
            const checkUrl = `${location.origin}${Config.checkAPI}?bizId=${bizId}`;
            const checkResp = await nativeFetch(checkUrl, { credentials: 'include' });
            const checkText = await checkResp.text();
            let checkData;
            try { checkData = nativeParse(checkText); } catch { checkData = null; }
            if (checkData?.data === 'EXPIRE') {
              log(`#${i} bizId 已过期 (EXPIRE)，继续…`);
              await sleep(Config.retryDelay);
              continue;
            }
            if (!checkData || (checkData.code && checkData.code !== 200)) {
              log(`#${i} check 失败 (code=${checkData?.code})，继续…`);
              await sleep(Config.retryDelay);
              continue;
            }
            State.phase = 'success';
            State.bizId = bizId;
            State.lastSuccess = { text, data };
            recoveryAttempts = 0;
            log(`✅ 抢购成功！bizId=${bizId}，check 校验通过 (第 ${i} 次)`);
            log('💳 已获取有效订单，准备触发支付弹窗流程…');
            refreshStatusPanel();
            setTimeout(() => {
              if (!isPaymentDialogVisible()) autoRecover(true);
            }, 900);
            return { ok: true, text, data, status: resp.status };
          } catch (err) {
            log(`#${i} check 异常: ${err.message}，继续…`);
            await sleep(Config.retryDelay);
            continue;
          }
        }
        const isRateLimit = data?.code === 555;
        const reason = !data ? '非 JSON 响应'
          : isRateLimit ? '系统繁忙 (555)'
          : data?.data?.bizId === null ? '售罄 (bizId=null)'
          : `未知 (code=${data.code})`;
        if (i <= 5 || i % 20 === 0) log(`#${i} ${reason}`);
        const baseDelay = isRateLimit ? Config.backoffDelay
          : i <= Config.burstCount ? Config.burstDelay
          : Config.retryDelay;
        await sleep(baseDelay + Math.floor(Math.random() * (baseDelay * 0.3)));
      } catch (err) {
        if (i <= 3 || i % 20 === 0) log(`#${i} 网络错误: ${err.message}`);
        const d = i <= Config.burstCount ? Config.burstDelay : Config.retryDelay;
        await sleep(d + Math.floor(Math.random() * (d * 0.3)));
      }
    }
    if (!stopRequested) {
      State.phase = 'failed';
      log(`❌ 已达上限 ${Config.maxRetries} 次`);
    } else {
      State.phase = 'idle';
    }
    refreshStatusPanel();
    return { ok: false };
  })();
  try { return await activeRetryJob; }
  finally { activeRetryJob = null; }
}

/* ────────────────────────────────────────────
* 支付弹窗检测
* ──────────────────────────────────────────── */
const DIALOG_SELECTORS = [
  '.el-dialog', '.el-message-box', '.el-dialog__wrapper',
  '.ant-modal', '.ant-modal-wrap',
  '[class*="modal"]', '[class*="dialog"]', '[class*="popup"]',
  '[role="dialog"]',
].join(', ');
const PAYMENT_KEYWORDS = /二维码|扫码|支付|QRCode|qrcode|微信|支付宝|付款|扫一扫|wechat|alipay/i;
const QR_SELECTORS = 'canvas, img[src*="qr"], img[src*="QR"], [class*="qr"], [class*="QR"]';
const GLM_PAY_SELECTORS = '.white-mask-bg .pay-dialog, .white-mask-bg .scan-code-box, .confirm-pay-btn, .scan-qrcode-box';

function findPaymentDialog() {
  const glmRoot = document.querySelector(GLM_PAY_SELECTORS);
  if (glmRoot) {
    const priceEl = glmRoot.querySelector('.scan-qrcode-box .price-icon + span');
    if ((priceEl && priceEl.textContent?.trim()) || glmRoot.querySelector('.confirm-pay-btn')) {
      return glmRoot;
    }
  }
  for (const el of document.querySelectorAll(DIALOG_SELECTORS)) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (!el.offsetParent && cs.position !== 'fixed') continue;
    if (PAYMENT_KEYWORDS.test(el.textContent || '')) return el;
    if (el.querySelector(QR_SELECTORS)) return el;
  }
  return null;
}

function syncPaymentDialogState(source = 'watcher') {
  const dialog = findPaymentDialog();
  const visible = !!dialog;
  if (visible && !State.paymentVisible) {
    State.paymentVisible = true;
    State.paymentWaitSource = '';
    log(`💳 支付弹窗已出现 (${source})`);
  } else if (!visible && State.paymentVisible) {
    State.paymentVisible = false;
    log(`💳 支付弹窗已关闭或离开视野 (${source})`);
  }
  return dialog;
}

async function waitForPaymentDialog(reason, timeoutMs = 2600) {
  State.paymentWaitSource = reason;
  log(`💳 ${reason}：等待支付弹窗…`);
  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    if (syncPaymentDialogState(reason)) return true;
    await sleep(120);
  }
  if (!syncPaymentDialogState(reason)) {
    log(`⚠️ ${reason}：${Math.ceil(timeoutMs / 1000)} 秒内未检测到支付弹窗`);
  }
  return false;
}

function isPaymentDialogVisible() {
  return !!findPaymentDialog();
}

/* ────────────────────────────────────────────
* 错误弹窗自动恢复
* ──────────────────────────────────────────── */
const ERROR_KEYWORDS = /购买人数过多|系统繁忙|稍后再试|请重试|繁忙|失败|出错|异常/;

function findErrorDialog() {
  const payRoot = document.querySelector('.white-mask-bg .pay-dialog, .white-mask-bg .scan-code-box');
  if (payRoot) {
    const cs = window.getComputedStyle(payRoot);
    if (cs.display !== 'none' && cs.visibility !== 'hidden') {
      const priceEl = payRoot.querySelector('.scan-qrcode-box .price-icon + span');
      if (!priceEl || !priceEl.textContent?.trim()) {
        return payRoot;
      }
    }
  }
  const busyWrap = document.querySelector('.el-dialog__wrapper .empty-data-wrap');
  if (busyWrap?.textContent?.includes('购买人数较多')) {
    return busyWrap.closest('.el-dialog') || busyWrap;
  }
  for (const el of document.querySelectorAll(DIALOG_SELECTORS)) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (!el.offsetParent && cs.position !== 'fixed') continue;
    const text = el.textContent || '';
    if (PAYMENT_KEYWORDS.test(text)) continue;
    if (ERROR_KEYWORDS.test(text)) return el;
  }
  return null;
}

function dismissDialog(dialog) {
  if (isPaymentDialogVisible()) {
    log('💳 支付弹窗可见，跳过关闭操作');
    return false;
  }
  const closeSelectors = [
    '.el-dialog__headerbtn', '.el-message-box__headerbtn',
    '.el-dialog__close', '.ant-modal-close',
    '[class*="close-btn"]', '[class*="closeBtn"]',
    '[aria-label="Close"]', '[aria-label="close"]',
  ];
  for (const sel of closeSelectors) {
    const btn = dialog.querySelector(sel) || document.querySelector(sel);
    if (btn?.offsetParent) { btn.click(); log('🔄 关闭弹窗 (关闭按钮)'); return true; }
  }
  for (const btn of dialog.querySelectorAll('button, [role="button"]')) {
    const t = (btn.textContent || '').trim();
    if (/关闭|确定|取消|知道了|OK|Cancel|Close|确认/.test(t) && t.length < 10) {
      btn.click();
      log(`🔄 关闭弹窗 (点击「${t}」)`);
      return true;
    }
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
  log('🔄 尝试通过 Escape 关闭弹窗');
  const masks = document.querySelectorAll('.el-overlay, .v-modal, .el-overlay-dialog, [class*="overlay"], [class*="mask"]');
  for (const mask of masks) {
    const cs = window.getComputedStyle(mask);
    if (mask.offsetParent !== null || cs.position === 'fixed') {
      mask.click();
      log('🔄 尝试点击遮罩层关闭弹窗');
      return true;
    }
  }
  dialog.style.display = 'none';
  document.querySelectorAll('.el-overlay, .v-modal').forEach((el) => (el.style.display = 'none'));
  log('🔄 强制隐藏错误弹窗');
  return true;
}

async function autoRecover(force = false) {
  if (isRecovering || recoveryAttempts >= 3 || !State.lastSuccess) return;
  if (isPaymentDialogVisible()) { log('💳 支付弹窗已出现，无需恢复'); return; }
  const dialog = findErrorDialog();
  if (!dialog && !force) return;
  isRecovering = true;
  recoveryAttempts++;
  log(
    force && !dialog
      ? `🔄 自动恢复 #${recoveryAttempts}：未检测到支付弹窗，直接重放成功响应…`
      : `🔄 自动恢复 #${recoveryAttempts}：关闭错误弹窗并重放成功响应…`
  );
  try {
    primeSuccessCache(State.lastSuccess);
    if (dialog) {
      if (!dismissDialog(dialog)) return;
      await sleep(320);
      if (isPaymentDialogVisible()) { log('💳 支付弹窗已出现，停止恢复'); return; }
      const stillThere = findErrorDialog();
      if (stillThere) {
        if (!dismissDialog(stillThere)) return;
        await sleep(180);
      }
    }
    if (isPaymentDialogVisible()) { log('💳 支付弹窗已出现，停止恢复'); return; }
    const triggered = await triggerBuyButton('自动恢复');
    if (!triggered) {
      log('⚠️ 恢复失败：未找到购买按钮，请立即手动点击');
      alert(t('alert_manual_recover'));
    } else {
      await waitForPaymentDialog('自动恢复', 2800);
    }
  } finally {
    isRecovering = false;
  }
}

function startDialogWatcher() {
  setInterval(() => {
    syncPaymentDialogState('watcher');
    if (State.lastSuccess && !isRecovering && recoveryAttempts < 3) {
      queueDialogRecoveryCheck();
    }
  }, 250);
  const observerTarget = document.documentElement;
  if (!dialogObserver && observerTarget) {
    dialogObserver = new MutationObserver(() => {
      syncPaymentDialogState('mutation');
      if (State.lastSuccess && !isRecovering && recoveryAttempts < 3) {
        queueDialogRecoveryCheck();
      }
    });
    dialogObserver.observe(observerTarget, { childList: true, subtree: true });
  }
}

/* ────────────────────────────────────────────
* Fetch 拦截器
* ──────────────────────────────────────────── */
window.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input?.url;
  if (url?.includes(Config.previewAPI)) {
    State.captured = {
      url,
      method : init?.method || 'POST',
      body : init?.body,
      headers : normalizeHeaders(init?.headers),
    };
    State.lastCaptureAt = Date.now();
    log('🎯 捕获 preview 请求 (Fetch)');
    refreshStatusPanel();
    const cached = consumeSuccessCache();
    if (cached) {
      log(cached.remainingUses > 0 ? `📦 返回缓存响应 (剩余 ${cached.remainingUses} 次)` : '📦 返回缓存响应');
      return new Response(cached.text, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const result = await executeRetry(url, {
      method : init?.method || 'POST',
      body : init?.body,
      headers: normalizeHeaders(init?.headers),
      signal : init?.signal,
    });
    if (result.ok) {
      return new Response(result.text, {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return nativeFetch.apply(this, [input, init]);
  }
  if (url?.includes(Config.checkAPI) && url.includes('bizId=null')) {
    log('🚫 拦截无效请求: check(bizId=null)');
    return new Response(JSON.stringify({ code: -1, msg: '等待有效 bizId' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const response = await nativeFetch.apply(this, [input, init]);
  return patchFetchAvailabilityResponse(response);
};

/* ────────────────────────────────────────────
* XHR 拦截器
* ──────────────────────────────────────────── */
const nativeXhrOpen = XMLHttpRequest.prototype.open;
const nativeXhrSend = XMLHttpRequest.prototype.send;
const nativeXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
  (this._glmHeaders || (this._glmHeaders = {}))[key] = value;
  return nativeXhrSetHeader.call(this, key, value);
};

XMLHttpRequest.prototype.open = function (method, url) {
  this._glmMethod = method;
  this._glmUrl = url;
  this._glmPatchedAvailability = false;
  return nativeXhrOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function (body) {
  const url = this._glmUrl;
  if (!this._glmPatchedAvailability) {
    this._glmPatchedAvailability = true;
    this.addEventListener('readystatechange', function () {
      if (this.readyState === 4 && this.status === 200) {
        patchXhrAvailabilityResponse(this);
      }
    });
  }
  if (typeof url === 'string' && url.includes(Config.previewAPI)) {
    const self = this;
    State.captured = {
      url,
      method : this._glmMethod,
      body,
      headers : this._glmHeaders || {},
    };
    State.lastCaptureAt = Date.now();
    log('🎯 捕获 preview 请求 (XHR)');
    refreshStatusPanel();
    const cached = consumeSuccessCache();
    if (cached) {
      log(cached.remainingUses > 0 ? `📦 返回缓存响应 (XHR, 剩余 ${cached.remainingUses} 次)` : '📦 返回缓存响应 (XHR)');
      emulateXhrResponse(self, cached.text);
      return;
    }
    executeRetry(url, {
      method : this._glmMethod,
      body,
      headers : this._glmHeaders || {},
    }).then((result) => {
      emulateXhrResponse(self, result.ok ? result.text : '{"code":-1,"msg":"重试失败"}');
    });
    return;
  }
  if (typeof url === 'string' && url.includes(Config.checkAPI) && url.includes('bizId=null')) {
    log('🚫 拦截无效请求: check(bizId=null) (XHR)');
    emulateXhrResponse(this, '{"code":-1,"msg":"等待有效 bizId"}');
    return;
  }
  return nativeXhrSend.call(this, body);
};

function emulateXhrResponse(xhr, text) {
  setTimeout(() => {
    const define = (prop, val) =>
      Object.defineProperty(xhr, prop, { value: val, configurable: true });
    define('readyState', 4);
    define('status', 200);
    define('statusText', 'OK');
    define('responseText', text);
    define('response', text);
    const rscEvent = new Event('readystatechange');
    if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(rscEvent);
    xhr.dispatchEvent(rscEvent);
    const loadEvent = new ProgressEvent('load');
    if (typeof xhr.onload === 'function') xhr.onload(loadEvent);
    xhr.dispatchEvent(loadEvent);
    xhr.dispatchEvent(new ProgressEvent('loadend'));
  }, 0);
}

/* ────────────────────────────────────────────
* 主动抢购 / 停止 / 查找按钮
* ──────────────────────────────────────────── */
function findBuyButton() {
  const targeted = findTargetBuyButton();
  if (rememberBuyButton(targeted)) return targeted;
  if (rememberBuyButton(preferredBuyButton)) return preferredBuyButton;
  let bestButton = null;
  let bestScore = -Infinity;
  for (const el of document.querySelectorAll(
    'button, a, [role="button"], div[class*="btn"], span[class*="btn"]'
  )) {
    const score = scoreBuyButton(el);
    if (score > bestScore) { bestButton = el; bestScore = score; }
  }
  if (bestButton) rememberBuyButton(bestButton);
  return bestButton;
}

async function startProactive() {
  if (!State.captured) {
    log('⚠️ 请先手动点一次「购买/订阅」按钮');
    alert(t('alert_need_buy_click'));
    return;
  }
  ensureBillingCycleSelected();
  State.proactive = true;
  log(`🚀 主动抢购模式启动 (${currentTargetLabel()} · ${modeLabel()})`);
  const { url, method, body, headers } = State.captured;
  const result = await executeRetry(url, { method, body, headers });
  State.proactive = false;
  if (result.ok) {
    primeSuccessCache(result);
    log('🎉 主动模式成功！正在触发购买流程…');
    const errDlg = findErrorDialog();
    if (errDlg) { dismissDialog(errDlg); await sleep(300); }
    const triggered = await triggerBuyButton('主动模式');
    if (!triggered) {
      log('⚠️ 未找到购买按钮，请手动点击');
      alert(t('alert_manual_recover'));
    } else {
      await waitForPaymentDialog('主动模式', 2800);
    }
  }
}

function stopAll() {
  stopRequested = true;
  State.proactive = false;
  State.phase = 'idle';
  State.retryCount = 0;
  State.bizId = null;
  State.cache = null;
  State.lastSuccess = null;
  State.scheduleTargetAt = 0;
  State.scheduleStartAt = 0;
  State.scheduleEndAt = 0;
  State.scheduleStarted = false;
  State.paymentVisible = false;
  State.paymentWaitSource = '';
  scheduleLaunching = false;
  if (State.timerId) { clearTimeout(State.timerId); State.timerId = null; }
  if (dialogCheckTimer) { clearTimeout(dialogCheckTimer); dialogCheckTimer = null; }
  log('⏹ 已停止所有任务');
  refreshStatusPanel();
}

/* ────────────────────────────────────────────
* 定时触发
* ──────────────────────────────────────────── */
async function launchScheduledRush() {
  if (scheduleLaunching || State.phase === 'retrying' || State.phase === 'success' || State.proactive || stopRequested) return;
  scheduleLaunching = true;
  try {
    const cycleReady = ensureBillingCycleSelected();
    if (!cycleReady) return;
    const triggered = await triggerBuyButton(State.scheduleStarted ? '定时窗口补点' : '定时预启动');
    State.scheduleStarted = true;
    if (!triggered && State.captured) {
      await startProactive();
    }
  } finally {
    scheduleLaunching = false;
  }
}

function scheduleAt(timeStr) {
  if (State.timerId) { clearTimeout(State.timerId); State.timerId = null; }
  Config.targetTime = timeStr;
  const targetAt = getTargetTimestampUtc8(timeStr);
  State.scheduleTargetAt = targetAt;
  State.scheduleStartAt = targetAt - Config.earlyStartSeconds * 1000;
  State.scheduleEndAt = targetAt + Config.watchWindowSeconds * 1000;
  State.scheduleStarted = false;
  stopRequested = false;
  log(`⏰ 定时已设定: ${timeStr} (UTC+8) · 提前 ${Config.earlyStartSeconds}s · 窗口 ${Config.watchWindowSeconds}s`);
  const tick = async () => {
    const now = Date.now();
    const timerEl = document.getElementById('glm-timer-info');
    if (now >= State.scheduleEndAt) {
      if (timerEl) timerEl.textContent = '🛑 时间窗口结束';
      stopAll();
      return;
    }
    if (timerEl) {
      if (now < State.scheduleStartAt) timerEl.textContent = `⏳ ${formatCountdown(State.scheduleStartAt - now)} 后预启动`;
      else if (now < State.scheduleTargetAt) timerEl.textContent = `⚡ 预启动中 · 距开售 ${formatCountdown(State.scheduleTargetAt - now)}`;
      else timerEl.textContent = `🔥 开售窗口中 · 剩余 ${formatCountdown(State.scheduleEndAt - now)}`;
    }
    if (now >= State.scheduleStartAt) {
      await launchScheduledRush();
    }
    const delay = getScheduleTickDelay(Math.max(0, State.scheduleStartAt - now));
    State.timerId = setTimeout(() => {
      State.timerId = null;
      void tick();
    }, delay);
  };
  void tick();
  refreshStatusPanel();
}

/* ────────────────────────────────────────────
* 浮动控制面板 — UI 构建
* ──────────────────────────────────────────── */
function createPanel() {
  const panel = document.createElement('div');
  panel.id = 'glm-rush';
  panel.innerHTML = `
<style>
/* ── GLM Coding Rush 面板样式 ── */
#glm-rush {
  position: fixed;
  bottom: 16px; right: 16px;
  width: 340px;
  background: rgba(10, 10, 14, 0.96);
  color: #e0e0e0;
  border: 1px solid rgba(100, 200, 255, 0.18);
  border-radius: 10px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  z-index: 99999;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(100,200,255,0.08);
  user-select: none;
  backdrop-filter: blur(12px);
}
#glm-rush * { box-sizing: border-box; margin: 0; padding: 0; }
#glm-drag {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(30,60,120,0.6), rgba(60,30,120,0.6));
  border-bottom: 1px solid rgba(100,200,255,0.1);
  cursor: grab;
  border-radius: 10px 10px 0 0;
}
#glm-drag:active { cursor: grabbing; }
.glm-header-left { display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 13px; }
.glm-header-right { display: flex; gap: 4px; }
.glm-header-btn {
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
  color: #aaa; font-size: 11px; padding: 1px 8px; border-radius: 4px;
  cursor: pointer; font-family: inherit;
}
.glm-header-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
#glm-body { padding: 10px 12px; max-height: 480px; overflow-y: auto; }
#glm-body[data-minimized="true"] { display: none; }
.glm-section { margin-bottom: 8px; }
.glm-section-label { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
.glm-tip { font-size: 10px; color: #6af; line-height: 1.5; margin-bottom: 6px; }
.glm-status {
  font-size: 12px; padding: 4px 8px; border-radius: 4px; margin-bottom: 6px;
  background: rgba(255,255,255,0.04);
}
.glm-status-idle { color: #888; }
.glm-status-retrying { color: #fa0; }
.glm-status-success { color: #0f0; }
.glm-status-failed { color: #f44; }
.glm-capture { font-size: 10px; color: #aaa; margin-bottom: 6px; }
.glm-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
.glm-label { color: #aaa; font-size: 11px; min-width: 36px; }
.glm-select, .glm-input {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  color: #ddd; font-size: 11px; padding: 2px 6px; border-radius: 3px;
  font-family: inherit;
}
.glm-select:focus, .glm-input:focus { outline: none; border-color: rgba(100,200,255,0.4); }
.glm-input { width: 72px; }
.glm-input-time { width: 90px; }
.glm-input-sm { width: 52px; }
.glm-note { font-size: 9px; color: #666; line-height: 1.4; margin-bottom: 4px; }
.glm-manual { display: none; }
.glm-btn-row { display: flex; gap: 6px; margin-top: 8px; }
.glm-btn {
  flex: 1; padding: 6px 0; border: none; border-radius: 5px;
  font-size: 12px; font-weight: bold; cursor: pointer; font-family: inherit;
  transition: background 0.15s;
}
.glm-btn-rush { background: linear-gradient(135deg, #f39c12, #e74c3c); color: #fff; }
.glm-btn-rush:hover { filter: brightness(1.15); }
.glm-btn-schedule { background: linear-gradient(135deg, #3498db, #2ecc71); color: #fff; }
.glm-btn-schedule:hover { filter: brightness(1.15); }
.glm-btn-stop { background: rgba(255,255,255,0.1); color: #f66; border: 1px solid rgba(255,80,80,0.3); }
.glm-btn-stop:hover { background: rgba(255,80,80,0.2); }
#glm-timer-info { font-size: 10px; color: #888; margin-bottom: 4px; }
#glm-logs {
  max-height: 120px; overflow-y: auto; font-size: 10px; color: #888;
  line-height: 1.5; background: rgba(0,0,0,0.2); border-radius: 4px; padding: 4px 6px;
  margin-top: 6px;
}
#glm-logs::-webkit-scrollbar { width: 4px; }
#glm-logs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
</style>

<div id="glm-drag">
  <div class="glm-header-left">⚡ ${SCRIPT_NAME}<span style="opacity:0.5"> v${VERSION}</span></div>
  <div class="glm-header-right">
    <button id="glm-lang" class="glm-header-btn" title="Switch language">EN</button>
    <button id="glm-min" class="glm-header-btn" title="Minimize">−</button>
  </div>
</div>
<div id="glm-body">
  <div class="glm-section">
    <div id="glm-tip-copy" class="glm-tip">💡 Loading...</div>
  </div>
  <div class="glm-section">
    <div id="glm-status" class="glm-status glm-status-idle">⏳ Waiting</div>
    <div id="glm-capture" class="glm-capture">📡 Waiting for request capture...</div>
  </div>
  <div class="glm-section">
    <div class="glm-row">
      <label class="glm-label" id="glm-label-mode">Mode</label>
      <select id="glm-mode" class="glm-select">
        <option id="glm-mode-extreme" value="extreme">Extreme</option>
        <option id="glm-mode-steady" value="steady">Steady</option>
        <option id="glm-mode-custom" value="custom">Custom</option>
      </select>
    </div>
    <div class="glm-row">
      <label class="glm-label" id="glm-label-plan">Plan</label>
      <select id="glm-plan" class="glm-select">
        <option value="Lite">Lite</option>
        <option value="Pro" selected>Pro</option>
        <option value="Max">Max</option>
      </select>
    </div>
    <div class="glm-row">
      <label class="glm-label" id="glm-label-cycle">Cycle</label>
      <select id="glm-cycle" class="glm-select">
        <option id="glm-cycle-month" value="month">Month</option>
        <option id="glm-cycle-quarter" value="quarter">Quarter</option>
        <option id="glm-cycle-year" value="year">Year</option>
      </select>
    </div>
    <div class="glm-row">
      <label class="glm-label" id="glm-label-time">Time</label>
      <input id="glm-time" class="glm-input glm-input-time" type="text" value="${Config.targetTime}" />
    </div>
    <div class="glm-row">
      <label class="glm-label" id="glm-label-early">Early</label>
      <input id="glm-early" class="glm-input glm-input-sm" type="number" value="${Config.earlyStartSeconds}" min="1" max="120" /> <span style="color:#888;font-size:10px">s</span>
    </div>
    <div class="glm-row">
      <label class="glm-label" id="glm-label-window">Window</label>
      <input id="glm-window" class="glm-input glm-input-sm" type="number" value="${Config.watchWindowSeconds}" min="30" max="600" /> <span style="color:#888;font-size:10px">s</span>
    </div>
  </div>
  <div class="glm-section">
    <div id="glm-lock-note" class="glm-note">Locked preset parameters</div>
    <div id="glm-manual-basic" class="glm-manual">
      <div class="glm-row">
        <label class="glm-label" id="glm-label-delay">Delay</label>
        <input id="glm-delay" class="glm-input glm-input-sm" type="number" value="${Config.retryDelay}" min="20" /> <span style="color:#888;font-size:10px">ms</span>
      </div>
      <div class="glm-row">
        <label class="glm-label" id="glm-label-max">Max</label>
        <input id="glm-max" class="glm-input glm-input-sm" type="number" value="${Config.maxRetries}" min="10" /> <span style="color:#888;font-size:10px">次</span>
      </div>
    </div>
    <div id="glm-manual-advanced" class="glm-manual">
      <div class="glm-row">
        <label class="glm-label" id="glm-label-burst">Burst</label>
        <input id="glm-burst" class="glm-input glm-input-sm" type="number" value="${Config.burstCount}" min="1" /> <span style="color:#888;font-size:10px">次</span>
      </div>
      <div class="glm-row">
        <label class="glm-label" id="glm-label-burst-delay">速点</label>
        <input id="glm-burst-delay" class="glm-input glm-input-sm" type="number" value="${Config.burstDelay}" min="10" /> <span style="color:#888;font-size:10px">ms</span>
      </div>
      <div class="glm-row">
        <label class="glm-label" id="glm-label-backoff">退避</label>
        <input id="glm-backoff" class="glm-input glm-input-sm" type="number" value="${Config.backoffDelay}" min="20" /> <span style="color:#888;font-size:10px">ms</span>
      </div>
    </div>
  </div>
  <div id="glm-timer-info" class="glm-note">⌚ Default daily 10:00:00 (UTC+8)</div>
  <div class="glm-btn-row">
    <button id="glm-rush-now" class="glm-btn glm-btn-rush">⚡ Rush Now</button>
    <button id="glm-schedule" class="glm-btn glm-btn-schedule">⏰ Schedule</button>
    <button id="glm-stop" class="glm-btn glm-btn-stop" style="display:none">■ Stop</button>
  </div>
  <div id="glm-logs"></div>
</div>
`;
  document.body.appendChild(panel);

  // ── 事件绑定 ──
  const $ = (id) => document.getElementById(id);
  $('glm-mode').value = Config.mode;
  $('glm-plan').value = Config.targetPlan;
  $('glm-cycle').value = Config.billingCycle;

  $('glm-lang').onclick = function (event) {
    event.stopPropagation();
    Config.locale = Config.locale === 'zh' ? 'en' : 'zh';
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-rush-now').onclick = async function () {
    if (State.phase === 'retrying' || State.proactive) return;
    ensureBillingCycleSelected();
    if (State.captured) {
      await startProactive();
      return;
    }
    const triggered = await triggerBuyButton('手动启动');
    if (!triggered) {
      log('⚠️ 手动启动失败，请先点击目标套餐购买按钮');
      alert(t('alert_need_capture'));
    }
  };
  $('glm-schedule').onclick = function () {
    const v = $('glm-time').value || Config.targetTime;
    if (v) scheduleAt(v);
  };
  $('glm-stop').onclick = stopAll;
  $('glm-mode').onchange = function () {
    applyModePreset(this.value);
    saveCurrentConfig();
    syncPanelControls();
    refreshStatusPanel();
  };
  $('glm-plan').onchange = function () {
    Config.targetPlan = this.value;
    preferredBuyButton = null;
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-cycle').onchange = function () {
    Config.billingCycle = this.value;
    lastCycleSwitchAt = 0;
    preferredBuyButton = null;
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-time').onchange = function () {
    Config.targetTime = this.value || '10:00:00';
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-early').onchange = function () {
    Config.earlyStartSeconds = Math.max(1, Math.min(120, +this.value || 8));
    this.value = Config.earlyStartSeconds;
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-window').onchange = function () {
    Config.watchWindowSeconds = Math.max(30, Math.min(600, +this.value || 180));
    this.value = Config.watchWindowSeconds;
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-delay').onchange = function () {
    Config.retryDelay = Math.max(20, +this.value || 100);
    syncCustomTuningFromConfig();
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-max').onchange = function () {
    Config.maxRetries = Math.max(10, +this.value || 300);
    syncCustomTuningFromConfig();
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-burst').onchange = function () {
    Config.burstCount = Math.max(1, +this.value || 6);
    syncCustomTuningFromConfig();
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-burst-delay').onchange = function () {
    Config.burstDelay = Math.max(10, +this.value || 25);
    syncCustomTuningFromConfig();
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-backoff').onchange = function () {
    Config.backoffDelay = Math.max(20, +this.value || 150);
    syncCustomTuningFromConfig();
    saveCurrentConfig();
    refreshStatusPanel();
  };
  $('glm-min').onclick = function () {
    const body = $('glm-body');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    State.panelMinimized = !hidden;
    this.textContent = hidden ? '−' : '+';
    refreshStatusPanel();
  };

  // ── 拖拽 ──
  let startX, startY, startLeft, startTop;
  $('glm-drag').onmousedown = function (e) {
    if (e.target.closest('#glm-lang, #glm-min')) return;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    const onMove = (ev) => {
      panel.style.left = (startLeft + ev.clientX - startX) + 'px';
      panel.style.top = (startTop + ev.clientY - startY) + 'px';
      panel.style.right = 'auto';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  loadSavedConfig();
  syncPanelControls();
  injectBadgeStyles();
  log(`🚀 ${SCRIPT_NAME} v${VERSION} ${t('panel_loaded')}`);
  log(t('log_welcome', { code: INVITE_CODE }));
  startDialogWatcher();
  refreshStatusPanel();
}

function syncPanelControls() {
  const panelEl = document.getElementById('glm-rush');
  const bodyEl = document.getElementById('glm-body');
  const langEl = document.getElementById('glm-lang');
  const modeEl = document.getElementById('glm-mode');
  const planEl = document.getElementById('glm-plan');
  const cycleEl = document.getElementById('glm-cycle');
  const timeEl = document.getElementById('glm-time');
  const earlyEl = document.getElementById('glm-early');
  const windowEl = document.getElementById('glm-window');
  const delayEl = document.getElementById('glm-delay');
  const maxEl = document.getElementById('glm-max');
  const burstEl = document.getElementById('glm-burst');
  const burstDelayEl = document.getElementById('glm-burst-delay');
  const backoffEl = document.getElementById('glm-backoff');
  const lockNoteEl = document.getElementById('glm-lock-note');
  const manualBasicEl = document.getElementById('glm-manual-basic');
  const manualAdvancedEl = document.getElementById('glm-manual-advanced');
  const tipEl = document.getElementById('glm-tip-copy');
  const labelModeEl = document.getElementById('glm-label-mode');
  const labelPlanEl = document.getElementById('glm-label-plan');
  const labelCycleEl = document.getElementById('glm-label-cycle');
  const labelTimeEl = document.getElementById('glm-label-time');
  const labelEarlyEl = document.getElementById('glm-label-early');
  const labelWindowEl = document.getElementById('glm-label-window');
  const labelDelayEl = document.getElementById('glm-label-delay');
  const labelMaxEl = document.getElementById('glm-label-max');
  const labelBurstEl = document.getElementById('glm-label-burst');
  const labelBurstDelayEl = document.getElementById('glm-label-burst-delay');
  const labelBackoffEl = document.getElementById('glm-label-backoff');
  const modeExtremeEl = document.getElementById('glm-mode-extreme');
  const modeSteadyEl = document.getElementById('glm-mode-steady');
  const modeCustomEl = document.getElementById('glm-mode-custom');
  const cycleMonthEl = document.getElementById('glm-cycle-month');
  const cycleQuarterEl = document.getElementById('glm-cycle-quarter');
  const cycleYearEl = document.getElementById('glm-cycle-year');
  const rushNowEl = document.getElementById('glm-rush-now');
  const scheduleEl = document.getElementById('glm-schedule');
  const stopEl = document.getElementById('glm-stop');
  const minEl = document.getElementById('glm-min');

  const manualVisible = Config.mode === 'custom';

  if (panelEl) panelEl.dataset.lang = Config.locale;
  if (bodyEl) bodyEl.dataset.minimized = State.panelMinimized ? 'true' : 'false';
  if (langEl) {
    langEl.textContent = t('header_lang');
    langEl.title = t('header_lang_title');
  }
  if (minEl) minEl.title = t('header_min_title');

  if (tipEl) {
    tipEl.innerHTML = `💡 ${t('tip_recommended', {
      mode : modeLabel(),
      plan : currentTargetLabel(),
      time : Config.targetTime,
      early : Config.earlyStartSeconds,
      window : Config.watchWindowSeconds,
    })}`;
  }
  if (labelModeEl) labelModeEl.textContent = t('label_mode');
  if (labelPlanEl) labelPlanEl.textContent = t('label_plan');
  if (labelCycleEl) labelCycleEl.textContent = t('label_cycle');
  if (labelTimeEl) labelTimeEl.textContent = t('label_time');
  if (labelEarlyEl) labelEarlyEl.textContent = t('label_early');
  if (labelWindowEl) labelWindowEl.textContent = t('label_window');
  if (labelDelayEl) labelDelayEl.textContent = t('label_delay');
  if (labelMaxEl) labelMaxEl.textContent = t('label_max');
  if (labelBurstEl) labelBurstEl.textContent = t('label_burst');
  if (labelBurstDelayEl) labelBurstDelayEl.textContent = t('label_burst_delay');
  if (labelBackoffEl) labelBackoffEl.textContent = t('label_backoff');
  if (modeExtremeEl) modeExtremeEl.textContent = modeShortLabel('extreme');
  if (modeSteadyEl) modeSteadyEl.textContent = modeShortLabel('steady');
  if (modeCustomEl) modeCustomEl.textContent = modeShortLabel('custom');
  if (cycleMonthEl) cycleMonthEl.textContent = t(`cycle_short_month`);
  if (cycleQuarterEl) cycleQuarterEl.textContent = t(`cycle_short_quarter`);
  if (cycleYearEl) cycleYearEl.textContent = t(`cycle_short_year`);
  if (rushNowEl) rushNowEl.textContent = `⚡ ${t('btn_rush_now')}`;
  if (scheduleEl) scheduleEl.textContent = `⏰ ${t('btn_schedule')}`;
  if (stopEl) stopEl.textContent = `■ ${t('btn_stop')}`;

  if (modeEl) modeEl.value = Config.mode;
  if (planEl) planEl.value = Config.targetPlan;
  if (cycleEl) cycleEl.value = Config.billingCycle;
  if (timeEl) timeEl.value = Config.targetTime;
  if (earlyEl) earlyEl.value = Config.earlyStartSeconds;
  if (windowEl) windowEl.value = Config.watchWindowSeconds;
  if (delayEl) delayEl.value = Config.retryDelay;
  if (maxEl) maxEl.value = Config.maxRetries;
  if (burstEl) burstEl.value = Config.burstCount;
  if (burstDelayEl) burstDelayEl.value = Config.burstDelay;
  if (backoffEl) backoffEl.value = Config.backoffDelay;

  if (lockNoteEl) {
    lockNoteEl.textContent = Config.mode === 'custom'
      ? t('note_custom')
      : t('note_locked', {
        mode : modeLabel(),
        delay : Config.retryDelay,
        max : Config.maxRetries,
        burst : Config.burstCount,
      });
  }
  if (manualBasicEl) manualBasicEl.style.display = manualVisible ? '' : 'none';
  if (manualAdvancedEl) manualAdvancedEl.style.display = manualVisible ? '' : 'none';
}

/* ────────────────────────────────────────────
* UI 刷新
* ──────────────────────────────────────────── */
function refreshStatusPanel() {
  const statusEl = document.getElementById('glm-status');
  if (!statusEl) return;
  syncPanelControls();
  statusEl.className = 'glm-status glm-status-' + State.phase;
  statusEl.textContent =
    State.phase === 'idle' ? `⏳ ${t('status_idle')}` :
    State.phase === 'retrying' ? `🔄 ${t('status_retrying', { count: State.retryCount, max: Config.maxRetries })}` :
    State.phase === 'success' ? `✅ ${t('status_success', { bizId: State.bizId })}` :
    `❌ ${t('status_failed', { count: State.retryCount })}`;

  const captureEl = document.getElementById('glm-capture');
  if (captureEl) {
    captureEl.textContent = State.captured
      ? `📡 ${t('capture_ready', { method: State.captured.method, target: currentTargetLabel(), tail: State.captured.url.split('?')[0].slice(-28) })}`
      : `📡 ${t('capture_idle', { target: currentTargetLabel(), mode: modeLabel() })}`;
  }

  const timerEl = document.getElementById('glm-timer-info');
  if (timerEl) {
    if (State.scheduleTargetAt) {
      const now = Date.now();
      if (now < State.scheduleStartAt) {
        timerEl.textContent = `⌚ ${t('timer_before_start', { time: Config.targetTime, countdown: formatCountdown(State.scheduleStartAt - now) })}`;
      } else if (now < State.scheduleTargetAt) {
        timerEl.textContent = `⚡ ${t('timer_before_open', { countdown: formatCountdown(State.scheduleTargetAt - now) })}`;
      } else if (now < State.scheduleEndAt) {
        timerEl.textContent = `🔥 ${t('timer_in_window', { countdown: formatCountdown(State.scheduleEndAt - now) })}`;
      } else {
        timerEl.textContent = `🛑 ${t('timer_ended')}`;
      }
    } else {
      timerEl.textContent = `⌚ ${t('timer_default', { time: Config.targetTime, early: Config.earlyStartSeconds, window: Config.watchWindowSeconds })}`;
    }
  }

  const rushBtn = document.getElementById('glm-rush-now');
  const scheduleBtn = document.getElementById('glm-schedule');
  const stopBtn = document.getElementById('glm-stop');
  if (rushBtn && scheduleBtn && stopBtn) {
    const busy = State.phase === 'retrying' || !!State.scheduleTargetAt;
    rushBtn.style.display = busy ? 'none' : '';
    scheduleBtn.style.display = busy ? 'none' : '';
    stopBtn.style.display = busy ? '' : 'none';
  }
}

function refreshLogPanel() {
  const el = document.getElementById('glm-logs');
  if (!el) return;
  while (el.childNodes.length >= State.logs.length && el.firstChild) {
    el.removeChild(el.firstChild);
  }
  const latest = State.logs[State.logs.length - 1];
  if (latest) {
    const div = document.createElement('div');
    div.textContent = latest;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
}

/* ────────────────────────────────────────────
* 启动入口
* ──────────────────────────────────────────── */
if (document.body) {
  createPanel();
} else {
  document.addEventListener('DOMContentLoaded', createPanel);
}
})();
