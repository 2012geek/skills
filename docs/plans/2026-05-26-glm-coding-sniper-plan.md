# GLM Coding Pro Sniper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Tampermonkey userscript that auto-purchases the "连续包年套餐" Pro plan on bigmodel.cn/glm-coding via network interception + API replay, with UI button click as fallback.

**Architecture:** Single-file userscript with 6 modules: UI overlay status panel, network interceptor (hooks fetch/XHR), API analyzer (identifies purchase endpoints), time-driven scheduler (low-freq → high-freq polling), purchase executor (API-first, UI-fallback), and dedup guard. All injected into the page via Tampermonkey at `@match https://bigmodel.cn/glm-coding*`.

**Tech Stack:** Vanilla JavaScript (ES6+), Tampermonkey GM_* APIs, no external dependencies

---

### Task 1: Script skeleton and configuration

**Files:**
- Create: `glm-coding-sniper/glm-coding-sniper.user.js`

**Step 1: Write the Tampermonkey header and CONFIG**

```javascript
// ==UserScript==
// @name         GLM Coding Pro Sniper
// @namespace    glm-coding-sniper
// @version      1.0.0
// @description  Auto-purchase GLM Coding Pro subscription
// @author       Claude
// @match        https://bigmodel.cn/glm-coding*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    // Restock time (ISO string with +08:00 timezone)
    TARGET_TIME: '2026-05-26T10:00:00+08:00',
    // Start polling this many seconds before target
    EARLY_START_SEC: 120,
    // Switch to high-frequency this many seconds before target
    HIGH_FREQ_OFFSET_SEC: 20,
    // High-frequency poll interval (ms)
    HIGH_FREQ_INTERVAL: 200,
    // Low-frequency poll interval (ms)
    LOW_FREQ_INTERVAL: 1000,
    // Max API channel failures before switching to UI fallback
    API_FAIL_THRESHOLD: 3,
    // Timeout after target (seconds)
    TIMEOUT_SEC: 60,
  };

  // ---- Shared State ----
  const state = {
    phase: 'collecting', // collecting | low_freq | high_freq | success | timeout
    capturedRequests: [],
    purchaseApi: null,
    stockApi: null,
    apiFailCount: 0,
    isPurchased: false,
    pollingTimer: null,
  };

  // ---- Logger ----
  function log(level, msg, data) {
    const prefix = `[Sniper][${level.toUpperCase()}]`;
    if (data !== undefined) {
      console.log(prefix, msg, data);
    } else {
      console.log(prefix, msg);
    }
  }

  console.log('[Sniper] GLM Coding Pro Sniper loaded. Config:', CONFIG);
})();
```

