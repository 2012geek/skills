// ==UserScript==
// @name         GLM Coding Pro Sniper
// @namespace    glm-coding-sniper
// @version      3.0.1
// @description  Auto-purchase GLM Coding Pro subscription — concurrent racing / non-blocking validation / adaptive retry / connection pre-warming / error dialog recovery
// @author       Claude
// @match        https://bigmodel.cn/glm-coding*
// @match        https://www.bigmodel.cn/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const CONFIG = {
    TARGET_TIME: '2026-05-26T10:00:00+08:00',
    EARLY_START_SEC: 120,
    HIGH_FREQ_OFFSET_SEC: 30,
    WATCH_WINDOW_SEC: 600,

    // Target plan & billing cycle
    TARGET_PLAN: 'Pro',
    BILLING_CYCLE: 'year',

    PREVIEW_API: '/api/biz/pay/preview',
    CHECK_API: '/api/biz/pay/check',

    // Concurrent racing
    CONCURRENT_REQUESTS: 6, // fire N requests simultaneously

    // Retry engine (adaptive)
    BURST_COUNT: 80,
    BURST_DELAY: 10,
    REGULAR_DELAY: 50,
    BACKOFF_DELAY: 160,
    MAX_RETRIES: 3000,

    // Cache
    CACHE_TTL: 30000,
    CACHE_REPLAY_COUNT: 5,

    // Recovery
    MAX_RECOVERY_ATTEMPTS: 10,

    // Connection pre-warming
    WARMUP_INTERVAL: 15000, // pre-warm every 15s during low_freq

    // UI
    UI_THROTTLE: 500,
    UI_BURST_THROTTLE: 2000, // less frequent during burst
  };

  const CYCLE_ALIASES = {
    month: ['连续包月', '包月', 'monthly', 'month'],
    quarter: ['连续包季', '包季', 'quarterly', 'quarter'],
    year: ['连续包年', '包年', 'yearly', 'annual', 'year'],
  };
  const PLAN_ALIASES = {
    Lite: ['lite', '轻量', '基础'],
    Pro: ['pro', '专业'],
    Max: ['max', '旗舰', '尊享'],
  };

  // ============================================================
  // STATE
  // ============================================================
  const STATE = {
    phase: 'idle',
    captured: null,
    lastCaptureAt: 0,
    retryCount: 0,
    bizId: null,
    lastSuccess: null,
    cache: null,
    isPurchased: false,
    pollTimer: null,
    tickTimer: null,
    paymentVisible: false,
    isRecovering: false,
    recoveryAttempts: 0,
    preferredButton: null,
    logs: [],
  };

  let stopRequested = false;
  let activeRetryJob = null;
  let warmupTimer = null;
  let lastUIRefresh = 0;
  let adaptiveDelay = CONFIG.BURST_DELAY;

  // ============================================================
  // NATIVE REFERENCES (save before any patching)
  // ============================================================
  const nativeJSONParse = JSON.parse;
  const nativeFetch = window.fetch;
  const nativeXHROpen = XMLHttpRequest.prototype.open;
  const nativeXHRSend = XMLHttpRequest.prototype.send;
  const nativeXHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  // ============================================================
  // UTILS
  // ============================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(msg) {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    STATE.logs.push(ts + ' ' + msg);
    if (STATE.logs.length > 100) STATE.logs.shift();
    console.log('[Sniper] ' + msg);
    refreshLogPanel();
  }

  function normalizeHeaders(raw) {
    const result = {};
    if (!raw) return result;
    if (raw instanceof Headers) { raw.forEach((v, k) => (result[k] = v)); }
    else if (Array.isArray(raw)) { raw.forEach(([k, v]) => (result[k] = v)); }
    else { Object.entries(raw).forEach(([k, v]) => (result[k] = v)); }
    return result;
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, '');
  }

  function getTargetTime() {
    return new Date(CONFIG.TARGET_TIME).getTime();
  }

  function getTimeUntilTarget() {
    return Math.floor((getTargetTime() - Date.now()) / 1000);
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function throttledRefresh() {
    var now = Date.now();
    var throttle = STATE.phase === 'retrying' ? CONFIG.UI_BURST_THROTTLE : CONFIG.UI_THROTTLE;
    if (now - lastUIRefresh < throttle) return;
    lastUIRefresh = now;
    refreshStatusPanel();
  }

  // ============================================================
  // 1. JSON.parse DEEP PATCHING (from both reference scripts)
  // ============================================================
  JSON.parse = function (text, reviver) {
    var result = nativeJSONParse(text, reviver);
    try {
      (function traverse(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.isSoldOut === true) obj.isSoldOut = false;
        if (obj.soldOut === true) obj.soldOut = false;
        if (obj.disabled === true && (obj.price !== undefined || obj.productId || obj.title)) {
          obj.disabled = false;
        }
        if (obj.stock === 0) obj.stock = 999;
        for (var key in obj) {
          if (obj[key] && typeof obj[key] === 'object') traverse(obj[key]);
        }
      })(result);
    } catch (_) {}
    return result;
  };

  // ============================================================
  // 2. RESPONSE AVAILABILITY REWRITING (from Greasyfork script)
  // ============================================================
  function rewriteAvailabilityText(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/"isSoldOut":true/g, '"isSoldOut":false')
      .replace(/"disabled":true/g, '"disabled":false')
      .replace(/"soldOut":true/g, '"soldOut":false')
      .replace(/"stock":0/g, '"stock":999');
  }

  async function patchFetchAvailability(response) {
    var contentType = response && response.headers && response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return response;
    try {
      var originalText = await response.clone().text();
      var rewritten = rewriteAvailabilityText(originalText);
      if (rewritten === originalText) return response;
      return new Response(rewritten, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (_) { return response; }
  }

  function patchXhrAvailability(xhr) {
    try {
      var contentType = xhr.getResponseHeader('content-type') || '';
      if (!contentType.includes('application/json')) return;
      var rewritten = rewriteAvailabilityText(xhr.responseText);
      if (rewritten === xhr.responseText) return;
      Object.defineProperty(xhr, 'responseText', { get: function () { return rewritten; }, configurable: true });
      Object.defineProperty(xhr, 'response', { get: function () { return rewritten; }, configurable: true });
    } catch (_) {}
  }

  // ============================================================
  // 3. SUCCESS CACHE (from GLM Coding Rush)
  // ============================================================
  function primeSuccessCache(payload) {
    if (!payload || !payload.text) return;
    STATE.cache = {
      text: payload.text,
      data: payload.data,
      expiresAt: Date.now() + CONFIG.CACHE_TTL,
      remainingUses: CONFIG.CACHE_REPLAY_COUNT,
    };
  }

  function consumeSuccessCache() {
    var cached = STATE.cache;
    if (!cached) return null;
    if (cached.expiresAt <= Date.now() || cached.remainingUses <= 0) {
      STATE.cache = null;
      return null;
    }
    cached.remainingUses -= 1;
    if (cached.remainingUses <= 0) STATE.cache = null;
    STATE.recoveryAttempts = 0;
    return { text: cached.text, data: cached.data, remainingUses: cached.remainingUses };
  }

  // ============================================================
  // 4. CONNECTION PRE-WARMING
  // ============================================================
  async function warmupConnection() {
    try {
      var url = location.origin + CONFIG.PREVIEW_API;
      await nativeFetch(url, {
        method: 'OPTIONS',
        credentials: 'include',
        mode: 'cors',
      });
      log('Connection pre-warmed');
    } catch (_) {
      // OPTIONS may fail, that's fine — the TCP/TLS connection is established
    }
  }

  function startWarmup() {
    warmupConnection();
    warmupTimer = setInterval(warmupConnection, CONFIG.WARMUP_INTERVAL);
  }

  function stopWarmup() {
    if (warmupTimer) { clearInterval(warmupTimer); warmupTimer = null; }
  }

  // ============================================================
  // 5. BIZID BACKGROUND VALIDATION (non-blocking)
  // ============================================================
  async function validateBizId(bizId, attemptNum) {
    try {
      var checkUrl = location.origin + CONFIG.CHECK_API + '?bizId=' + bizId;
      var checkResp = await nativeFetch(checkUrl, { credentials: 'include' });
      var checkText = await checkResp.text();
      var checkData;
      try { checkData = nativeJSONParse(checkText); } catch (_) { checkData = null; }

      if (checkData && checkData.data === 'EXPIRE') {
        log('#' + attemptNum + ' bizId expired (bg validation)');
        return false;
      }
      if (!checkData || (checkData.code && checkData.code !== 200)) {
        log('#' + attemptNum + ' check failed code=' + (checkData && checkData.code) + ' (bg)');
        return false;
      }

      // Valid order confirmed!
      STATE.phase = 'success';
      STATE.bizId = bizId;
      log('SUCCESS! bizId=' + bizId + ' validated (attempt ' + attemptNum + ')');
      throttledRefresh();

      setTimeout(function () {
        if (!isPaymentDialogVisible()) autoRecover(true);
      }, 900);

      return true;
    } catch (err) {
      log('bg validation error: ' + err.message);
      return false;
    }
  }

  // ============================================================
  // 6. CONCURRENT RETRY ENGINE
  // ============================================================
  function singleAttempt(url, opts, attemptNum) {
    var cleanOpts = Object.assign({}, opts);
    delete cleanOpts.signal;
    return nativeFetch(url, Object.assign({}, cleanOpts, { credentials: 'include' }))
      .then(function (resp) {
        return resp.text().then(function (text) {
          var data;
          try { data = nativeJSONParse(text); } catch (_) { data = null; }

          if (data && data.code === 200 && data.data && data.data.bizId) {
            return { ok: true, text: text, data: data, status: resp.status, bizId: data.data.bizId, attempt: attemptNum };
          }

          var isRateLimit = data && data.code === 555;
          var reason = !data ? 'non-JSON'
            : isRateLimit ? 'rate-limited'
            : (data.data && data.data.bizId === null) ? 'sold-out'
            : 'code=' + data.code;

          return { ok: false, reason: reason, isRateLimit: isRateLimit, attempt: attemptNum };
        });
      })
      .catch(function (err) {
        return { ok: false, reason: 'network: ' + err.message, isRateLimit: false, attempt: attemptNum };
      });
  }

  async function executeRetry(url, opts) {
    if (activeRetryJob) {
      log('Retry already running, merging...');
      return activeRetryJob;
    }

    stopRequested = false;
    activeRetryJob = (async () => {
      STATE.phase = 'retrying';
      STATE.retryCount = 0;
      adaptiveDelay = CONFIG.BURST_DELAY;
      throttledRefresh();

      var pendingValidation = null;
      var globalAttempt = 0;
      var burstBudget = CONFIG.BURST_COUNT;

      while (globalAttempt < CONFIG.MAX_RETRIES) {
        if (stopRequested) { log('Stopped by user'); break; }

        // If a previous validation succeeded, we're done
        if (STATE.phase === 'success') {
          return { ok: true, text: STATE.lastSuccess.text, data: STATE.lastSuccess.data, status: 200 };
        }

        // Determine concurrency and delay for this batch
        var inBurst = globalAttempt < burstBudget;
        var batchSize = inBurst ? CONFIG.CONCURRENT_REQUESTS : Math.max(2, Math.ceil(CONFIG.CONCURRENT_REQUESTS / 2));

        // Fire a batch of concurrent requests
        var tasks = [];
        for (var b = 0; b < batchSize && globalAttempt < CONFIG.MAX_RETRIES; b++) {
          globalAttempt++;
          STATE.retryCount = globalAttempt;
          tasks.push(singleAttempt(url, opts, globalAttempt));
        }

        // Wait for all in batch to settle
        var results = await Promise.allSettled(tasks);

        // Process results
        var gotSuccess = false;
        var hitRateLimit = false;

        for (var r = 0; r < results.length; r++) {
          var outcome = results[r];
          if (outcome.status !== 'fulfilled') continue;
          var res = outcome.value;

          if (res.ok) {
            // Got a bizId — validate in background (non-blocking)
            if (!pendingValidation) {
              log('#' + res.attempt + ' Got bizId=' + res.bizId + ', validating in background...');
              STATE.lastSuccess = { text: res.text, data: res.data };
              primeSuccessCache({ text: res.text, data: res.data });

              // Background validation — don't await
              pendingValidation = validateBizId(res.bizId, res.attempt)
                .then(function (valid) {
                  if (valid) {
                    onSuccess('api');
                  } else {
                    // Clear stale state if validation failed
                    STATE.lastSuccess = null;
                    STATE.cache = null;
                  }
                  pendingValidation = null;
                });
            }
            gotSuccess = true;
          } else {
            if (res.isRateLimit) hitRateLimit = true;
            if (res.attempt <= 5 || res.attempt % 50 === 0) {
              log('#' + res.attempt + ' ' + res.reason);
            }
          }
        }

        throttledRefresh();

        // If we got a success, keep polling at regular speed until validation completes
        if (gotSuccess) {
          await sleep(CONFIG.REGULAR_DELAY);
          continue;
        }

        // Adaptive delay (only after burst phase)
        if (!inBurst) {
          if (hitRateLimit) {
            adaptiveDelay = Math.min(adaptiveDelay * 1.5, 500);
          } else if (adaptiveDelay > CONFIG.BURST_DELAY) {
            adaptiveDelay = Math.max(adaptiveDelay * 0.85, CONFIG.BURST_DELAY);
          }
        }

        var baseDelay = inBurst ? CONFIG.BURST_DELAY : adaptiveDelay;
        var jitter = Math.floor(Math.random() * baseDelay * 0.3);
        await sleep(baseDelay + jitter);
      }

      STATE.phase = stopRequested ? 'idle' : 'failed';
      if (!stopRequested) log('FAILED: reached max retries (' + CONFIG.MAX_RETRIES + ')');
      throttledRefresh();
      return { ok: false };
    })();

    try { return await activeRetryJob; }
    finally { activeRetryJob = null; }
  }

  // ============================================================
  // 7. FETCH INTERCEPTOR
  // ============================================================
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input);

    // Intercept preview API
    if (url.indexOf(CONFIG.PREVIEW_API) !== -1) {
      STATE.captured = {
        url: url,
        method: (init && init.method) || 'POST',
        body: init && init.body,
        headers: normalizeHeaders(init && init.headers),
      };
      STATE.lastCaptureAt = Date.now();
      log('Captured preview request (Fetch)');
      throttledRefresh();

      // Check cache first
      var cached = consumeSuccessCache();
      if (cached) {
        log('Returning cached response (remaining: ' + cached.remainingUses + ')');
        return new Response(cached.text, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Execute retry engine
      var result = await executeRetry(url, {
        method: (init && init.method) || 'POST',
        body: init && init.body,
        headers: normalizeHeaders(init && init.headers),
        signal: init && init.signal,
      });

      if (result.ok) {
        return new Response(result.text, { status: result.status, headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch.apply(this, [input, init]);
    }

    // Block invalid check requests
    if (url.indexOf(CONFIG.CHECK_API) !== -1 && url.indexOf('bizId=null') !== -1) {
      log('Blocked invalid check(bizId=null)');
      return new Response('{"code":-1,"msg":"waiting for valid bizId"}', {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Pass through with availability patching
    var response = await nativeFetch.apply(this, [input, init]);
    return patchFetchAvailability(response);
  };

  // ============================================================
  // 8. XHR INTERCEPTOR
  // ============================================================
  XMLHttpRequest.prototype.open = function (method, url) {
    this._sniperMethod = method;
    this._sniperUrl = url;
    this._sniperHeaders = {};
    this._sniperPatched = false;
    return nativeXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this._sniperHeaders[name] = value;
    return nativeXHRSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var url = this._sniperUrl || '';
    var self = this;

    // Patch availability on all XHR responses
    if (!this._sniperPatched) {
      this._sniperPatched = true;
      this.addEventListener('readystatechange', function () {
        if (this.readyState === 4 && this.status === 200) {
          patchXhrAvailability(this);
        }
      });
    }

    // Intercept preview API
    if (typeof url === 'string' && url.indexOf(CONFIG.PREVIEW_API) !== -1) {
      STATE.captured = {
        url: url,
        method: this._sniperMethod,
        body: body,
        headers: this._sniperHeaders || {},
      };
      STATE.lastCaptureAt = Date.now();
      log('Captured preview request (XHR)');
      throttledRefresh();

      var cached = consumeSuccessCache();
      if (cached) {
        log('Returning cached XHR response');
        emulateXhrResponse(self, cached.text);
        return;
      }

      executeRetry(url, {
        method: this._sniperMethod,
        body: body,
        headers: this._sniperHeaders || {},
      }).then(function (result) {
        emulateXhrResponse(self, result.ok ? result.text : '{"code":-1,"msg":"retry failed"}');
      });
      return;
    }

    // Block invalid check
    if (typeof url === 'string' && url.indexOf(CONFIG.CHECK_API) !== -1 && url.indexOf('bizId=null') !== -1) {
      log('Blocked invalid XHR check(bizId=null)');
      emulateXhrResponse(this, '{"code":-1,"msg":"waiting for valid bizId"}');
      return;
    }

    return nativeXHRSend.call(this, body);
  };

  function emulateXhrResponse(xhr, text) {
    setTimeout(function () {
      var define = function (prop, val) {
        Object.defineProperty(xhr, prop, { value: val, configurable: true });
      };
      define('readyState', 4);
      define('status', 200);
      define('statusText', 'OK');
      define('responseText', text);
      define('response', text);

      var rscEvent = new Event('readystatechange');
      if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(rscEvent);
      xhr.dispatchEvent(rscEvent);
      xhr.dispatchEvent(new ProgressEvent('load'));
      xhr.dispatchEvent(new ProgressEvent('loadend'));
    }, 0);
  }

  // ============================================================
  // 9. PAYMENT DIALOG DETECTION (GLM-specific)
  // ============================================================
  var GLM_PAY_SELECTORS = '.white-mask-bg .pay-dialog, .white-mask-bg .scan-code-box, .confirm-pay-btn, .scan-qrcode-box';
  var PAYMENT_KEYWORDS = /二维码|扫码|支付|QRCode|qrcode|微信|支付宝|付款|wechat|alipay/i;

  function isPaymentDialogVisible() {
    var glmRoot = document.querySelector(GLM_PAY_SELECTORS);
    if (glmRoot) {
      var priceEl = glmRoot.querySelector('.scan-qrcode-box .price-icon + span');
      if ((priceEl && priceEl.textContent && priceEl.textContent.trim()) || glmRoot.querySelector('.confirm-pay-btn')) {
        return true;
      }
    }
    var dialogs = document.querySelectorAll('[role="dialog"], .el-dialog, .ant-modal');
    for (var i = 0; i < dialogs.length; i++) {
      var el = dialogs[i];
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (PAYMENT_KEYWORDS.test(el.textContent || '')) return true;
    }
    return false;
  }

  // ============================================================
  // 10. ERROR DIALOG AUTO-RECOVERY
  // ============================================================
  var ERROR_KEYWORDS = /购买人数过多|系统繁忙|稍后再试|请重试|繁忙|失败|出错|异常/;

  function findErrorDialog() {
    var payRoot = document.querySelector('.white-mask-bg .pay-dialog, .white-mask-bg .scan-code-box');
    if (payRoot) {
      var cs = window.getComputedStyle(payRoot);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        var priceEl = payRoot.querySelector('.scan-qrcode-box .price-icon + span');
        if (!priceEl || !priceEl.textContent || !priceEl.textContent.trim()) return payRoot;
      }
    }
    var busyWrap = document.querySelector('.el-dialog__wrapper .empty-data-wrap');
    if (busyWrap && busyWrap.textContent && busyWrap.textContent.indexOf('购买人数较多') !== -1) {
      return busyWrap.closest('.el-dialog') || busyWrap;
    }
    var dialogs = document.querySelectorAll('[role="dialog"], .el-dialog, .ant-modal');
    for (var i = 0; i < dialogs.length; i++) {
      var el = dialogs[i];
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (PAYMENT_KEYWORDS.test(el.textContent || '')) continue;
      if (ERROR_KEYWORDS.test(el.textContent || '')) return el;
    }
    return null;
  }

  function dismissDialog(dialog) {
    if (isPaymentDialogVisible()) return false;
    var closeSelectors = ['.el-dialog__headerbtn', '.el-dialog__close', '.ant-modal-close',
      '[class*="close-btn"]', '[aria-label="Close"]'];
    for (var i = 0; i < closeSelectors.length; i++) {
      var btn = dialog.querySelector(closeSelectors[i]) || document.querySelector(closeSelectors[i]);
      if (btn && btn.offsetParent) { btn.click(); log('Dismissed dialog via close button'); return true; }
    }
    var buttons = dialog.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < buttons.length; j++) {
      var t = (buttons[j].textContent || '').trim();
      if (/关闭|确定|取消|知道了|OK|Cancel|Close|确认/.test(t) && t.length < 10) {
        buttons[j].click();
        log('Dismissed dialog via button: ' + t);
        return true;
      }
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
    log('Dismissed dialog via Escape');
    dialog.style.display = 'none';
    return true;
  }

  async function autoRecover(force) {
    if (STATE.isRecovering || STATE.recoveryAttempts >= CONFIG.MAX_RECOVERY_ATTEMPTS || !STATE.lastSuccess) return;
    if (isPaymentDialogVisible()) { log('Payment dialog visible, skip recovery'); return; }
    var dialog = findErrorDialog();
    if (!dialog && !force) return;

    STATE.isRecovering = true;
    STATE.recoveryAttempts++;
    log('Auto-recovery #' + STATE.recoveryAttempts);

    try {
      primeSuccessCache(STATE.lastSuccess);
      if (dialog) {
        dismissDialog(dialog);
        await sleep(200);
        if (isPaymentDialogVisible()) return;
        var still = findErrorDialog();
        if (still) { dismissDialog(still); await sleep(100); }
      }
      if (isPaymentDialogVisible()) return;
      var triggered = await triggerBuyButton('auto-recovery');
      if (!triggered) {
        log('Recovery: no button found, click manually!');
      }
    } finally {
      STATE.isRecovering = false;
    }
  }

  var BUY_TEXT_RE = /立即购买|立即抢购|立刻购买|去支付|去购买|购买|抢购|订阅|下单|buy\s*now|purchase|subscribe|checkout|pay\s*now|order|buy|pay/i;
  var SOLD_OUT_TEXT_RE = /售罄|缺货|已抢完|敬请期待|sold\s*out|out\s*of\s*stock|coming\s*soon/i;

  // ============================================================
  // 11. AUTO-NAVIGATION: plan card & billing cycle selection
  // ============================================================
  var lastCycleSwitchAt = 0;

  function getElementText(el) {
    if (!el) return '';
    var parts = [el.textContent, el.getAttribute('title'), el.getAttribute('aria-label'),
      el.getAttribute('data-title'), el.getAttribute('data-name')].filter(Boolean);
    return normalizeText(parts.join(' '));
  }

  function matchesAliases(text, aliases) {
    var haystack = normalizeText(text).toLowerCase();
    return aliases.some(function (a) { return haystack.indexOf(normalizeText(a).toLowerCase()) !== -1; });
  }

  function isSelectedNode(node) {
    if (!node) return false;
    return node.classList.contains('active') || node.classList.contains('is-active') ||
      node.classList.contains('selected') || node.classList.contains('current') ||
      node.getAttribute('aria-selected') === 'true' || node.getAttribute('data-state') === 'active';
  }

  function findCycleTab(cycle) {
    var aliases = CYCLE_ALIASES[cycle] || [cycle];
    var tabs = document.querySelectorAll(
      '.switch-tab-item, [class*="switch-tab-item"], [role="tab"], .ant-segmented-item, [class*="segment"]'
    );
    for (var i = 0; i < tabs.length; i++) {
      if (isVisible(tabs[i]) && matchesAliases(getElementText(tabs[i]), aliases)) return tabs[i];
    }
    return null;
  }

  function ensureBillingCycleSelected() {
    var tab = findCycleTab(CONFIG.BILLING_CYCLE);
    if (!tab) return false;
    if (isSelectedNode(tab) || isSelectedNode(tab.parentElement)) return true;
    if (Date.now() - lastCycleSwitchAt < 320) return false;
    lastCycleSwitchAt = Date.now();
    var target = tab.querySelector('.switch-tab-item-content') || tab;
    log('Auto-switching billing cycle to ' + CONFIG.BILLING_CYCLE);
    try { target.focus({ preventScroll: true }); } catch (_) {}
    try { target.click(); } catch (_) {}
    return false;
  }

  function findPlanCard(planName) {
    var aliases = PLAN_ALIASES[planName] || [planName];
    var cards = document.querySelectorAll(
      '.package-card-box .package-card, .package-card, [class*="package-card"], [class*="plan-card"]'
    );
    var bestCard = null;
    var bestScore = -1;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!isVisible(card)) continue;
      var title = card.querySelector(
        '.package-card-title .font-prompt, .package-card-title, [class*="card-title"], [class*="title"]'
      );
      var titleText = getElementText(title || card);
      if (!matchesAliases(titleText, aliases) && !matchesAliases(getElementText(card), aliases)) continue;
      var score = 0;
      if (title && matchesAliases(getElementText(title), aliases)) score += 60;
      if (matchesAliases(getElementText(card), aliases)) score += 20;
      if (isSelectedNode(card)) score += 18;
      if (score > bestScore) { bestCard = card; bestScore = score; }
    }
    return bestCard;
  }

  function findTargetBuyButton() {
    var card = findPlanCard(CONFIG.TARGET_PLAN);
    if (!card) return null;
    var buttons = card.querySelectorAll(
      'button.buy-btn, .package-card-btn-box button, button, a, [role="button"], div[class*="btn"], span[class*="btn"]'
    );
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var rect = btn.getBoundingClientRect();
      var text = getElementText(btn);
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!BUY_TEXT_RE.test(text) || SOLD_OUT_TEXT_RE.test(text)) continue;
      var score = 80;
      if (!btn.disabled && !btn.classList.contains('disabled')) score += 20;
      if (/立即购买|立即抢购|buynow|purchase|checkout/i.test(text)) score += 30;
      if (btn.tagName === 'BUTTON') score += 10;
      if (score > bestScore) { best = btn; bestScore = score; }
    }
    return best;
  }

  // ============================================================
  // 12. BUTTON MANIPULATION (optimized — faster clicks)
  // ============================================================

  function isVisible(el) {
    if (!el || !document.contains(el)) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (!el.offsetParent && cs.position !== 'fixed') return false;
    return true;
  }

  function temporarilyEnableButton(btn) {
    if (!btn) return function () {};
    var prev = {
      disabled: btn.disabled,
      disabledAttr: btn.getAttribute('disabled'),
      ariaDisabled: btn.getAttribute('aria-disabled'),
      className: btn.className,
    };
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.setAttribute('aria-disabled', 'false');
    btn.classList.remove('is-disabled', 'disabled');
    return function () {
      btn.disabled = prev.disabled;
      if (prev.disabledAttr === null) btn.removeAttribute('disabled');
      else btn.setAttribute('disabled', prev.disabledAttr);
      if (prev.ariaDisabled === null) btn.removeAttribute('aria-disabled');
      else btn.setAttribute('aria-disabled', prev.ariaDisabled);
      btn.className = prev.className;
    };
  }

  function dispatchBuyGesture(el) {
    var rect = el.getBoundingClientRect();
    var clientX = rect.left + Math.max(rect.width / 2, 1);
    var clientY = rect.top + Math.max(rect.height / 2, 1);
    var base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: clientX, clientY: clientY, button: 0 };
    if (typeof PointerEvent === 'function') {
      el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true })));
    }
    el.dispatchEvent(new MouseEvent('mousedown', Object.assign({}, base, { buttons: 1 })));
    if (typeof PointerEvent === 'function') {
      el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true })));
    }
    el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 0 })));
    el.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { buttons: 0, detail: 1 })));
  }

  function findBuyButton() {
    // Strategy 1: targeted search within the plan card
    var targeted = findTargetBuyButton();
    if (targeted) return targeted;

    // Strategy 2: fallback generic search
    var all = document.querySelectorAll(
      'button, [role="button"], a[href*="pay"], a[href*="order"], ' +
      'div[class*="btn"], span[class*="btn"], div[class*="buy"], div[class*="purchase"]'
    );
    var best = null;
    var bestScore = -1;

    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!isVisible(el)) continue;
      var text = normalizeText(el.textContent);
      if (!BUY_TEXT_RE.test(text) || SOLD_OUT_TEXT_RE.test(text)) continue;

      var score = 40;
      if (/立即购买|立即抢购|buynow|purchase|checkout/i.test(text)) score += 30;
      if (el.tagName === 'BUTTON') score += 15;
      var rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 30) score += 10;
      if (STATE.preferredButton === el) score += 200;
      if (score > bestScore) { best = el; bestScore = score; }
    }
    return best;
  }

  // Track user clicks to remember preferred button
  document.addEventListener('pointerdown', function (e) {
    var target = e.target;
    if (!(target instanceof Element)) return;
    var candidate = target.closest('button, a, [role="button"], div[class*="btn"], span[class*="btn"]');
    if (candidate && isVisible(candidate)) STATE.preferredButton = candidate;
  }, true);

  async function triggerBuyButton(reason) {
    // Auto-select billing cycle before finding button
    ensureBillingCycleSelected();

    var btn = findBuyButton();
    if (!btn) {
      await sleep(80);
      btn = findBuyButton();
    }
    if (!btn) return false;
    STATE.preferredButton = btn;

    var prevCaptureAt = STATE.lastCaptureAt;
    var restoreButton = null;
    var isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled');

    log(reason + ': clicking button "' + (btn.textContent || '').trim().substring(0, 30) + '"' + (isDisabled ? ' (was disabled)' : ''));

    if (isDisabled) {
      restoreButton = temporarilyEnableButton(btn);
    }

    try { btn.focus({ preventScroll: true }); } catch (_) {}
    try { btn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (_) {}

    try {
      // Fire gesture + click simultaneously for speed
      dispatchBuyGesture(btn);
      btn.click();
      await sleep(30); // minimal wait

      var triggered = STATE.lastCaptureAt > prevCaptureAt || isPaymentDialogVisible();
      if (!triggered) {
        // One retry with gesture only
        dispatchBuyGesture(btn);
        await sleep(30);
        triggered = STATE.lastCaptureAt > prevCaptureAt || isPaymentDialogVisible();
      }
      log(triggered ? reason + ': click succeeded' : reason + ': click sent but no preview captured');
      return triggered;
    } finally {
      if (restoreButton) setTimeout(restoreButton, 1200);
    }
  }

  // ============================================================
  // 13. PROACTIVE PURCHASE (API direct call)
  // ============================================================
  async function startProactive() {
    if (!STATE.captured) {
      log('No captured request yet, trying auto-click...');
      ensureBillingCycleSelected();
      var triggered = await triggerBuyButton('auto-capture');
      if (!triggered) {
        log('Auto-capture failed - click the buy button once manually');
        return;
      }
      // Wait for interception to capture the request
      await sleep(100);
      if (!STATE.captured) {
        log('Request still not captured after auto-click');
        return;
      }
    }
    log('Starting proactive purchase via API...');
    var req = STATE.captured;
    var result = await executeRetry(req.url, { method: req.method, body: req.body, headers: req.headers });

    if (result.ok) {
      primeSuccessCache(result);
      log('Proactive purchase succeeded! Triggering payment flow...');
      var errDlg = findErrorDialog();
      if (errDlg) { dismissDialog(errDlg); await sleep(200); }
      var triggered = await triggerBuyButton('proactive');
      if (!triggered) log('Payment dialog not detected, please click manually');
    }
  }

  // ============================================================
  // 14. SCHEDULED TRIGGER
  // ============================================================
  function getScheduleTickDelay(remainingMs) {
    if (remainingMs > 60000) return 1000;
    if (remainingMs > 10000) return 300;
    if (remainingMs > 3000) return 100;
    if (remainingMs > 0) return 40;
    return 150;
  }

  async function launchScheduledRush() {
    if (STATE.phase === 'retrying' || STATE.phase === 'success' || stopRequested) return;
    ensureBillingCycleSelected();
    var triggered = await triggerBuyButton('scheduled');
    if (!triggered && STATE.captured) {
      await startProactive();
    }
  }

  function startScheduler() {
    function tick() {
      if (STATE.isPurchased || STATE.phase === 'success') return;

      var remaining = getTimeUntilTarget();
      updateCountdown(remaining);

      var now = Date.now();
      var targetTime = getTargetTime();
      var windowEnd = targetTime + CONFIG.WATCH_WINDOW_SEC * 1000;

      // Timeout
      if (now > windowEnd) {
        STATE.phase = 'timeout';
        updateOverlay('stopped', 'TIMEOUT - purchase manually', '#f00');
        log('TIMEOUT: window ended');
        stopPolling();
        stopWarmup();
        return;
      }

      // Phase: idle → low_freq
      if (remaining <= CONFIG.EARLY_START_SEC && STATE.phase === 'idle') {
        STATE.phase = 'low_freq';
        updateOverlay('ready', 'Low-freq polling (1s)', '#ff0');
        log('Phase: LOW FREQ polling started');
        setPollInterval(1000);
        startWarmup(); // begin connection pre-warming
      }

      // Phase: low_freq → high_freq
      if (remaining <= CONFIG.HIGH_FREQ_OFFSET_SEC && (STATE.phase === 'low_freq' || STATE.phase === 'idle')) {
        STATE.phase = 'high_freq';
        updateOverlay('ready', 'HIGH-FREQ polling', '#ff0');
        log('Phase: HIGH FREQ polling started');
        stopWarmup(); // stop warming, go live
        setPollInterval(CONFIG.BURST_DELAY);
      }

      // Within window: launch scheduled rush
      if (remaining <= 0 && STATE.phase === 'high_freq') {
        launchScheduledRush();
      }

      // Schedule next tick
      var nextDelay = getScheduleTickDelay(remaining * 1000);
      STATE.tickTimer = setTimeout(tick, nextDelay);
    }

    STATE.tickTimer = setTimeout(tick, 1000);
    tick();
  }

  // ============================================================
  // 15. POLLING
  // ============================================================
  async function pollOnce() {
    if (STATE.isPurchased) { stopPolling(); return; }

    ensureBillingCycleSelected();

    if (STATE.captured && !activeRetryJob) {
      await startProactive();
      return;
    }
    triggerBuyButton('poll');
  }

  function stopPolling() {
    if (STATE.pollTimer) { clearInterval(STATE.pollTimer); STATE.pollTimer = null; }
  }

  function setPollInterval(ms) {
    stopPolling();
    STATE.pollTimer = setInterval(pollOnce, ms);
    pollOnce();
  }

  // ============================================================
  // 16. SUCCESS HANDLER
  // ============================================================
  function onSuccess(channel) {
    if (STATE.isPurchased) return;
    STATE.isPurchased = true;
    STATE.phase = 'success';
    stopPolling();
    stopWarmup();
    if (STATE.tickTimer) { clearTimeout(STATE.tickTimer); STATE.tickTimer = null; }
    updateOverlay(channel, 'PURCHASE SUCCESS!', '#0f0');
    log('========== SUCCESS via ' + channel + ' ==========');

    var overlay = document.getElementById('glm-sniper-overlay');
    if (overlay) {
      overlay.style.background = 'rgba(0,100,0,0.95)';
      overlay.style.boxShadow = '0 0 20px rgba(0,255,0,0.8)';
    }

    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.15);
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  }

  // ============================================================
  // 17. UI OVERLAY
  // ============================================================
  function createOverlay() {
    var el = document.createElement('div');
    el.id = 'glm-sniper-overlay';
    el.innerHTML =
      '<div id="sniper-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<span style="font-weight:bold;color:#0f0;">GLM Sniper v3.0.1</span>' +
        '<div style="display:flex;gap:4px;">' +
          '<button id="sniper-rush" style="background:#e74c3c;border:none;color:#fff;cursor:pointer;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">RUSH NOW</button>' +
          '<button id="sniper-toggle" style="background:none;border:1px solid #0f0;color:#0f0;cursor:pointer;padding:0 6px;font-size:11px;">_</button>' +
        '</div>' +
      '</div>' +
      '<div id="sniper-body">' +
        '<div id="sniper-countdown" style="font-size:24px;font-weight:bold;text-align:center;margin:4px 0;">--:--</div>' +
        '<div id="sniper-channel" style="font-size:11px;">Channel: idle</div>' +
        '<div id="sniper-plan" style="font-size:10px;color:#888;">Target: Pro 连续包年</div>' +
        '<div id="sniper-status" style="font-size:11px;margin-top:2px;">Waiting...</div>' +
        '<div id="sniper-logs" style="font-size:10px;max-height:100px;overflow-y:auto;margin-top:6px;color:#888;line-height:1.4;"></div>' +
      '</div>';

    el.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:99999;width:280px;' +
      'background:rgba(10,10,14,0.94);color:#0f0;border-radius:8px;padding:10px;' +
      'font-family:monospace;font-size:13px;border:1px solid rgba(0,255,0,0.2);' +
      'box-shadow:0 0 12px rgba(0,255,0,0.3);user-select:none;backdrop-filter:blur(8px);';

    document.body.appendChild(el);

    document.getElementById('sniper-toggle').addEventListener('click', function () {
      var body = document.getElementById('sniper-body');
      body.style.display = body.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('sniper-rush').addEventListener('click', function () {
      if (STATE.phase === 'retrying' || activeRetryJob) return;
      if (STATE.captured) {
        startProactive();
      } else {
        triggerBuyButton('manual-rush');
      }
    });
  }

  function updateOverlay(channel, status, color) {
    var channelEl = document.getElementById('sniper-channel');
    var statusEl = document.getElementById('sniper-status');
    if (channelEl) channelEl.textContent = 'Channel: ' + channel;
    if (statusEl) { statusEl.textContent = status; statusEl.style.color = color || '#0f0'; }
  }

  function updateCountdown(seconds) {
    var el = document.getElementById('sniper-countdown');
    if (!el) return;
    if (seconds <= 0) {
      el.textContent = 'FIRING';
      el.style.color = '#ff0';
    } else {
      var m = Math.floor(Math.abs(seconds) / 60);
      var s = Math.abs(seconds) % 60;
      el.textContent = (seconds < 0 ? '-' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      el.style.color = seconds <= CONFIG.HIGH_FREQ_OFFSET_SEC ? '#ff0' : '#0f0';
    }
  }

  function refreshStatusPanel() {
    var statusEl = document.getElementById('sniper-status');
    if (!statusEl) return;
    var captureEl = document.getElementById('sniper-channel');
    var planEl = document.getElementById('sniper-plan');

    var cycleLabel = (CYCLE_ALIASES[CONFIG.BILLING_CYCLE] || [CONFIG.BILLING_CYCLE])[0];
    if (planEl) planEl.textContent = 'Target: ' + CONFIG.TARGET_PLAN + ' ' + cycleLabel;

    if (STATE.phase === 'retrying') {
      statusEl.textContent = 'Retrying... ' + STATE.retryCount + '/' + CONFIG.MAX_RETRIES + ' (x' + CONFIG.CONCURRENT_REQUESTS + ')';
      statusEl.style.color = '#fa0';
      if (captureEl) captureEl.textContent = 'Channel: api (concurrent)';
    } else if (STATE.phase === 'success') {
      statusEl.textContent = 'SUCCESS! bizId=' + STATE.bizId;
      statusEl.style.color = '#0f0';
    } else if (STATE.phase === 'failed') {
      statusEl.textContent = 'FAILED after ' + STATE.retryCount + ' attempts';
      statusEl.style.color = '#f44';
    } else {
      statusEl.textContent = STATE.captured ? 'Captured: ready' : 'Waiting for request capture...';
      statusEl.style.color = STATE.captured ? '#0f0' : '#888';
      if (captureEl) captureEl.textContent = 'Channel: ' + (STATE.captured ? 'api (ready)' : 'collecting');
    }
  }

  function refreshLogPanel() {
    var el = document.getElementById('sniper-logs');
    if (!el) return;
    var latest = STATE.logs[STATE.logs.length - 1];
    if (latest) {
      var div = document.createElement('div');
      div.textContent = latest;
      el.appendChild(div);
      while (el.childNodes.length > 50) el.removeChild(el.firstChild);
      el.scrollTop = el.scrollHeight;
    }
  }

  // ============================================================
  // 18. DIALOG WATCHER
  // ============================================================
  function startDialogWatcher() {
    setInterval(function () {
      if (STATE.lastSuccess && !STATE.isRecovering && STATE.recoveryAttempts < CONFIG.MAX_RECOVERY_ATTEMPTS) {
        if (!isPaymentDialogVisible() && findErrorDialog()) {
          autoRecover();
        }
      }
    }, 250);

    var observer = new MutationObserver(function () {
      if (STATE.lastSuccess && !STATE.isRecovering && STATE.recoveryAttempts < CONFIG.MAX_RECOVERY_ATTEMPTS) {
        if (!isPaymentDialogVisible() && findErrorDialog()) {
          autoRecover();
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ============================================================
  // 19. INIT
  // ============================================================
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    if (window.location.href.indexOf('glm-coding') === -1) return;
    if (document.getElementById('glm-sniper-overlay')) return;

    createOverlay();
    startScheduler();
    startDialogWatcher();

    log('Sniper v3.0.1 initialized');
    log('Target: ' + CONFIG.TARGET_PLAN + ' ' + (CYCLE_ALIASES[CONFIG.BILLING_CYCLE] || [])[0] + ' @ ' + CONFIG.TARGET_TIME);
    log('Strategy: concurrent x' + CONFIG.CONCURRENT_REQUESTS + ' + adaptive retry + bg validation + pre-warming');
  }

  init();
})();
