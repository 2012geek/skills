---
name: glm-coding-sniper
description: Auto-purchase GLM Coding Pro subscription via Tampermonkey userscript
---

# GLM Coding Pro Sniper

Tampermonkey userscript that auto-purchases the "连续包年套餐" Pro plan on bigmodel.cn/glm-coding.

## Usage

1. Install [Tampermonkey](https://www.tampermonkey.net/) extension
2. Copy `glm-coding-sniper.user.js` into a new Tampermonkey script
3. Edit `CONFIG.TARGET_TIME` to the actual restock time
4. Navigate to https://bigmodel.cn/glm-coding and log in
5. Keep the page open — the script auto-purchases at the configured time

## How It Works

1. Silently intercepts all fetch/XHR requests on the page
2. Auto-discovers the purchase API and stock-check API
3. Low-frequency polling starts 2 minutes before target time
4. High-frequency polling (200ms) kicks in 20 seconds before target
5. Tries direct API purchase first, falls back to UI button click
6. Success notification with sound