**Step 2: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add script skeleton with config and state"
```

---

### Task 2: UI Overlay - status panel

**Files:**
- Modify: `glm-coding-sniper/glm-coding-sniper.user.js` (append overlay code before the closing `})();`)

**Step 1: Add overlay DOM creation and update functions**

```javascript
  // ---- UI Overlay ----
  function createOverlay() {
    const el = document.createElement('div');
    el.id = 'glm-sniper-overlay';
    el.innerHTML = `
      <div id="sniper-header">
        <span>Sniper</span>
        <button id="sniper-toggle">_</button>
      </div>
      <div id="sniper-body">
        <div id="sniper-countdown">--:--</div>
        <div id="sniper-channel">Channel: collecting</div>
        <div id="sniper-status">Waiting...</div>
        <div id="sniper-logs" style="font-size:10px;max-height:60px;overflow-y:auto;margin-top:4px;color:#888;"></div>
      </div>
    `;
    Object.assign(el.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: '99999',
      width: '240px', background: 'rgba(0,0,0,0.85)', color: '#0f0',
      borderRadius: '8px', padding: '10px', fontFamily: 'monospace',
      fontSize: '13px', boxShadow: '0 0 12px rgba(0,255,0,0.3)',
    });
    document.body.appendChild(el);

    document.getElementById('sniper-toggle').addEventListener('click', () => {
      const body = document.getElementById('sniper-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });
  }

  function updateOverlay(channel, status, color) {
    const channelEl = document.getElementById('sniper-channel');
    const statusEl = document.getElementById('sniper-status');
    if (channelEl) channelEl.textContent = 'Channel: ' + channel;
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.style.color = color || '#0f0';
    }
  }

  function updateCountdown(seconds) {
    const el = document.getElementById('sniper-countdown');
    if (!el) return;
    if (seconds <= 0) {
      el.textContent = 'FIRING';
      el.style.color = '#ff0';
    } else {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
  }

  function addLog(msg) {
    const el = document.getElementById('sniper-logs');
    if (!el) return;
    const time = new Date().toLocaleTimeString();
    el.innerHTML = '[' + time + '] ' + msg + '<br>' + el.innerHTML;
    // Keep max 20 lines
    const lines = el.innerHTML.split('<br>');
    if (lines.length > 20) el.innerHTML = lines.slice(0, 20).join('<br>');
  }
```

**Step 2: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add UI overlay status panel"
```

---

### Task 3: Network Interceptor

**Files:**
- Modify: `glm-coding-sniper/glm-coding-sniper.user.js` (append interceptor code before closing)

**Step 1: Add fetch and XHR hooking**

```javascript
  // ---- Network Interceptor ----
  const PURCHASE_KEYWORDS = /order|pay|purchase|subscribe|plan|product|sku|create|renew|contract/i;

  function interceptFetch() {
    const origFetch = window.fetch;
    window.fetch = function (url, options) {
      const reqUrl = typeof url === 'string' ? url : (url.url || '');
      if (PURCHASE_KEYWORDS.test(reqUrl)) {
        const req = {
          type: 'fetch',
          url: reqUrl,
          method: (options && options.method) || 'GET',
          headers: (options && options.headers) || {},
          body: (options && options.body) || null,
          timestamp: Date.now(),
        };
        state.capturedRequests.push(req);
        log('info', 'Captured fetch:', reqUrl);
      }
      return origFetch.apply(this, arguments).then(function (resp) {
        // Clone to read body without consuming it
        if (PURCHASE_KEYWORDS.test(reqUrl)) {
          const clone = resp.clone();
          clone.text().then(function (body) {
            log('info', 'Fetch response (' + reqUrl + '):', body.substring(0, 500));
          }).catch(function () {});
        }
        return resp;
      });
    };
  }

  function interceptXHR() {
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      const self = this;
      const origOpen = self._origOpen || XMLHttpRequest.prototype.open;
      const url = self._reqUrl || '';

      if (PURCHASE_KEYWORDS.test(url)) {
        const req = {
          type: 'xhr',
          url: url,
          method: self._reqMethod || 'GET',
          headers: self._reqHeaders || {},
          body: body,
          timestamp: Date.now(),
        };
        state.capturedRequests.push(req);
        log('info', 'Captured XHR:', url);
      }

      self.addEventListener('load', function () {
        if (PURCHASE_KEYWORDS.test(url)) {
          log('info', 'XHR response (' + url + '):', self.responseText.substring(0, 500));
        }
      });

      return origSend.apply(this, arguments);
    };

    // Also hook open to capture URL before send
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._reqUrl = typeof url === 'string' ? url : url.toString();
      this._reqMethod = method;
      this._origOpen = origOpen;
      this._reqHeaders = {};
      return origOpen.apply(this, arguments);
    };

    const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      if (!this._reqHeaders) this._reqHeaders = {};
      this._reqHeaders[name] = value;
      return origSetRequestHeader.apply(this, arguments);
    };
  }
```

**Step 2: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add network interceptor for fetch and XHR"
```

---

### Task 4: API Analyzer

**Files:**
- Modify: `glm-coding-sniper/glm-coding-sniper.user.js` (append analyzer code before closing)

**Step 1: Add API identification logic**

```javascript
  // ---- API Analyzer ----
  const PURCHASE_PRIORITY = ['create', 'order', 'subscribe', 'purchase', 'renew'];
  const STOCK_KEYWORDS = /product|plan|sku|stock|detail|status|info/i;

  function analyzeApis() {
    const requests = state.capturedRequests;

    // Find purchase API: prioritize by keyword order
    let bestScore = -1;
    let bestReq = null;
    for (const req of requests) {
      const urlLower = req.url.toLowerCase();
      for (let i = 0; i < PURCHASE_PRIORITY.length; i++) {
        if (urlLower.includes(PURCHASE_PRIORITY[i])) {
          const score = PURCHASE_PRIORITY.length - i; // higher = better match
          if (score > bestScore && req.method.toUpperCase() === 'POST') {
            bestScore = score;
            bestReq = req;
          }
        }
      }
    }

    if (bestReq) {
      state.purchaseApi = bestReq;
      log('info', 'Purchase API identified:', bestReq.url);
      addLog('Purchase API: ' + bestReq.url.split('/').pop());
    }

    // Find stock/status API
    let stockReq = null;
    for (const req of requests) {
      if (STOCK_KEYWORDS.test(req.url) && req.method.toUpperCase() === 'GET') {
        stockReq = req;
        break;
      }
    }
    if (stockReq) {
      state.stockApi = stockReq;
      log('info', 'Stock API identified:', stockReq.url);
      addLog('Stock API: ' + stockReq.url.split('/').pop());
    }

    return { purchaseApi: state.purchaseApi, stockApi: state.stockApi };
  }
```

**Step 2: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add API analyzer for purchase/stock endpoint discovery"
```

---

### Task 5: Scheduler and Time Management

**Files:**
- Modify: `glm-coding-sniper/glm-coding-sniper.user.js` (append scheduler code before closing)

**Step 1: Add scheduler with countdown and phase transitions**

```javascript
  // ---- Scheduler ----
  function getTimeUntilTarget() {
    const target = new Date(CONFIG.TARGET_TIME).getTime();
    const now = Date.now();
    return Math.floor((target - now) / 1000); // seconds
  }

  function startScheduler() {
    function tick() {
      if (state.isPurchased) return;

      const remaining = getTimeUntilTarget();
      updateCountdown(remaining);

      if (remaining < -CONFIG.TIMEOUT_SEC) {
        state.phase = 'timeout';
        updateOverlay('stopped', 'TIMEOUT - manual purchase needed', '#f00');
        addLog('TIMEOUT: manual purchase needed');
        stopPolling();
        return;
      }

      if (remaining <= CONFIG.HIGH_FREQ_OFFSET_SEC && state.phase !== 'high_freq') {
        state.phase = 'high_freq';
        updateOverlay('api+ui', 'HIGH FREQ polling (200ms)', '#ff0');
        addLog('Phase: HIGH FREQ');
        switchToHighFreq();
      } else if (remaining <= CONFIG.EARLY_START_SEC && state.phase === 'collecting') {
        state.phase = 'low_freq';
        updateOverlay('analyzing', 'Low freq polling (1s)', '#ff0');
        addLog('Phase: LOW FREQ');
        // Run API analysis before starting to poll
        analyzeApis();
        switchToLowFreq();
      }
    }

    // Tick every second for countdown display
    setInterval(tick, 1000);
    tick();
  }

  let pollInterval = null;

  function switchToLowFreq() {
    stopPolling();
    pollInterval = setInterval(pollOnce, CONFIG.LOW_FREQ_INTERVAL);
    pollOnce(); // fire immediately
  }

  function switchToHighFreq() {
    stopPolling();
    pollInterval = setInterval(pollOnce, CONFIG.HIGH_FREQ_INTERVAL);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }
```

**Step 2: Add purchase executor stub for pollOnce**

```javascript
  async function pollOnce() {
    if (state.isPurchased) { stopPolling(); return; }
    addLog('Poll... (api=' + (state.purchaseApi ? 'ready' : 'none') + ')');
    await tryPurchase();
  }
```

**Step 3: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add scheduler with countdown and phase transitions"
```

---

### Task 6: Purchase Executor - API Channel + UI Fallback

**Files:**
- Modify: `glm-coding-sniper/glm-coding-sniper.user.js` (append executor code before closing)

**Step 1: Add API channel purchase logic**

```javascript
  // ---- Purchase Executor ----
  async function tryPurchase() {
    if (state.isPurchased) return;

    // API Channel (primary)
    if (state.purchaseApi && state.apiFailCount < CONFIG.API_FAIL_THRESHOLD) {
      const success = await purchaseViaApi();
      if (success) return;
      state.apiFailCount++;
      addLog('API fail #' + state.apiFailCount);
      if (state.apiFailCount >= CONFIG.API_FAIL_THRESHOLD) {
        updateOverlay('ui-fallback', 'API failed ' + CONFIG.API_FAIL_THRESHOLD + 'x, switching to UI', '#f80');
        addLog('Switching to UI fallback');
      }
    }

    // UI Channel (fallback)
    await purchaseViaUI();
  }

  async function purchaseViaApi() {
    try {
      const req = state.purchaseApi;
      const body = req.body;
      // Try to parse body as JSON and modify if needed
      let parsedBody = body;
      if (typeof body === 'string') {
        try { parsedBody = JSON.parse(body); } catch (e) { /* keep as string */ }
      }

      const resp = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: typeof parsedBody === 'object' ? JSON.stringify(parsedBody) : body,
        credentials: 'include',
      });

      const text = await resp.text();
      log('info', 'Purchase API response:', text.substring(0, 500));

      if (resp.ok) {
        onSuccess('API');
        return true;
      }

      // Check if response indicates sold-out
      if (/售罄|sold.out|unavailable/i.test(text)) {
        return false;
      }

      // Any non-error response might be success
      return false;
    } catch (e) {
      log('error', 'API purchase failed:', e.message);
      return false;
    }
  }

  function purchaseViaUI() {
    // Find the purchase button - try multiple selectors
    const selectors = [
      '[data-v-12ef431d]',
      'button:not([disabled]):has-text("连续包年")',
      'button:not([disabled]):contains("Pro")',
      '.purchase-btn:not([disabled])',
      '[class*="buy"]:not([disabled])',
      'button:not([disabled])',
    ];

    for (const sel of selectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && !btn.disabled && btn.offsetParent !== null) {
          btn.click();
          addLog('UI click: ' + sel);
          onSuccess('UI');
          return;
        }
      } catch (e) { /* selector not supported, try next */ }
    }

    // Also try finding button by text content
    const allButtons = document.querySelectorAll('button, [role="button"], div[class*="btn"], span[class*="btn"]');
    for (const el of allButtons) {
      if (el.disabled || el.offsetParent === null) continue;
      const text = el.textContent.trim();
      if (/连续包年|Pro|立即购买|立即订阅|开通/.test(text)) {
        el.click();
        addLog('UI click (text match): ' + text);
        onSuccess('UI');
        return;
      }
    }

    addLog('UI: no clickable button found');
  }

  function onSuccess(channel) {
    if (state.isPurchased) return;
    state.isPurchased = true;
    state.phase = 'success';
    stopPolling();
    updateOverlay(channel, 'PURCHASE SUCCESS!', '#0f0');
    addLog('SUCCESS via ' + channel + '!');
    log('info', '========== PURCHASE SUCCESS via ' + channel + ' ==========');
    // Flash the overlay green
    const overlay = document.getElementById('glm-sniper-overlay');
    if (overlay) {
      overlay.style.background = 'rgba(0,100,0,0.95)';
      overlay.style.boxShadow = '0 0 20px rgba(0,255,0,0.8)';
    }
  }
