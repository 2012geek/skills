import { defineConfig } from '@slidev/cli'

export default defineConfig({
  theme: 'seriph',
  highlighter: 'shiki',
  lineNumbers: false,
  drawings: {
    persist: false,
  },
  editor: false,
  transition: 'none',
  download: false,
  info: false,
  canCopy: true,
  transitionSlide: false,
  mouseWheel: true,
  recording: {
    enabled: false,
    video: false,
    audio: false,
  },
  class: 'text-left',
  vite: {
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.webp'],
  },
  css: `
    .slidev-layout {
      background: #ffffff !important;
    }
    body {
      background: #ffffff !important;
    }

    /* 图片全局约束 - 防止超出边界 */
    img {
      max-height: 400px !important;
      max-width: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* 代码块优化 */
    pre {
      max-height: 250px !important;
      overflow-y: auto !important;
      font-size: 0.75em !important;
    }

    /* ========== 折叠组件样式 ========== */
    details {
      margin: 0.75em 0 !important;
      border: 1px solid #e0e0e0 !important;
      border-radius: 8px !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    summary {
      cursor: pointer !important;
      font-weight: 600 !important;
      padding: 0.75em 1em !important;
      user-select: none !important;
      background-color: #f9f9f9 !important;
      transition: background-color 0.2s !important;
      display: block !important;
    }

    summary:hover {
      background-color: #eeeeee !important;
    }

    details[open] > summary {
      border-bottom: 1px solid #e0e0e0 !important;
      margin-bottom: 0.75em !important;
    }

    details[open] > summary::after {
      content: " ▼" !important;
      float: right !important;
    }

    details:not([open]) > summary::after {
      content: " ▶" !important;
      float: right !important;
    }

    /* 折叠内容区域的样式 - 防止溢出 */
    details > *:not(summary) {
      padding: 0 1em 1em 1em !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    /* 折叠内的图片进一步约束 */
    details img {
      max-height: 350px !important;
      max-width: 100% !important;
      width: auto !important;
      height: auto !important;
      object-fit: contain !important;
    }

    /* 折叠内的代码块约束 */
    details pre {
      max-width: 100% !important;
      overflow-x: auto !important;
    }

    /* 表格优化 */
    .compact-table table {
      font-size: 0.8em !important;
      table-layout: fixed !important;
    }

    .compact-table th,
    .compact-table td {
      padding: 0.25em 0.5em !important;
    }

    /* 列表优化 */
    ul, ol {
      font-size: 0.85em !important;
      margin: 0.5em 0 !important;
    }

    /* 内容区域滚动和边界保护 */
    .slide-content {
      overflow-y: auto !important;
      overflow-x: hidden !important;
      max-height: 90vh !important;
      max-width: 100% !important;
      word-wrap: break-word !important;
      word-break: break-word !important;
    }

    /* 防止代码块超出边界 */
    pre code {
      max-width: 100% !important;
      overflow-x: auto !important;
      white-space: pre-wrap !important;
      word-break: break-all !important;
    }

    /* 防止表格超出边界 */
    table {
      max-width: 100% !important;
      overflow-x: auto !important;
      table-layout: auto !important;
    }

    /* 防止长文本溢出 */
    p, span, div {
      max-width: 100% !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
    }

    /* 防止 v-click 内容超出 */
    .v-click {
      max-width: 100% !important;
      overflow: hidden !important;
    }

    /* 标题间距 */
    h2 { margin-bottom: 0.5em !important; }
    h3 { margin-top: 0.75em !important; margin-bottom: 0.5em !important; }
  `,
})
