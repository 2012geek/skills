#!/usr/bin/env node

/**
 * HTML Presentation Builder - Reveal.js Backend
 * Converts Markdown to interactive HTML presentation using reveal.js
 * @version 3.0.0 - Extracted from build.js for multi-framework support
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG = {
  title: 'Presentation',
  theme: 'dracula',
  highlightTheme: 'monokai',
  transition: 'slide',
  slideNumber: false,
  controls: true,
  progress: true,
  center: false,
  sidebar: true,
  export: true,
  autoAnimate: true,
  mouseWheel: true,
  previewLinks: true,
  codeLineNumbers: true,
  maxContentLength: 1500
};

const THEMES = ['black', 'white', 'league', 'beige', 'night', 'dracula', 'solarized'];

const HIGHLIGHT_THEMES = [
  'atom-one-dark', 'atom-one-light', 'github', 'github-dark', 'monokai',
  'moon', 'nord', 'obsidian', 'solarized-dark', 'solarized-light', 'tomorrow'
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function countContentLines(content) {
  const html = marked.parse(content);
  const significantTags = html.match(/<(h[1-6]|p|li|pre|table|blockquote|td|th|div[^>]*class="code)/g);
  return significantTags ? significantTags.length : 0;
}

function needsSplit(content) {
  const lines = countContentLines(content);
  const textLength = content.length;
  // Ultra aggressive splitting: split if >5 elements OR >600 chars
  // Accounts for ASCII art/diagrams taking more visual space
  return lines > 5 || textLength > 600;
}

function splitLongContent(content, title) {
  const lines = content.split('\n');
  const slides = [];
  let currentSlide = '';
  let currentElementCount = 0;
  let inCodeBlock = false;
  let inList = false;
  let listItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentSlide += line + '\n';
      continue;
    }

    if (inCodeBlock) {
      currentSlide += line + '\n';
      // Count code block lines too - ASCII art/diagrams take visual space
      currentElementCount += 0.5;
      // Check split condition inside code blocks too
      if (currentElementCount > 5) {
        slides.push(currentSlide);
        currentSlide = '';
        currentElementCount = 0;
      }
      continue;
    }

    if (line.match(/^\s*[-*+]\s/)) {
      inList = true;
      listItems.push(line);
    } else if (line.match(/^\s*\d+\.\s/)) {
      inList = true;
      listItems.push(line);
    } else if (line.trim() === '' && inList) {
      inList = false;
      listItems.push(line);

      if (listItems.length > 15) {
        const mid = Math.ceil(listItems.length / 2);
        slides.push(currentSlide + listItems.slice(0, mid).join('\n'));
        currentSlide = listItems.slice(mid).join('\n');
        currentElementCount = listItems.length - mid;
      } else {
        currentSlide += listItems.join('\n');
        currentElementCount += listItems.length;
      }
      listItems = [];
      continue;
    } else if (inList) {
      listItems.push(line);
      continue;
    }

    if (line.match(/^#{1,6}\s/)) {
      currentElementCount++;
    } else if (line.match(/^\s*[-*+]\s+/)) {
      currentElementCount++;
    } else if (line.match(/^\s*\d+\.\s+/)) {
      currentElementCount++;
    } else if (line.trim().length > 0 && !line.match(/^\s*$/)) {
      currentElementCount += 0.5;
    }

    currentSlide += line + '\n';

    // Split every 5 elements - ultra aggressive
    if (currentElementCount > 5) {
      slides.push(currentSlide);
      currentSlide = '';
      currentElementCount = 0;
    }
  }

  if (listItems.length > 0) {
    currentSlide += listItems.join('\n');
  }

  if (currentSlide.trim()) {
    slides.push(currentSlide);
  }

  if (slides.length === 0) {
    return [content];
  }

  return slides.map((slideContent, idx) => {
    if (idx === 0) return slideContent;
    return `## ${title} (续)\n\n` + slideContent;
  });
}

function parseSlides(markdown) {
  const lines = markdown.split('\n');
  const slides = [];
  let currentSlide = { content: '', title: '', level: 0, index: 0, notes: '' };
  let slideIndex = 0;

  for (const line of lines) {
    if (line.match(/^---$/)) {
      if (currentSlide.content.trim()) {
        if (needsSplit(currentSlide.content)) {
          const splitContents = splitLongContent(currentSlide.content, currentSlide.title || '续');
          splitContents.forEach((content, idx) => {
            if (idx === 0) {
              currentSlide.content = content;
              currentSlide.index = slideIndex++;
              slides.push(currentSlide);
            } else {
              slides.push({
                content: content,
                title: currentSlide.title,
                level: currentSlide.level,
                index: slideIndex++,
                notes: ''
              });
            }
          });
        } else {
          currentSlide.index = slideIndex++;
          slides.push(currentSlide);
        }
      }
      currentSlide = { content: '', title: '', level: 0, index: slideIndex, notes: '' };
    } else if (line.match(/^----$/)) {
      currentSlide.content += '\n\n' + line + '\n\n';
    } else {
      const noteMatch = line.match(/^Note:\s*(.+)$/);
      if (noteMatch) {
        currentSlide.notes += noteMatch[1] + ' ';
      } else {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch && !currentSlide.title) {
          currentSlide.title = headingMatch[2];
          currentSlide.level = headingMatch[1].length;
        }
        currentSlide.content += line + '\n';
      }
    }
  }

  if (currentSlide.content.trim()) {
    if (needsSplit(currentSlide.content)) {
      const splitContents = splitLongContent(currentSlide.content, currentSlide.title || '续');
      splitContents.forEach((content, idx) => {
        if (idx === 0) {
          currentSlide.content = content;
          currentSlide.index = slideIndex++;
          slides.push(currentSlide);
        } else {
          slides.push({
            content: content,
            title: currentSlide.title,
            level: currentSlide.level,
            index: slideIndex++,
            notes: ''
          });
        }
      });
    } else {
      currentSlide.index = slideIndex;
      slides.push(currentSlide);
    }
  }

  return slides;
}

function enhanceMarkdown(content, slideIndex, isFirstSlide) {
  let enhanced = content;

  if (isFirstSlide) {
    enhanced = enhanced.replace(/^# (.+)$/m, '# <span class="r-fit-text">$1</span>');
  }

  enhanced = enhanced.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1-- $2');
  enhanced = enhanced.replace(/^(\s*)\d+\.\s+(.+)$/gm, '$1-- $2');
  enhanced = enhanced.replace(/^(\s*)<li>/gm, '$1<li class="fragment fade-up">');

  return enhanced;
}

// ============================================================================
// HTML GENERATION
// ============================================================================

function generateSidebar(slides, totalSlides) {
  const sidebarItems = slides.map((slide) => {
    const thumbnailTitle = escapeHtml(slide.title || `Slide ${slide.index + 1}`);
    return `<div class="sidebar-item" data-slide="${slide.index}" onclick="goToSlide(${slide.index})">
      <div class="slide-number">${slide.index + 1}</div>
      <div class="slide-title">${thumbnailTitle}</div>
    </div>`;
  }).join('\n');

  return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <h3>Slides <span class="slide-count">(${totalSlides})</span></h3>
      </div>
      <div class="sidebar-items">
        ${sidebarItems}
      </div>
    </div>
    <div class="resizer" id="resizer"></div>
  `;
}

function generateActionButtons() {
  return `
    <div class="action-buttons">
      <button class="action-btn export-btn" onclick="exportToPPTX()" title="Export to PPTX">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Export PPTX</span>
      </button>
      <button class="action-btn fullscreen-btn" onclick="toggleFullscreen()">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
        <span>Fullscreen</span>
      </button>
    </div>
  `;
}

function generateStyles(config) {
  return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        height: 100%;
        overflow: hidden;
        font-family: "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 900;
        color: #000000;
      }
      .presentation-container {
        display: flex;
        height: 100vh;
        width: 100vw;
        background: #f5f7fa;
        position: relative;
      }
      .sidebar {
        width: 280px;
        min-width: 150px;
        max-width: 800px;
        height: 100%;
        background: #ffffff;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: 100;
      }
      .sidebar::-webkit-scrollbar { width: 4px; }
      .sidebar::-webkit-scrollbar-track { background: #f1f5f9; }
      .sidebar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
      .sidebar-header {
        padding: 20px 15px 15px 15px;
        border-bottom: 1px solid #e1e8ed;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sidebar-header h3 {
        color: #1e293b;
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .slide-count {
        font-size: 12px;
        color: #64748b;
        font-weight: normal;
        text-transform: none;
      }
      .sidebar-items {
        padding: 10px;
        flex: 1;
        transition: opacity 0.3s ease;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .resizer {
        width: 8px;
        background: #e1e8ed;
        cursor: col-resize;
        position: relative;
        z-index: 102;
        transition: background 0.2s ease;
        flex-shrink: 0;
        height: 100%;
      }
      .resizer:hover, .resizer.resizing {
        background: #6366f1;
        width: 10px;
      }
      .resizer::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 4px;
        height: 60px;
        background: #cbd5e1;
        border-radius: 2px;
        transition: background 0.2s ease;
      }
      .resizer:hover::after, .resizer.resizing::after {
        background: #ffffff;
        height: 80px;
      }
      .sidebar-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 15px;
        margin-bottom: 4px;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }
      .sidebar-item:hover {
        background: #f8fafc;
        border-color: #e2e8f0;
      }
      .sidebar-item.active {
        background: #eef2ff;
        border-color: #6366f1;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
      }
      .slide-number {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        min-width: 28px;
        height: 28px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 600;
        flex-shrink: 0;
        box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
      }
      .sidebar-item.active .slide-number {
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
      }
      .slide-title {
        flex: 1;
        color: #334155;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sidebar-item.active .slide-title {
        color: #4f46e5;
        font-weight: 600;
      }
      .content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: #f8fafc;
        position: relative;
        min-width: 0;
        min-height: 0;
      }
      .action-buttons {
        position: absolute;
        top: 15px;
        right: 20px;
        display: flex;
        gap: 10px;
        z-index: 1000;
      }
      .action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      .export-btn {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }
      .export-btn:hover {
        background: linear-gradient(135deg, #059669, #047857);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
      .fullscreen-btn {
        background: white;
        color: #475569;
      }
      .fullscreen-btn:hover {
        background: #f1f5f9;
        transform: translateY(-1px);
      }
      .reveal {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .reveal .slides {
        position: relative !important;
        width: 95% !important;
        height: 95% !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        margin: 2.5% auto !important;
      }
      .reveal .slides section {
        top: auto !important;
        left: auto !important;
        transform: none !important;
        text-align: left !important;
      }
      .reveal h1, .reveal h2, .reveal h3, .reveal h4, .reveal h5, .reveal h6 {
        font-weight: 900 !important;
        text-align: left !important;
        margin-top: 20px !important;
        margin-bottom: 15px !important;
        padding-left: 0 !important;
      }
      .reveal h1 {
        font-size: 2.2em !important;
        margin-top: 10px !important;
        padding: 15px 0 !important;
      }
      .reveal h2 {
        font-size: 1.8em !important;
        padding: 12px 0 !important;
      }
      .reveal h3 {
        font-size: 1.5em !important;
        padding: 10px 0 !important;
      }
      .reveal h4 {
        font-size: 1.3em !important;
      }
      .reveal .r-fit-text {
        display: inline-block;
        max-width: 100%;
      }
      .reveal p, .reveal li, .reveal td, .reveal th, .reveal blockquote, .reveal span, .reveal div {
        font-family: "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, sans-serif !important;
        font-weight: 900 !important;
        color: #000000 !important;
        text-align: left !important;
      }
      .reveal ul, .reveal ol {
        margin-left: 0 !important;
        padding-left: 40px !important;
        text-align: left !important;
        margin-top: 10px !important;
        margin-bottom: 10px !important;
      }
      .reveal li {
        margin-bottom: 8px !important;
        text-align: left !important;
        line-height: 1.5 !important;
      }
      .reveal table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
        text-align: left !important;
      }
      .reveal th, .reveal td {
        padding: 12px 15px;
        text-align: left !important;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      }
      .reveal th {
        background: rgba(99, 102, 241, 0.1);
        font-weight: 900 !important;
      }
      .reveal blockquote {
        border-left: 4px solid #6366f1;
        padding-left: 20px;
        margin: 15px 0;
        font-style: italic;
        color: rgba(0, 0, 0, 0.8);
        text-align: left !important;
      }
      .reveal pre {
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        margin: 15px 0 !important;
        text-align: left !important;
      }
      .reveal pre code {
        padding: 20px !important;
        max-height: 450px !important;
        overflow: auto !important;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
        font-size: 14px !important;
        line-height: 1.4 !important;
        text-align: left !important;
      }
      .reveal p code, .reveal li code {
        background: rgba(0, 0, 0, 0.05);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
        font-size: 0.9em !important;
      }
      .reveal .container {
        display: flex;
        gap: 30px;
        align-items: flex-start;
      }
      .reveal .column {
        flex: 1;
        text-align: left !important;
      }
      .reveal .fragment.fade-up {
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
      }
      .reveal .fragment.fade-up.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .reveal section[data-auto-animate] {
        transition: all 0.3s ease;
      }
      .presentation-container.fullscreen .sidebar,
      .presentation-container.fullscreen .resizer {
        display: none !important;
      }
      .presentation-container.fullscreen .content-area {
        width: 100%;
      }
      .hljs-ln {
        display: table;
        width: 100%;
      }
      .hljs-ln-code {
        padding-left: 10px;
      }
      .hljs-ln-numbers {
        text-align: right;
        color: #63683a;
        padding-right: 15px;
        user-select: none;
      }
      .export-status {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1e293b;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        display: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      .export-status.show {
        display: block;
      }
      .export-status.success {
        background: linear-gradient(135deg, #10b981, #059669);
      }
      .export-status.error {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }
      .reveal .slides section {
        max-height: 90vh !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding: 20px !important;
      }
      .reveal .slides section * {
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }
      .reveal table {
        table-layout: auto;
        max-width: 100%;
      }
      .reveal pre {
        max-width: 100%;
        overflow-x: auto;
      }
    </style>
  `;
}

function generateScripts(config, totalSlides) {
  const autoAnimateConfig = config.autoAnimate ? `
    autoAnimate: true,
    autoAnimateEasing: 'ease',
    autoAnimateDuration: 0.3,
    autoAnimateUnmatched: true,` : '';

  const mouseWheelConfig = config.mouseWheel ? `
    mouseWheel: true,` : '';

  const previewLinksConfig = config.previewLinks ? `
    previewLinks: true,` : '';

  return `
    <script src="https://unpkg.com/reveal.js@4.6.1/dist/reveal.js"></script>
    <script src="https://unpkg.com/reveal.js@4.6.1/plugin/markdown/markdown.js"></script>
    <script src="https://unpkg.com/reveal.js@4.6.1/plugin/highlight/highlight.js"></script>
    <script src="https://unpkg.com/reveal.js@4.6.1/plugin/notes/notes.js"></script>
    ${config.codeLineNumbers ? '<script src="https://unpkg.com/reveal.js@4.6.1/plugin/highlight/line-numbers.js"></script>' : ''}
    <script src="https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"></script>
    <script>
      Reveal.initialize({
        hash: true,
        slideNumber: ${config.slideNumber},
        controls: ${config.controls},
        progress: ${config.progress},
        center: ${config.center},
        embedded: true,
        ${autoAnimateConfig}
        ${mouseWheelConfig}
        ${previewLinksConfig}
        plugins: [RevealMarkdown, RevealHighlight, RevealNotes],
        highlight: {
          highlightOnLoad: true,
          ${config.codeLineNumbers ? 'lineNumbers: true,' : ''}
        }
      });

      function goToSlide(index) {
        Reveal.slide(index);
        updateActiveSlide(index);
      }

      function updateActiveSlide(index) {
        const items = document.querySelectorAll('.sidebar-item');
        items.forEach((item, i) => {
          item.classList.toggle('active', i === index);
        });
      }

      Reveal.on('slidechanged', event => {
        updateActiveSlide(event.indexh);
      });

      Reveal.on('ready', event => {
        updateActiveSlide(event.indexh);
      });

      const sidebar = document.getElementById('sidebar');
      const resizer = document.getElementById('resizer');
      let isResizing = false;

      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 150 && newWidth <= 800) {
          sidebar.style.width = newWidth + 'px';
        }
      });

      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          resizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });

      function toggleFullscreen() {
        const container = document.querySelector('.presentation-container');
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
          container.classList.add('fullscreen');
        } else {
          document.exitFullscreen();
          container.classList.remove('fullscreen');
        }
      }

      function showStatus(message, type = 'info') {
        const status = document.createElement('div');
        status.className = 'export-status ' + type + ' show';
        status.textContent = message;
        document.body.appendChild(status);
        setTimeout(() => status.remove(), 3000);
      }

      function rgbToHex(r, g, b) {
        return [r, g, b].map(x => {
          const hex = parseInt(x).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('').toUpperCase();
      }

      function formatColorForPPTX(colorStr) {
        if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
          return '1E293B';
        }
        if (colorStr.startsWith('#')) {
          return colorStr.substring(1).toUpperCase();
        }
        const rgbMatch = colorStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
        if (rgbMatch) {
          return rgbToHex(rgbMatch[1], rgbMatch[2], rgbMatch[3]);
        }
        return '1E293B';
      }

      function getLuminance(hexColor) {
        const r = parseInt(hexColor.substr(0, 2), 16) / 255;
        const g = parseInt(hexColor.substr(2, 2), 16) / 255;
        const b = parseInt(hexColor.substr(4, 2), 16) / 255;
        const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        const R = toLinear(r);
        const G = toLinear(g);
        const B = toLinear(b);
        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
      }

      function isDarkColor(hexColor) {
        return getLuminance(hexColor) < 0.5;
      }

      function ensureContrast(textColor, bgColor) {
        const textLum = getLuminance(textColor);
        const bgLum = getLuminance(bgColor);
        const contrast = (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05);
        if (contrast < 3) {
          return isDarkColor(bgColor) ? 'FFFFFF' : '1E293B';
        }
        return textColor;
      }

      async function exportToPPTX() {
        try {
          showStatus('正在生成 PPTX...', 'info');
          const pptx = new PptxGenJS();
          pptx.layout = 'LAYOUT_16x9';
          pptx.author = 'Generated by Claude Code';
          pptx.company = 'HTML Presentation';
          pptx.subject = 'Presentation Export';

          const slides = document.querySelectorAll('.reveal .slides section');
          let slideCount = 0;

          slides.forEach((slide, index) => {
            if (slide.parentElement.tagName === 'SECTION') return;

            const pptSlide = pptx.addSlide();
            const bgColorStyle = window.getComputedStyle(slide).backgroundColor;
            const bgColorHex = formatColorForPPTX(bgColorStyle);

            if (bgColorHex !== 'FFFFFF') {
              pptSlide.background = { color: bgColorHex };
            }

            let yPos = '8%';
            const lineHeight = 0.5;

            const childNodes = Array.from(slide.childNodes);
            childNodes.forEach(node => {
              let text = '';
              let tagName = '';
              let style = { color: '000000', fontSize: 16, bold: false };

              if (node.nodeType === Node.TEXT_NODE) {
                text = node.textContent.trim();
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                tagName = node.tagName.toLowerCase();
                text = node.textContent.trim();
                const computedStyle = window.getComputedStyle(node);

                style.color = formatColorForPPTX(computedStyle.color);
                style.fontSize = parseInt(computedStyle.fontSize) * 0.7 || 16;
                style.bold = computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 600;

                if (tagName === 'h1' || tagName === 'h2') {
                  style.fontSize = 28;
                  style.bold = true;
                  yPos = '5%';
                } else if (tagName === 'h3') {
                  style.fontSize = 22;
                  style.bold = true;
                } else if (tagName === 'li') {
                  style.bullet = true;
                }
              }

              if (text) {
                style.color = ensureContrast(style.color, bgColorHex);
                pptSlide.addText(text, {
                  x: '3%',
                  y: yPos,
                  w: '94%',
                  fontSize: style.fontSize,
                  color: style.color,
                  bold: style.bold,
                  bullet: style.bullet || false,
                  lineSpacing: lineHeight
                });

                const currentY = parseFloat(yPos) || 8;
                yPos = (currentY + 6) + '%';
              }
            });

            slideCount++;
          });

          const fileName = 'presentation.pptx';
          await pptx.writeFile({ fileName });
          showStatus('✅ PPTX 导出成功！', 'success');

        } catch (error) {
          console.error('Export error:', error);
          showStatus('❌ 导出失败: ' + error.message, 'error');
        }
      }
    </script>
  `;
}

function generateHTML(slides, config) {
  const totalSlides = slides.length;
  const sidebarHTML = config.sidebar ? generateSidebar(slides, totalSlides) : '';
  const actionButtons = config.export ? generateActionButtons() : '';
  const styles = generateStyles(config);
  const scripts = generateScripts(config, totalSlides);

  const slidesHTML = slides.map((slide, index) => {
    const enhancedContent = enhanceMarkdown(slide.content, index, index === 0);
    const slideContent = marked.parse(enhancedContent);
    const autoAnimateAttr = config.autoAnimate ? ' data-auto-animate' : '';
    const notesHTML = slide.notes ? `
      <aside class="notes">
        ${slide.notes.trim()}
      </aside>` : '';

    return `<section${autoAnimateAttr}>${slideContent}${notesHTML}</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.title)}</title>

  <link rel="stylesheet" href="https://unpkg.com/reveal.js@4.6.1/dist/reveal.css">
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@4.6.1/dist/theme/${config.theme}.css" id="theme">
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@4.6.1/plugin/highlight/${config.highlightTheme}.css">
  ${config.codeLineNumbers ? '<link rel="stylesheet" href="https://unpkg.com/reveal.js@4.6.1/plugin/highlight/line-numbers.css">' : ''}

  ${styles}
</head>
<body>
  <div class="presentation-container">
    ${sidebarHTML}

    <div class="content-area">
      ${actionButtons}

      <div class="reveal">
        <div class="slides">
          ${slidesHTML}
        </div>
      </div>
    </div>
  </div>

  ${scripts}
</body>
</html>`;
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

function build(inputPath, outputPath, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Resolve paths - handle both relative and absolute paths
  // Scripts are in skills/html-presentation/scripts/, need to go up 3 levels to project root
  const scriptDir = __dirname;
  const baseDir = path.dirname(path.dirname(path.dirname(scriptDir)));

  let resolvedInputPath, resolvedOutputPath;
  if (path.isAbsolute(inputPath)) {
    resolvedInputPath = inputPath;
  } else {
    resolvedInputPath = path.resolve(baseDir, inputPath);
  }

  if (path.isAbsolute(outputPath)) {
    resolvedOutputPath = outputPath;
  } else {
    resolvedOutputPath = path.resolve(baseDir, outputPath);
  }

  const markdown = fs.readFileSync(resolvedInputPath, 'utf-8');
  const slides = parseSlides(markdown);

  if (slides.length === 0) {
    console.error('No slides found in markdown file');
    process.exit(1);
  }

  const html = generateHTML(slides, finalConfig);

  const outputDir = path.dirname(resolvedOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutputPath, html, 'utf-8');

  console.log(`✅ Built ${slides.length} slides`);
  console.log(`📄 Output: ${resolvedOutputPath}`);
  console.log(`🎨 Theme: ${finalConfig.theme}`);
  console.log(`🌓 Highlight: ${finalConfig.highlightTheme}`);
  if (finalConfig.autoAnimate) console.log(`✨ Auto-animate: enabled`);
  if (finalConfig.mouseWheel) console.log(`🖱️  Mouse wheel: enabled`);
  if (finalConfig.codeLineNumbers) console.log(`🔢 Line numbers: enabled`);
}

module.exports = {
  build,
  parseSlides,
  generateHTML,
  DEFAULT_CONFIG,
  THEMES,
  HIGHLIGHT_THEMES
};