```

**Step 2: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add purchase executor with API channel and UI fallback"
```

---

### Task 7: Main Entry Point and Initialization

**Files:**
- Modify: `glm-coding-sniper/glm-coding-sniper.user.js` (add init call at end of IIFE)

**Step 1: Add initialization and wire everything together**

```javascript
  // ---- Init ----
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Check we're on the right page
    if (!window.location.href.includes('glm-coding')) return;

    interceptFetch();
    interceptXHR();
    createOverlay();
    startScheduler();

    addLog('Sniper initialized');
    log('info', 'Sniper ready - monitoring network and waiting for', CONFIG.TARGET_TIME);
  }

  init();
})();
```

**Step 2: Commit**

```bash
git add glm-coding-sniper/glm-coding-sniper.user.js
git commit -m "feat(glm-coding-sniper): add init entry point, wire all modules together"
```

---

### Task 8: SKILL.md and README

**Files:**
- Create: `glm-coding-sniper/SKILL.md`
- Create: `glm-coding-sniper/README.md`

**Step 1: Write SKILL.md**

```markdown
---
name: glm-coding-sniper
description: Auto-purchase GLM Coding Pro subscription via Tampermonkey userscript
---

# GLM Coding Pro Sniper

Tampermonkey userscript for auto-purchasing the "连续包年套餐" Pro plan on bigmodel.cn/glm-coding.

## Usage

1. Install Tampermonkey extension in Chrome/Firefox
2. Copy `glm-coding-sniper.user.js` into a new Tampermonkey script
3. Navigate to https://bigmodel.cn/glm-coding and log in manually
4. The script starts monitoring network requests automatically
5. Keep the page open - the script will auto-purchase at the configured target time

## Configuration

Edit the `CONFIG` object at the top of the script:
- `TARGET_TIME`: ISO datetime string for the restock time
- `EARLY_START_SEC`: Seconds before target to start polling (default 120)
- `HIGH_FREQ_OFFSET_SEC`: Seconds before target to switch to high-frequency (default 20)
- `HIGH_FREQ_INTERVAL`: High-frequency poll interval in ms (default 200)
```

**Step 2: Write README.md**

```markdown
# GLM Coding Pro Sniper

Tampermonkey 用户脚本，在 [智谱 GLM Coding](https://bigmodel.cn/glm-coding) 页面自动抢购 "连续包年套餐" Pro 版本。

## 原理

1. 打开页面后静默拦截所有网络请求，自动发现下单 API
2. 到补货时间前 2 分钟开始轮询
3. 最后 20 秒切换高频轮询（200ms 间隔）
4. 优先通过 API 直接下单，失败后自动回退到 UI 按钮点击

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 新建脚本，将 `glm-coding-sniper.user.js` 内容粘贴进去
3. 修改 `CONFIG.TARGET_TIME` 为实际补货时间
4. 启用脚本

## 使用

1. 打开 https://bigmodel.cn/glm-coding
2. 手动登录（如未登录）
3. 确认页面右下角出现绿色 Sniper 状态面板
4. 保持页面打开，等待自动抢购
5. 成功后状态面板变绿，提示 "PURCHASE SUCCESS"
```

**Step 3: Commit**

```bash
git add glm-coding-sniper/SKILL.md glm-coding-sniper/README.md
git commit -m "docs(glm-coding-sniper): add SKILL.md and README"
```

---

### Task 9: Final verification - code review and integration test

**Step 1: Verify the complete script is syntactically valid**

```bash
node --check glm-coding-sniper/glm-coding-sniper.user.js
```

Expected: No output (no syntax errors)

**Step 2: Verify file structure**

```bash
ls -la glm-coding-sniper/
```

Expected: `SKILL.md  README.md  glm-coding-sniper.user.js`

**Step 3: Commit any final fixes**

```bash
git add glm-coding-sniper/
git commit -m "chore(glm-coding-sniper): final verification and polish"
```
