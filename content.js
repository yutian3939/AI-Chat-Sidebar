// ============================================================
// content.js - 注入页面的悬浮球 + 侧边栏 AI 对话窗口
// 使用 Shadow DOM 隔离样式，遵循 Material Design 3
// ============================================================

(async () => {
  'use strict';

  // 加载 KaTeX CSS（XHR 优先，失败则走 background 消息）
  let katexCss = '';
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', chrome.runtime.getURL('lib/katex.min.css'), false);
    xhr.send();
    if (xhr.status === 200) katexCss = xhr.responseText;
  } catch(e) {}
  if (!katexCss) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'get-katex-css' });
      if (res && res.css) katexCss = res.css;
    } catch(e) {}
  }

  // ======================== MD3 样式 ========================
  const CSS = `
    :host {
      --md-primary: #6750A4;
      --md-on-primary: #FFFFFF;
      --md-primary-container: #EADDFF;
      --md-on-primary-container: #21005D;
      --md-secondary-container: #E8DEF8;
      --md-on-secondary-container: #1D192B;
      --md-surface: #FEF7FF;
      --md-surface-dim: #DED8E1;
      --md-surface-container-lowest: #FFFFFF;
      --md-surface-container-low: #F7F2FA;
      --md-surface-container: #F3EDF7;
      --md-surface-container-high: #ECE6F0;
      --md-on-surface: #1D1B20;
      --md-on-surface-variant: #49454F;
      --md-outline: #79747E;
      --md-outline-variant: #CAC4D0;
      --md-error: #B3261E;
      --md-elevation1: 0 1px 3px 1px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.3);
      --md-elevation2: 0 2px 6px 2px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.3);
      --md-elevation3: 0 4px 8px 3px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.3);
      all: initial;
    }

    :host([data-theme="dark"]) {
      --md-primary: #D0BCFF;
      --md-on-primary: #381E72;
      --md-primary-container: #4F378B;
      --md-on-primary-container: #EADDFF;
      --md-secondary-container: #4A4458;
      --md-on-secondary-container: #E8DEF8;
      --md-surface: #141218;
      --md-surface-dim: #141218;
      --md-surface-container-lowest: #0F0D13;
      --md-surface-container-low: #1D1B20;
      --md-surface-container: #211F26;
      --md-surface-container-high: #2B2930;
      --md-on-surface: #E6E0E9;
      --md-on-surface-variant: #CAC4D0;
      --md-outline: #938F99;
      --md-outline-variant: #49454F;
      --md-error: #F2B8B5;
    }

    /* ---- 悬浮按钮 ---- */
    #fab {
      position: fixed;
      right: 12px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--md-primary);
      color: var(--md-on-primary);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--md-elevation2);
      transition: right .3s cubic-bezier(.4,0,.2,1), box-shadow .2s, border-radius .2s;
      z-index: 2147483646;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    #fab:hover { box-shadow: var(--md-elevation3); }
    #fab:active { border-radius: 12px; }
    #fab svg { width: 18px; height: 18px; fill: currentColor; pointer-events: none; }
    #fab.open { /* right 由 JS 动态设置 */ }

    /* ---- 侧边栏 ---- */
    #sidebar {
      position: fixed; top: 0; right: 0;
      width: 400px; height: 100vh;
      background: var(--md-surface);
      box-shadow: var(--md-elevation3);
      display: flex; flex-direction: column;
      transform: translateX(100%);
      transition: transform .3s cubic-bezier(.4,0,.2,1);
      z-index: 2147483647;
      font-family: 'Segoe UI', Roboto, 'Noto Sans SC', system-ui, sans-serif;
      color: var(--md-on-surface);
    }
    #sidebar.open { transform: translateX(0); }

    /* 拖拽调整宽度手柄 */
    #resize-handle {
      position: absolute; left: 0; top: 0; bottom: 0;
      width: 6px; cursor: ew-resize; z-index: 20;
      transition: background .15s;
    }
    #resize-handle:hover, #resize-handle.resizing {
      background: var(--md-primary); opacity: .4;
    }

    /* ---- 头部 ---- */
    .header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px;
      background: var(--md-surface-container);
      border-bottom: 1px solid var(--md-outline-variant);
      min-height: 64px;
    }
    .header-icon { width: 32px; height: 32px; fill: var(--md-primary); flex-shrink: 0; }
    .header-title {
      flex: 1; font-size: 18px; font-weight: 600;
      color: var(--md-on-surface);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .icon-btn {
      width: 40px; height: 40px; border-radius: 20px;
      border: none; background: transparent;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: var(--md-on-surface-variant);
      transition: background .2s;
      flex-shrink: 0;
    }
    .icon-btn:hover { background: var(--md-surface-container-high); }
    .icon-btn svg { width: 22px; height: 22px; fill: currentColor; }

    /* ---- 消息区域 ---- */
    .messages {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 16px; display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: var(--md-outline-variant); border-radius: 3px; }
    .messages::-webkit-scrollbar-track { background: transparent; }

    /* ---- 消息气泡 ---- */
    .msg { display: flex; flex-direction: column; max-width: 88%; animation: fadeUp .25s ease; }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .msg.ai { align-self: flex-start; align-items: flex-start; }
    .bubble {
      padding: 12px 16px; font-size: 14px; line-height: 1.65;
      word-wrap: break-word; overflow-wrap: break-word;
    }
    .msg.user .bubble {
      background: var(--md-primary);
      color: var(--md-on-primary);
      border-radius: 20px 20px 4px 20px;
    }
    .msg.ai .bubble {
      background: var(--md-surface-container-high);
      color: var(--md-on-surface);
      border-radius: 20px 20px 20px 4px;
    }
    .ts { font-size: 11px; color: var(--md-outline); margin-top: 4px; padding: 0 4px; }

    /* ---- 加载动画 ---- */
    .dots { display: flex; gap: 6px; padding: 6px 0; }
    .dots span {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--md-primary); opacity: .4;
      animation: bounce .6s infinite alternate;
    }
    .dots span:nth-child(2) { animation-delay: .2s; }
    .dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes bounce { to { opacity: 1; transform: translateY(-5px); } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    /* ---- 输入区域 ---- */
    .input-area {
      padding: 12px 16px; display: flex; gap: 8px; align-items: flex-end;
      background: var(--md-surface-container-low);
      border-top: 1px solid var(--md-outline-variant);
    }
    .input-wrap {
      flex: 1; background: var(--md-surface-container);
      border-radius: 24px; padding: 10px 18px;
      transition: outline .15s;
      outline: 2px solid transparent; outline-offset: -2px;
    }
    .input-wrap:focus-within { outline-color: var(--md-primary); }
    .input-wrap textarea {
      width: 100%; border: none; outline: none; resize: none;
      background: transparent; color: var(--md-on-surface);
      font-size: 14px; font-family: inherit; line-height: 1.5;
      max-height: 120px; min-height: 21px;
    }
    .input-wrap textarea::placeholder { color: var(--md-on-surface-variant); }
    .send-btn {
      width: 48px; height: 48px; border-radius: 24px;
      background: var(--md-primary); color: var(--md-on-primary);
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s, opacity .2s;
      flex-shrink: 0;
    }
    .send-btn:hover { filter: brightness(1.08); }
    .send-btn:disabled { opacity: .38; cursor: default; filter: none; }
    .send-btn svg { width: 22px; height: 22px; fill: currentColor; }

    /* ---- Markdown 渲染 ---- */
    .bubble h1,.bubble h2,.bubble h3,.bubble h4,.bubble h5,.bubble h6 {
      margin: 10px 0 4px; font-weight: 600; line-height: 1.3;
    }
    .bubble h1 { font-size: 1.25em; } .bubble h2 { font-size: 1.15em; } .bubble h3 { font-size: 1.05em; }
    .bubble p { margin: 4px 0; }
    .bubble ul,.bubble ol { margin: 4px 0; padding-left: 22px; }
    .bubble li { margin: 2px 0; }
    .bubble blockquote {
      border-left: 3px solid var(--md-outline);
      margin: 6px 0; padding: 4px 12px;
      color: var(--md-on-surface-variant);
    }
    .bubble a { color: var(--md-primary); text-decoration: underline; }
    .msg.user .bubble a { color: var(--md-primary-container); }
    .bubble code {
      background: var(--md-surface-container-low);
      padding: 1px 6px; border-radius: 6px;
      font-family: 'Cascadia Code', Consolas, monospace; font-size: .88em;
    }
    .msg.user .bubble code { background: rgba(255,255,255,.18); }
    .cb-wrap { position: relative; margin: 8px 0; }
    .bubble pre {
      background: var(--md-surface-container-lowest);
      border: 1px solid var(--md-outline-variant);
      border-radius: 12px; padding: 12px 14px;
      overflow-x: auto; margin: 0;
      font-family: 'Cascadia Code', Consolas, monospace; font-size: .88em;
      line-height: 1.5;
    }
    .msg.user .bubble pre { background: rgba(0,0,0,.15); border-color: rgba(255,255,255,.15); }
    .bubble pre code { background: none; padding: 0; border-radius: 0; }
    .copy-btn {
      position: absolute; top: 6px; right: 6px;
      background: var(--md-surface-container-high);
      border: 1px solid var(--md-outline-variant);
      border-radius: 8px; padding: 3px 10px;
      font-size: 12px; cursor: pointer;
      color: var(--md-on-surface-variant);
      opacity: 0; transition: opacity .2s;
    }
    .cb-wrap:hover .copy-btn { opacity: 1; }
    .copy-btn:hover { background: var(--md-surface-container); }
    .cursor-blink {
      display: inline-block; width: 2px; height: 1em;
      background: var(--md-primary); margin-left: 2px;
      vertical-align: text-bottom;
      animation: blink .8s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }

    /* ---- 欢迎页 ---- */
    .welcome {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      color: var(--md-on-surface-variant); text-align: center; padding: 32px;
    }
    .welcome svg { width: 64px; height: 64px; fill: var(--md-outline-variant); margin-bottom: 16px; }
    .welcome h3 { font-size: 18px; font-weight: 600; color: var(--md-on-surface); margin-bottom: 8px; }
    .welcome p { font-size: 14px; line-height: 1.6; }

    /* ---- 错误消息 ---- */
    .err {
      background: #FDECEA; color: var(--md-error);
      padding: 10px 14px; border-radius: 12px;
      font-size: 13px; border-left: 3px solid var(--md-error);
    }
    :host([data-theme="dark"]) .err { background: rgba(242,184,182,.12); }

    /* ---- 自动答题 ---- */
    .auto-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 16px 0 16px; background: var(--md-surface-container-low);
    }
    .auto-btn {
      position: relative; overflow: hidden;
      display: flex; align-items: center; gap: 6px;
      padding: 7px 18px; border-radius: 20px;
      border: 1px solid var(--md-primary);
      background: var(--md-primary-container);
      color: var(--md-on-primary-container);
      font-size: 13px; font-weight: 600; cursor: pointer;
      font-family: inherit; transition: all .2s;
      user-select: none; -webkit-user-select: none;
      touch-action: manipulation;
    }
    .auto-btn:hover { filter: brightness(1.05); }
    .auto-btn:disabled { opacity: .5; cursor: not-allowed; filter: none; }
    .auto-btn svg { width: 18px; height: 18px; fill: currentColor; position: relative; z-index: 1; }
    .auto-btn-text { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .auto-btn-fill {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: var(--md-primary); opacity: .45;
      transition: width .4s ease;
      border-radius: 20px 0 0 20px;
      z-index: 0;
    }
    .auto-btn.paused .auto-btn-fill { opacity: .45; animation: pulse-fill 1.2s ease infinite; }
    @keyframes pulse-fill { 0%,100% { opacity: .3; } 50% { opacity: .55; } }
    .auto-status {
      font-size: 13px; color: var(--md-on-surface-variant); flex: 1;
    }
    .auto-status .done { color: #2E7D32; }
    :host([data-theme="dark"]) .auto-status .done { color: #81C784; }

    .auto-results-wrap { display: none; }
    .auto-results {
      align-self: stretch; flex-shrink: 0;
      margin: 0; background: var(--md-surface-container);
      border-radius: 16px; border: 1px solid var(--md-outline-variant);
      overflow: hidden; animation: fadeUp .3s ease;
    }
    .auto-results-head {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; cursor: pointer;
      font-size: 14px; font-weight: 500; color: var(--md-on-surface);
      transition: background .2s; user-select: none;
    }
    .auto-results-head:hover { background: var(--md-surface-container-high); }
    .auto-results-head .arr {
      transition: transform .25s; font-size: 12px; color: var(--md-outline);
      display: inline-block;
    }
    .auto-results-head .arr.fold { transform: rotate(-90deg); }
    .auto-results-body {
      padding: 0 14px 10px; max-height: 300px; overflow-y: auto;
      scroll-behavior: smooth;
    }
    .auto-results-body::-webkit-scrollbar { width: 4px; }
    .auto-results-body::-webkit-scrollbar-thumb { background: var(--md-outline-variant); border-radius: 2px; }
    .auto-results-body.hidden { display: none; }
    .auto-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 0; border-bottom: 1px solid var(--md-outline-variant);
      font-size: 13px;
    }
    .auto-item:last-child { border-bottom: none; }
    .auto-item-num {
      font-weight: 600; color: var(--md-primary); min-width: 44px; flex-shrink: 0;
    }
    .auto-item-body { flex: 1; min-width: 0; }
    .auto-item-answer {
      display: flex; align-items: center; gap: 8px; margin-bottom: 2px;
    }
    .auto-item-letter {
      background: var(--md-primary-container); color: var(--md-on-primary-container);
      padding: 1px 14px; border-radius: 10px; font-weight: 700; font-size: 14px;
    }
    .auto-item-reason {
      color: var(--md-on-surface-variant); font-size: 12px; line-height: 1.5;
      word-break: break-all;
    }
    .auto-item-loading {
      display: flex; align-items: center; gap: 6px; color: var(--md-outline);
    }
    .auto-item-loading .dots-sm { display: flex; gap: 3px; }
    .auto-item-loading .dots-sm span {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--md-primary); opacity: .5;
      animation: bounce .6s infinite alternate;
    }
    .auto-item-loading .dots-sm span:nth-child(2) { animation-delay: .2s; }
    .auto-item-loading .dots-sm span:nth-child(3) { animation-delay: .4s; }
    .auto-item-error { color: var(--md-error); font-size: 12px; }
    .auto-item-done { color: var(--md-primary); font-size: 12px; }

    /* ---- 历史记录面板 ---- */
    .history-panel {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: var(--md-surface); z-index: 10;
      display: flex; flex-direction: column;
    }
    .history-head {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px;
      background: var(--md-surface-container);
      border-bottom: 1px solid var(--md-outline-variant);
    }
    .history-title { flex: 1; font-size: 16px; font-weight: 600; color: var(--md-on-surface); }
    .history-head .icon-btn { width: 36px; height: 36px; border-radius: 18px; }
    .history-head .icon-btn svg { width: 20px; height: 20px; }
    .history-list { flex: 1; overflow-y: auto; padding: 8px; }
    .history-list::-webkit-scrollbar { width: 4px; }
    .history-list::-webkit-scrollbar-thumb { background: var(--md-outline-variant); border-radius: 2px; }
    .history-empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; color: var(--md-on-surface-variant); font-size: 14px; gap: 8px;
    }
    .history-empty svg { width: 48px; height: 48px; fill: var(--md-outline-variant); }
    .history-item {
      display: flex; align-items: center; gap: 10px;
      padding: 12px; border-radius: 12px; cursor: pointer;
      transition: background .15s; margin-bottom: 4px;
    }
    .history-item:hover { background: var(--md-surface-container-high); }
    .history-item.active { background: var(--md-primary-container); }
    .history-item-info { flex: 1; min-width: 0; }
    .history-item-title {
      font-size: 14px; font-weight: 500; color: var(--md-on-surface);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .history-item-meta {
      font-size: 12px; color: var(--md-on-surface-variant); margin-top: 2px;
      display: flex; gap: 12px;
    }
    .history-item-del {
      width: 32px; height: 32px; border-radius: 16px; border: none;
      background: transparent; cursor: pointer; display: flex; align-items: center;
      justify-content: center; color: var(--md-outline); flex-shrink: 0;
      opacity: 0; transition: opacity .15s;
    }
    .history-item:hover .history-item-del { opacity: 1; }
    .history-item-del:hover { background: var(--md-surface-container); color: var(--md-error); }
    .history-item-del svg { width: 18px; height: 18px; fill: currentColor; }

    /* ---- 设置面板 ---- */
    .settings-panel {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: var(--md-surface); z-index: 10;
      display: flex; flex-direction: column;
    }
    .settings-head {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px;
      background: var(--md-surface-container);
      border-bottom: 1px solid var(--md-outline-variant);
    }
    .settings-title { flex: 1; font-size: 16px; font-weight: 600; color: var(--md-on-surface); }
    .settings-body {
      flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px;
    }
    .settings-body::-webkit-scrollbar { width: 4px; }
    .settings-body::-webkit-scrollbar-thumb { background: var(--md-outline-variant); border-radius: 2px; }
    .settings-section { margin-bottom: 20px; }
    .settings-section h3 {
      font-size: 14px; font-weight: 600; color: var(--md-on-surface); margin-bottom: 4px;
    }
    .settings-hint {
      font-size: 12px; color: var(--md-on-surface-variant); margin-bottom: 10px; line-height: 1.5;
    }
    .settings-body input, .settings-body textarea, .settings-body select {
      width: 100%; max-width: 100%; box-sizing: border-box;
      padding: 12px 14px;
      border: 1px solid var(--md-outline); border-radius: 12px;
      background: var(--md-surface-container-high);
      color: var(--md-on-surface);
      font-size: 14px; font-family: inherit;
      transition: border-color .2s, box-shadow .2s;
      outline: none;
    }
    .settings-body input:focus, .settings-body textarea:focus, .settings-body select:focus {
      border-color: var(--md-primary);
      box-shadow: 0 0 0 2px var(--md-primary-container);
    }
    .settings-body input::placeholder, .settings-body textarea::placeholder {
      color: var(--md-on-surface-variant); opacity: .7;
    }
    .settings-body textarea { resize: vertical; min-height: 60px; line-height: 1.5; }
    .settings-body select {
      cursor: pointer; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%2379747E' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
      padding-right: 40px;
    }
    .settings-body label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--md-on-surface-variant); }
    .presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .preset-chip {
      padding: 6px 14px; border-radius: 20px; border: 1px solid var(--md-outline-variant);
      background: var(--md-surface-container); color: var(--md-on-surface-variant);
      font-size: 12px; cursor: pointer; font-family: inherit;
      transition: all .2s; white-space: nowrap;
    }
    .preset-chip:hover { background: var(--md-surface-container-high); border-color: var(--md-outline); }
    .preset-chip.active {
      background: var(--md-primary-container); color: var(--md-on-primary-container);
      border-color: var(--md-primary);
    }
    .password-wrap { position: relative; }
    .password-wrap input { padding-right: 44px; }
    .toggle-vis {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      width: 32px; height: 32px; border: none; border-radius: 16px;
      background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--md-on-surface-variant); transition: background .2s;
    }
    .toggle-vis:hover { background: var(--md-surface-container-highest, #E6E0E9); }
    .toggle-vis svg { width: 18px; height: 18px; fill: currentColor; }
    .settings-actions { display: flex; gap: 10px; margin-top: 20px; }
    .settings-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 22px; border-radius: 100px;
      font-size: 13px; font-weight: 500; font-family: inherit;
      cursor: pointer; transition: all .2s; border: none;
    }
    .settings-btn svg { width: 16px; height: 16px; fill: currentColor; }
    .settings-btn.primary {
      background: var(--md-primary); color: var(--md-on-primary);
      box-shadow: 0 1px 3px rgba(0,0,0,.15);
    }
    .settings-btn.primary:hover { filter: brightness(1.08); box-shadow: 0 2px 6px rgba(0,0,0,.2); }
    .settings-btn.primary:disabled { opacity: .5; cursor: not-allowed; filter: none; }
    .settings-btn.outline {
      background: transparent; color: var(--md-primary);
      border: 1px solid var(--md-outline);
    }
    .settings-btn.outline:hover { background: var(--md-primary-container); }
    .settings-status {
      margin-top: 12px; padding: 10px 14px; border-radius: 10px;
      font-size: 13px; line-height: 1.5;
      display: none;
    }
    .settings-status.show { display: block; }
    .settings-status.success { background: #E8F5E9; color: #2E7D32; border-left: 3px solid #4CAF50; }
    .settings-status.error { background: #FDECEA; color: var(--md-error); border-left: 3px solid var(--md-error); }
    :host([data-theme="dark"]) .settings-status.success { background: rgba(76,175,99,.12); color: #81C784; }
    :host([data-theme="dark"]) .settings-status.error { background: rgba(242,184,182,.12); }

    @keyframes spin { to { transform: rotate(360deg); } }
  ` + katexCss;

  // ======================== 状态 ========================
  let sidebarOpen = false;
  let chatHistory = [];
  let isStreaming = false;
  let currentPort = null;
  let fabY = 60;
  let dragState = null;
  let themePref = 'system';
  let isAutoAnswering = false;
  let isAutoAnswerPaused = false;
  let autoAnswerAbort = false;
  let autoAnswerQueue = [];
  let autoAnswerData = null; // { total, results: [{qnum, letter, reason, status}] }
  let $autoResults = null;
  let $autoBtn = null;
  let $autoStatus = null;
  let $autoRow = null;
  let $autoBtnFill = null;
  let $autoBtnText = null;
  let isHomework = false;
  let longPressTimer = null;
  let longPressTriggered = false;
  let sidebarWidth = 400;
  let resizeState = null;

  // 对话历史
  let conversations = [];
  let currentConvId = null;
  let $historyPanel = null;
  let $historyList = null;

  // ======================== 创建 Shadow DOM ========================
  const host = document.createElement('div');
  host.id = 'ai-chat-ext-root';
  const shadow = host.attachShadow({ mode: 'open' });

  // 主题初始化
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  host.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (themePref === 'system') {
      host.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });

  chrome.storage.sync.get('theme', ({ theme }) => {
    themePref = theme || 'system';
    applyTheme(themePref);
  });

  function applyTheme(pref) {
    if (pref === 'dark') host.setAttribute('data-theme', 'dark');
    else if (pref === 'light') host.setAttribute('data-theme', 'light');
    else host.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  // ======================== SVG 图标 ========================
  const ICON_CHAT = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>`;
  const ICON_CLOSE = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
  const ICON_SEND = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
  const ICON_SETTINGS = `<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg>`;
  const ICON_CLEAR = `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
  const ICON_AUTO = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  const ICON_HISTORY = `<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`;
  const ICON_NEW = `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

  // ======================== 构建 DOM ========================
  const style = document.createElement('style');
  style.textContent = CSS;

  // 悬浮球
  const fab = document.createElement('button');
  fab.id = 'fab';
  fab.innerHTML = ICON_CHAT;
  fab.title = 'AI 助手';
  fab.style.top = `${fabY}%`;
  fab.style.transform = 'translateY(-50%)';

  // 侧边栏
  const sidebar = document.createElement('div');
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div id="resize-handle"></div>
    <div class="header">
      <svg class="header-icon" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
      <span class="header-title">AI 助手</span>
      <button class="icon-btn" id="btn-history" title="历史记录">${ICON_HISTORY}</button>
      <button class="icon-btn" id="btn-new-chat" title="新建对话">${ICON_NEW}</button>
      <button class="icon-btn" id="btn-settings" title="设置">${ICON_SETTINGS}</button>
      <button class="icon-btn" id="btn-close" title="关闭">${ICON_CLOSE}</button>
    </div>
    <div class="messages" id="messages">
      <div class="welcome" id="welcome">
        <svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
        <h3>AI 对话助手</h3>
        <p>点击右下角悬浮球开始对话<br>首次使用请先前往设置配置 API</p>
      </div>
    </div>
    <div class="history-panel" id="history-panel" style="display:none">
      <div class="history-head">
        <button class="icon-btn" id="btn-history-back" title="返回">${ICON_CLOSE}</button>
        <span class="history-title">历史记录</span>
        <button class="icon-btn" id="btn-history-new" title="新建对话">${ICON_NEW}</button>
      </div>
      <div class="history-list" id="history-list">
        <div class="history-empty">
          <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
          <span>暂无历史记录</span>
        </div>
      </div>
    </div>
    <div class="settings-panel" id="settings-panel" style="display:none">
      <div class="settings-head">
        <button class="icon-btn" id="btn-settings-back" title="返回">${ICON_CLOSE}</button>
        <span class="settings-title">设置</span>
      </div>
      <div class="settings-body">
        <div class="settings-section">
          <h3>Base URL</h3>
          <p class="settings-hint">只需填写 API 基础地址，系统会自动补全 /chat/completions 路径</p>
          <div class="presets" id="presets"></div>
          <input type="text" id="settings-base-url" placeholder="https://api.openai.com/v1" spellcheck="false">
        </div>
        <div class="settings-section">
          <label for="settings-api-key">API Key</label>
          <div class="password-wrap">
            <input type="password" id="settings-api-key" placeholder="sk-..." spellcheck="false">
            <button class="toggle-vis" id="settings-toggle-key" title="显示/隐藏">
              <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            </button>
          </div>
        </div>
        <div class="settings-section">
          <label for="settings-model">模型名称</label>
          <input type="text" id="settings-model" placeholder="gpt-3.5-turbo" spellcheck="false" list="settings-model-list">
          <datalist id="settings-model-list">
          </datalist>
        </div>
        <div class="settings-section">
          <label for="settings-system-prompt">系统提示词</label>
          <textarea id="settings-system-prompt" rows="3" placeholder="你是一个有帮助的AI助手。"></textarea>
        </div>
        <div class="settings-section">
          <label for="settings-theme">主题</label>
          <select id="settings-theme">
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div class="settings-actions">
          <button class="settings-btn primary" id="btn-settings-save">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            保存
          </button>
          <button class="settings-btn outline" id="btn-settings-test">
            <svg viewBox="0 0 24 24"><path d="M13 3v2h-2V3H9v2H7v2h2v2H7v2h2v2H7v2h2v2h2v-2h2v2h2v-2h2v-2h-2v-2h2V9h2V7h-2V5h-2v2h-2V5h-2zm-2 8h2v2h-2v-2z"/></svg>
            测试连接
          </button>
        </div>
        <div class="settings-status" id="settings-status"></div>
      </div>
    </div>
    <div class="auto-row" id="auto-row" style="display:none">
      <button class="auto-btn" id="btn-auto" title="自动答题">
        <div class="auto-btn-fill" id="auto-btn-fill" style="width:0%"></div>
        <span class="auto-btn-text" id="auto-btn-text">${ICON_AUTO}自动答题</span>
      </button>
      <span class="auto-status" id="auto-status"></span>
    </div>
    <div class="input-area" id="input-area">
      <div class="input-wrap">
        <textarea id="input" placeholder="输入消息… (Enter 发送, Shift+Enter 换行)" rows="1"></textarea>
      </div>
      <button class="send-btn" id="btn-send" title="发送">${ICON_SEND}</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(fab);
  shadow.appendChild(sidebar);



  // 加载侧边栏宽度偏好
  chrome.storage.sync.get('sidebarWidth', ({ sidebarWidth: sw }) => {
    if (sw && sw >= 320) {
      sidebarWidth = sw;
      sidebar.style.width = sidebarWidth + 'px';
      if (sidebarOpen) fab.style.right = (sidebarWidth + 12) + 'px';
    }
  });

  // 拖拽调整侧边栏宽度
  const resizeHandle = shadow.getElementById('resize-handle');
  resizeHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizeState = { startX: e.clientX, startWidth: sidebarWidth };
    resizeHandle.classList.add('resizing');
    resizeHandle.setPointerCapture(e.pointerId);
    sidebar.style.transition = 'none';
  });
  resizeHandle.addEventListener('pointermove', (e) => {
    if (!resizeState) return;
    const dx = resizeState.startX - e.clientX;
    let newWidth = Math.round(resizeState.startWidth + dx);
    newWidth = Math.max(300, Math.min(window.innerWidth * 0.7, newWidth));
    sidebarWidth = newWidth;
    sidebar.style.width = sidebarWidth + 'px';
    if (sidebarOpen) fab.style.right = (sidebarWidth + 12) + 'px';
  });
  resizeHandle.addEventListener('pointerup', () => {
    if (!resizeState) return;
    resizeHandle.classList.remove('resizing');
    resizeState = null;
    sidebar.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
    chrome.storage.sync.set({ sidebarWidth });
  });
  resizeHandle.addEventListener('pointerleave', () => {
    if (resizeState) {
      resizeHandle.classList.remove('resizing');
      resizeState = null;
      sidebar.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
      chrome.storage.sync.set({ sidebarWidth });
    }
  });

  // 快捷引用
  const $messages = shadow.getElementById('messages');
  const $input = shadow.getElementById('input');
  const $sendBtn = shadow.getElementById('btn-send');
  $autoBtn = shadow.getElementById('btn-auto');
  $autoStatus = shadow.getElementById('auto-status');
  $autoRow = shadow.getElementById('auto-row');
  $autoBtnFill = shadow.getElementById('auto-btn-fill');
  $autoBtnText = shadow.getElementById('auto-btn-text');
  $historyPanel = shadow.getElementById('history-panel');
  $historyList = shadow.getElementById('history-list');
  const $settingsPanel = shadow.getElementById('settings-panel');

  // ======================== 事件绑定 ========================

  // -- 悬浮球拖拽 + 点击 --
  fab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragState = { startY: e.clientY, startPct: fabY, moved: false };
    fab.style.transition = 'box-shadow .2s, border-radius .2s';
    fab.setPointerCapture(e.pointerId);
  });

  fab.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dy) > 4) dragState.moved = true;
    if (dragState.moved) {
      const vh = window.innerHeight;
      const newPct = dragState.startPct + (dy / vh) * 100;
      fabY = Math.max(8, Math.min(92, newPct));
      fab.style.top = `${fabY}%`;
    }
  });

  fab.addEventListener('pointerup', () => {
    if (!dragState) return;
    fab.style.transition = 'right .3s cubic-bezier(.4,0,.2,1), box-shadow .2s, border-radius .2s';
    if (!dragState.moved) toggleSidebar();
    dragState = null;
  });

  // -- 侧边栏按钮 --
  shadow.getElementById('btn-close').addEventListener('click', () => toggleSidebar(false));

  shadow.getElementById('btn-settings').addEventListener('click', openSettingsPanel);

  // 历史记录
  shadow.getElementById('btn-history').addEventListener('click', openHistoryPanel);
  shadow.getElementById('btn-history-back').addEventListener('click', closeHistoryPanel);
  shadow.getElementById('btn-history-new').addEventListener('click', () => { closeHistoryPanel(); newChat(); });

  // 新建对话
  shadow.getElementById('btn-new-chat').addEventListener('click', newChat);


  // 自动答题按钮：点击 = 开始/暂停/恢复，长按(800ms) = 结束
  $autoBtn.addEventListener('pointerdown', (e) => {
    longPressTriggered = false;
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      stopAutoAnswer();
      $autoBtn.classList.add('paused');
      setTimeout(() => $autoBtn.classList.remove('paused'), 600);
    }, 800);
  });
  $autoBtn.addEventListener('pointerup', () => {
    clearTimeout(longPressTimer);
    if (!longPressTriggered) {
      startAutoAnswer();
    }
  });
  $autoBtn.addEventListener('pointerleave', () => {
    clearTimeout(longPressTimer);
  });

  // -- 输入框 --
  let isComposing = false;
  $input.addEventListener('compositionstart', () => { isComposing = true; });
  $input.addEventListener('compositionend', () => { isComposing = false; });

  // 在 window 上注册 capture 监听 — 比赛谁先到！document_start 保证我们先
  window.addEventListener('keydown', (e) => {
    // composedPath 穿透 Shadow DOM，确认目标是我们 textarea
    if (!e.composedPath().includes($input)) return;
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation(); // 阻止学习通后续拿事件
      sendMessage();
    }
  }, true);
  $input.addEventListener('input', autoResize);
  $sendBtn.addEventListener('click', sendMessage);

  // 抽取发送核心（不读 textarea，直接传文本）
  function doSend(text) {
    if (!text || isStreaming) return;
    addMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    isStreaming = true;
    $sendBtn.disabled = true;
    addLoading();

    currentPort = chrome.runtime.connect({ name: 'ai-chat' });
    let aiBubble = null;
    let fullText = '';

    currentPort.onMessage.addListener((msg) => {
      if (msg.type === 'chunk') {
        if (!aiBubble) {
          removeLoading();
          aiBubble = addMessage('ai', '');
        }
        fullText += msg.content;
        aiBubble.innerHTML = renderMarkdown(fullText) + '<span class="cursor-blink"></span>';
        scrollToBottom();
      } else if (msg.type === 'error') {
        removeLoading();
        addError(msg.content);
        saveConversation();
        isStreaming = false;
        currentPort = null;
        $sendBtn.disabled = !$input.value.trim();
      } else if (msg.type === 'done') {
        removeLoading();
        if (aiBubble) {
          aiBubble.innerHTML = renderMarkdown(fullText);
        }
        if (fullText) {
          chatHistory.push({ role: 'assistant', content: fullText });
          saveConversation();
        }
        isStreaming = false;
        currentPort = null;
        $sendBtn.disabled = !$input.value.trim();
      }
    });

    currentPort.onDisconnect.addListener(() => {
      removeLoading();
      if (isStreaming) {
        if (aiBubble) {
          aiBubble.innerHTML = renderMarkdown(fullText);
        }
        if (fullText) {
          chatHistory.push({ role: 'assistant', content: fullText });
          saveConversation();
        }
        isStreaming = false;
        currentPort = null;
        $sendBtn.disabled = !$input.value.trim();
      }
    });

    currentPort.postMessage({ type: 'init', history: [...chatHistory] });
  }

  // -- 代码复制 (事件委托) --
  shadow.addEventListener('click', (e) => {
    if (e.target.classList.contains('copy-btn')) {
      const pre = e.target.closest('.cb-wrap')?.querySelector('pre code');
      if (pre) {
        navigator.clipboard.writeText(pre.textContent).then(() => {
          e.target.textContent = '已复制 ✓';
          setTimeout(() => { e.target.textContent = '复制'; }, 1500);
        });
      }
    }
  });

  // ======================== 侧边栏控制 ========================
  function toggleSidebar(force) {
    sidebarOpen = typeof force === 'boolean' ? force : !sidebarOpen;
    sidebar.classList.toggle('open', sidebarOpen);
    fab.classList.toggle('open', sidebarOpen);
    if (sidebarOpen) {
      fab.style.right = (sidebarWidth + 12) + 'px';
      isHomework = !!document.querySelector('.questionLi[typename="单选题"]');
      $autoRow.style.display = isHomework ? 'flex' : 'none';
      if (isHomework) $autoStatus.textContent = '';
      setTimeout(() => $input.focus(), 320);
    } else {
      fab.style.right = '';
    }
  }

  function autoResize() {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    $sendBtn.disabled = !$input.value.trim() || isStreaming;
  }

  // ======================== 聊天功能 ========================

  // 自动生成对话标题（取首条用户消息前 20 字）
  function genConvTitle() {
    const firstUser = chatHistory.find(m => m.role === 'user');
    if (firstUser) return firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '…' : '');
    return '新对话';
  }

  // 保存当前对话到 storage.local
  async function saveConversation() {
    if (chatHistory.length === 0) return;
    if (!currentConvId) {
      currentConvId = 'conv_' + Date.now();
    }
    const idx = conversations.findIndex(c => c.id === currentConvId);
    const conv = {
      id: currentConvId,
      title: genConvTitle(),
      messages: [...chatHistory],
      updatedAt: Date.now(),
      createdAt: idx >= 0 ? conversations[idx].createdAt : Date.now(),
      autoAnswerData: autoAnswerData ? { ...autoAnswerData } : null
    };
    if (idx >= 0) conversations[idx] = conv;
    else conversations.unshift(conv);
    await chrome.storage.local.set({ conversations, currentConvId });
  }

  // 加载历史
  async function loadConversations() {
    const data = await chrome.storage.local.get(['conversations', 'currentConvId']);
    conversations = data.conversations || [];
    currentConvId = data.currentConvId || null;
    // 如果有当前对话，恢复消息和结果面板
    if (currentConvId) {
      const conv = conversations.find(c => c.id === currentConvId);
      if (conv) {
        chatHistory = [...conv.messages];
        autoAnswerData = conv.autoAnswerData || null;
        clearAutoResultsPanel();
        restoreMessagesFromHistory();
        if (autoAnswerData) restoreAutoResultsPanel(autoAnswerData);
        scrollToBottom();
        return;
      }
    }
    currentConvId = null;
    chatHistory = [];
    autoAnswerData = null;
  }

  // 从 chatHistory 恢复 UI 消息
  function restoreMessagesFromHistory() {
    $messages.innerHTML = '';
    chatHistory.forEach(m => {
      // 过滤自动答题消息：_auto 标记 OR 内容以 [第N题] 开头
      if (m._auto) return;
      if (/^\[第\d+题\]/.test(m.content)) return;
      if (m.role === 'user') addMessageBubble('user', m.content);
      else if (m.role === 'assistant') addMessageBubble('ai', m.content);
    });
    if (chatHistory.length === 0) showWelcome();
  }

  function showWelcome() {
    $messages.innerHTML = '';
    const wel = document.createElement('div');
    wel.className = 'welcome';
    wel.id = 'welcome';
    wel.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
      <h3>AI 对话助手</h3>
      <p>输入消息开始对话<br>首次使用请先前往设置配置 API</p>
    `;
    $messages.appendChild(wel);
  }

  // 新建对话
  async function newChat() {
    if (isStreaming) return;
    // 保存当前对话
    if (currentConvId && chatHistory.length > 0) {
      await saveConversation();
    }
    currentConvId = null;
    chatHistory = [];
    autoAnswerData = null;
    clearAutoResultsPanel();
    showWelcome();
    $input.value = '';
    autoResize();
    // 持久化空会话状态，刷新后不再恢复旧对话
    await chrome.storage.local.set({ currentConvId: null });
    // 重新渲染历史列表
    renderHistoryList();
  }

  // 删除对话
  async function deleteConversation(id) {
    const idx = conversations.findIndex(c => c.id === id);
    if (idx >= 0) {
      conversations.splice(idx, 1);
      if (currentConvId === id) {
        currentConvId = null;
        chatHistory = [];
        autoAnswerData = null;
        clearAutoResultsPanel();
        showWelcome();
      }
      await chrome.storage.local.set({ conversations, currentConvId });
      renderHistoryList();
    }
  }

  // 切换到指定对话
  async function switchConversation(id) {
    if (isStreaming) return;
    if (currentConvId && chatHistory.length > 0) {
      await saveConversation();
    }
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    currentConvId = conv.id;
    chatHistory = [...conv.messages];
    autoAnswerData = conv.autoAnswerData || null;
    clearAutoResultsPanel();
    restoreMessagesFromHistory();
    if (autoAnswerData) restoreAutoResultsPanel(autoAnswerData);
    scrollToBottom();
    await chrome.storage.local.set({ currentConvId });
    closeHistoryPanel();
  }

  // 清除结果面板 DOM
  function clearAutoResultsPanel() {
    if ($autoResults) { $autoResults.remove(); $autoResults = null; }
  }

  // 历史记录面板
  function openHistoryPanel() {
    if ($historyPanel) {
      $historyPanel.style.display = 'flex';
      renderHistoryList();
    }
  }

  function closeHistoryPanel() {
    if ($historyPanel) $historyPanel.style.display = 'none';
  }

  // ======================== 设置面板 ========================
  const API_PRESETS = [
    { name: 'OpenAI', url: 'https://api.openai.com/v1' },
    { name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
    { name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { name: '智谱 GLM', url: 'https://open.bigmodel.cn/api/paas/v4' },
    { name: 'Moonshot', url: 'https://api.moonshot.cn/v1' },
    { name: '自定义', url: '' }
  ];

  const MODEL_SUGGESTIONS = [
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'deepseek-chat', 'deepseek-reasoner',
    'qwen-turbo', 'qwen-plus', 'qwen-max',
    'glm-4', 'glm-4-flash',
    'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'
  ];

  const $settingsBaseUrl = shadow.getElementById('settings-base-url');
  const $settingsApiKey = shadow.getElementById('settings-api-key');
  const $settingsModel = shadow.getElementById('settings-model');
  const $settingsSystemPrompt = shadow.getElementById('settings-system-prompt');
  const $settingsTheme = shadow.getElementById('settings-theme');
  const $settingsStatus = shadow.getElementById('settings-status');
  const $presets = shadow.getElementById('presets');
  const $modelList = shadow.getElementById('settings-model-list');
  const $btnSettingsBack = shadow.getElementById('btn-settings-back');
  const $btnSettingsSave = shadow.getElementById('btn-settings-save');
  const $btnSettingsTest = shadow.getElementById('btn-settings-test');
  const $toggleKey = shadow.getElementById('settings-toggle-key');

  // 渲染预设
  $presets.innerHTML = API_PRESETS.map(p => {
    const cls = p.url ? 'preset-chip' : 'preset-chip custom';
    return `<button class="${cls}" data-url="${p.url}">${p.name}</button>`;
  }).join('');

  $presets.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    const url = chip.dataset.url;
    // 更新所有 chip 样式
    $presets.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    if (url) {
      $settingsBaseUrl.value = url;
      $settingsBaseUrl.dispatchEvent(new Event('input'));
    } else {
      $settingsBaseUrl.value = '';
      $settingsBaseUrl.focus();
    }
  });

  // 渲染模型建议
  $modelList.innerHTML = MODEL_SUGGESTIONS.map(m => `<option value="${m}">`).join('');

  // 密码显示/隐藏
  $toggleKey.addEventListener('click', () => {
    $settingsApiKey.type = $settingsApiKey.type === 'password' ? 'text' : 'password';
  });

  // 返回按钮
  $btnSettingsBack.addEventListener('click', closeSettingsPanel);

  // 保存
  $btnSettingsSave.addEventListener('click', saveSettingsFromPanel);

  // 测试连接
  $btnSettingsTest.addEventListener('click', testConnectionFromPanel);

  function openSettingsPanel() {
    if (!$settingsPanel) return;
    // 关闭历史面板（如果开着）
    if ($historyPanel) $historyPanel.style.display = 'none';
    loadSettingsToPanel();
    $settingsPanel.style.display = 'flex';
  }

  function closeSettingsPanel() {
    if ($settingsPanel) $settingsPanel.style.display = 'none';
  }

  async function loadSettingsToPanel() {
    const settings = await chrome.storage.sync.get(['apiEndpoint', 'apiKey', 'model', 'systemPrompt', 'theme']);
    $settingsBaseUrl.value = settings.apiEndpoint || 'https://api.openai.com/v1';
    $settingsApiKey.value = settings.apiKey || '';
    $settingsModel.value = settings.model || 'gpt-3.5-turbo';
    $settingsSystemPrompt.value = settings.systemPrompt || '你是一个有帮助的AI助手。';
    $settingsTheme.value = settings.theme || 'system';

    // 高亮匹配的预设
    const currentUrl = $settingsBaseUrl.value.trim().replace(/\/+$/, '');
    $presets.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    $presets.querySelectorAll('.preset-chip').forEach(c => {
      if (c.dataset.url && c.dataset.url.trim().replace(/\/+$/, '') === currentUrl) {
        c.classList.add('active');
      }
    });
    if (!$presets.querySelector('.preset-chip.active')) {
      const customChip = $presets.querySelector('.preset-chip.custom');
      if (customChip && currentUrl) customChip.classList.add('active');
    }

    hideSettingsStatus();
  }

  async function saveSettingsFromPanel() {
    const baseUrl = $settingsBaseUrl.value.trim();
    if (!baseUrl) {
      showSettingsStatus('请填写 Base URL', 'error');
      return;
    }

    const data = {
      apiEndpoint: baseUrl,
      apiKey: $settingsApiKey.value.trim(),
      model: $settingsModel.value.trim(),
      systemPrompt: $settingsSystemPrompt.value.trim(),
      theme: $settingsTheme.value
    };

    await chrome.storage.sync.set(data);

    // 应用主题
    themePref = data.theme;
    applyTheme(themePref);

    showSettingsStatus('✓ 设置已保存', 'success');
  }

  async function testConnectionFromPanel() {
    const baseUrl = $settingsBaseUrl.value.trim();
    const apiKey = $settingsApiKey.value.trim();
    const model = $settingsModel.value.trim();

    if (!baseUrl || !apiKey) {
      showSettingsStatus('请先填写 Base URL 和 API Key', 'error');
      return;
    }

    $btnSettingsTest.disabled = true;
    const origHTML = $btnSettingsTest.innerHTML;
    $btnSettingsTest.innerHTML = `<svg viewBox="0 0 24 24" style="animation: spin 1s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> 测试中…`;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'test-connection',
        settings: { apiEndpoint: baseUrl, apiKey, model }
      });

      if (result.success) {
        showSettingsStatus('✓ 连接成功，API 配置正确', 'success');
      } else {
        showSettingsStatus(`连接失败: ${result.error}`, 'error');
      }
    } catch (err) {
      showSettingsStatus(`连接失败: ${err.message}`, 'error');
    } finally {
      $btnSettingsTest.disabled = false;
      $btnSettingsTest.innerHTML = origHTML;
    }
  }

  function showSettingsStatus(text, type) {
    if (!$settingsStatus) return;
    $settingsStatus.textContent = text;
    $settingsStatus.className = `settings-status show ${type}`;
    clearTimeout($settingsStatus._timer);
    $settingsStatus._timer = setTimeout(() => hideSettingsStatus(), 5000);
  }

  function hideSettingsStatus() {
    if ($settingsStatus) $settingsStatus.className = 'settings-status';
  }

  function renderHistoryList() {
    if (!$historyList) return;
    if (conversations.length === 0) {
      $historyList.innerHTML = `
        <div class="history-empty">
          <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
          <span>暂无历史记录</span>
        </div>`;
      return;
    }
    $historyList.innerHTML = conversations.map(c => {
      const msgCount = c.messages ? c.messages.length : 0;
      const date = new Date(c.updatedAt || c.createdAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      const isActive = c.id === currentConvId;
      return `
        <div class="history-item${isActive ? ' active' : ''}" data-id="${c.id}">
          <div class="history-item-info">
            <div class="history-item-title">${escapeHtml(c.title || '新对话')}</div>
            <div class="history-item-meta">
              <span>${msgCount} 条消息</span>
              <span>${dateStr}</span>
            </div>
          </div>
          <button class="history-item-del" data-del="${c.id}" title="删除">${ICON_CLEAR}</button>
        </div>`;
    }).join('');

    // 绑定点击事件
    $historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.history-item-del')) return;
        switchConversation(el.dataset.id);
      });
    });
    $historyList.querySelectorAll('.history-item-del').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(el.dataset.del);
      });
    });
  }

  function addMessageBubble(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = renderMarkdown(text);
    wrap.appendChild(bubble);
    const ts = document.createElement('div');
    ts.className = 'ts';
    ts.textContent = timeStr();
    wrap.appendChild(ts);
    $messages.appendChild(wrap);
    return bubble;
  }

  function timeStr() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(role, text) {
    const wel = shadow.getElementById('welcome');
    if (wel) wel.remove();
    const bubble = addMessageBubble(role, text);
    scrollToBottom();
    return bubble;
  }

  function addLoading() {
    const wel = shadow.getElementById('welcome');
    if (wel) wel.remove();

    const wrap = document.createElement('div');
    wrap.className = 'msg ai';
    wrap.id = 'loading-msg';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `<div class="dots"><span></span><span></span><span></span></div>`;
    wrap.appendChild(bubble);
    $messages.appendChild(wrap);
    scrollToBottom();
  }

  function removeLoading() {
    const el = shadow.getElementById('loading-msg');
    if (el) el.remove();
  }

  function addError(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ai';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = `<div class="err">${escapeHtml(text)}</div>`;
    wrap.appendChild(bubble);
    $messages.appendChild(wrap);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      $messages.scrollTop = $messages.scrollHeight;
    });
  }

  // ======================== 发送消息 ========================
  async function sendMessage() {
    const text = $input.value.trim();
    if (!text || isStreaming) return;
    $input.value = '';
    autoResize();
    doSend(text);
  }

  // ======================== Markdown 渲染 ========================
  function renderMarkdown(text) {
    if (!text) return '';

    const codeBlocks = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const langLabel = lang
        ? `<span style="position:absolute;top:6px;left:12px;font-size:11px;color:var(--md-outline)">${escapeHtml(lang)}</span>`
        : '';
      codeBlocks.push(
        `<div class="cb-wrap">${langLabel}<button class="copy-btn">复制</button><pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre></div>`
      );
      return `\x00CB${idx}\x00`;
    });

    // ---- KaTeX 数学公式渲染 ----
    const mathBlocks = [];
    if (typeof katex !== 'undefined') {
      // 块级公式 $$...$$ 或 \[...\]
      text = text.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (m, m1, m2) => {
        const math = ((m1 || m2) || '').trim();
        if (!math) return m;
        const idx = mathBlocks.length;
        try {
          mathBlocks.push(katex.renderToString(math, { displayMode: true, throwOnError: false }));
        } catch { mathBlocks.push('<code class="math-fallback">' + escapeHtml(math) + '</code>'); }
        return '\x00MB' + idx + '\x00';
      });
      // 行内公式 \(...\)
      text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
        if (!math.trim()) return _;
        const idx = mathBlocks.length;
        try {
          mathBlocks.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }));
        } catch { mathBlocks.push('<code class="math-fallback">' + escapeHtml(math.trim()) + '</code>'); }
        return '\x00MB' + idx + '\x00';
      });
    }

    const lines = text.split('\n');
    let html = '';
    let inUl = false, inOl = false;

    const closeLists = () => {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
    };

    for (const line of lines) {
      const trimmed = line.trim();

      const cbMatch = trimmed.match(/^\x00CB(\d+)\x00$/);
      if (cbMatch) {
        closeLists();
        html += codeBlocks[parseInt(cbMatch[1])];
        continue;
      }

      // 数学占位行
      const mbMatch = trimmed.match(/^\x00MB(\d+)\x00$/);
      if (mbMatch) {
        closeLists();
        html += mathBlocks[parseInt(mbMatch[1])];
        continue;
      }

      const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        closeLists();
        const level = Math.min(hMatch[1].length, 4);
        html += `<h${level}>${inline(hMatch[2])}</h${level}>`;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeLists();
        html += '<hr style="border:none;border-top:1px solid var(--md-outline-variant);margin:8px 0">';
        continue;
      }

      if (trimmed.startsWith('>')) {
        closeLists();
        html += `<blockquote>${inline(trimmed.slice(1).trim())}</blockquote>`;
        continue;
      }

      if (/^[-*+]\s+/.test(trimmed)) {
        if (!inUl) { if (inOl) { html += '</ol>'; inOl = false; } html += '<ul>'; inUl = true; }
        html += `<li>${inline(trimmed.replace(/^[-*+]\s+/, ''))}</li>`;
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inOl) { if (inUl) { html += '</ul>'; inUl = false; } html += '<ol>'; inOl = true; }
        html += `<li>${inline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`;
        continue;
      }

      if (!trimmed) {
        closeLists();
        continue;
      }

      closeLists();
      html += `<p>${inline(trimmed)}</p>`;
    }
    closeLists();

    html = html.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);
    html = html.replace(/\x00MB(\d+)\x00/g, (_, i) => mathBlocks[parseInt(i) || 0] || '');
    return sanitize(html);
  }

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitize(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript\s*:/gi, '');
  }

  // ======================== 自动答题 ========================

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * 点击页面上的「暂时保存」按钮，防止答案丢失
   */
  function clickSaveButton() {
    try {
      // 优先调用页面 saveWork 函数（不触发 CSP 报错）
      if (typeof window.saveWork === 'function') {
        window.saveWork();
        return true;
      }
      // 备选：查找「暂时保存」链接
      const saveLink = document.querySelector('a[tabindex="0"]');
      if (saveLink && saveLink.textContent.includes('暂时保存')) {
        // 用 dispatchEvent 代替 click，避免 CSP 拦截 href="javascript:;"
        saveLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    } catch { return false; }
  }

  /**
   * 从页面提取所有单选题
   */
  function extractQuestions() {
    const questions = [];
    const qDivs = document.querySelectorAll('.questionLi[typename="单选题"]');
    qDivs.forEach((qDiv, idx) => {
      const qid = qDiv.getAttribute('data');
      // 检查是否已作答（hidden input 有值）
      const answerInput = document.getElementById(`answer${qid}`);
      const answered = answerInput ? !!answerInput.value.trim() : false;

      // 获取题目文本
      const h3 = qDiv.querySelector('.mark_name');
      let questionText = '';
      if (h3) {
        questionText = h3.textContent
          .replace(/^\d+\.\s*/, '')
          .replace(/\(单选题\)/g, '')
          .trim();
      }

      // 获取选项
      const options = [];
      qDiv.querySelectorAll('.answerBg[role="radio"]').forEach(opt => {
        const letterEl = opt.querySelector('.num_option');
        const textEl = opt.querySelector('.answer_p');
        if (letterEl && textEl) {
          const letter = letterEl.getAttribute('data');
          const text = textEl.textContent.trim();
          if (letter && text) {
            options.push({ letter, text });
          }
        }
      });

      if (questionText && options.length > 0) {
        questions.push({
          qnum: idx + 1,
          qid,
          question: questionText,
          options,
          answered
        });
      }
    });
    return questions;
  }

  /**
   * 点击页面上的选项来填写答案
   */
  function fillAnswer(qid, letter) {
    const choiceSpan = document.querySelector(`.choice${qid}[data="${letter}"]`);
    if (choiceSpan) {
      const answerBg = choiceSpan.closest('.answerBg');
      if (answerBg) { answerBg.click(); answerBg.focus(); return true; }
    }
    const answerBg = document.querySelector(`.answerBg[qid="${qid}"] .num_option[data="${letter}"]`);
    if (answerBg) {
      const parent = answerBg.closest('.answerBg');
      if (parent) { parent.click(); parent.focus(); return true; }
    }
    return false;
  }

  /**
   * 滚动到指定题目在页面中的位置
   */
  function scrollToQuestion(qid) {
    const qEl = document.getElementById(`question${qid}`);
    if (qEl) qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * 在消息列表中创建/获取自动答题结果面板（作为特殊气泡）
   */
  function ensureAutoResults(forceNew) {
    if ($autoResults && !forceNew) return $autoResults;
    if ($autoResults) { $autoResults.remove(); $autoResults = null; }

    const wel = shadow.getElementById('welcome');
    if (wel) wel.remove();

    $autoResults = document.createElement('div');
    $autoResults.className = 'auto-results';
    $autoResults.id = 'auto-results';
    $autoResults.innerHTML = `
      <div class="auto-results-head" id="auto-results-head">
        <span class="arr" id="auto-arr">▶</span>
        <span id="auto-results-title">答题结果</span>
        <span style="flex:1"></span>
        <span id="auto-results-summary" style="font-size:12px;color:var(--md-outline)"></span>
      </div>
      <div class="auto-results-body hidden" id="auto-results-body"></div>
    `;
    $messages.appendChild($autoResults);

    shadow.getElementById('auto-results-head').addEventListener('click', () => {
      const body = shadow.getElementById('auto-results-body');
      const arr = shadow.getElementById('auto-arr');
      const hidden = body.classList.toggle('hidden');
      arr.classList.toggle('fold', hidden);
    });

    return $autoResults;
  }

  /**
   * 从保存的数据重建结果面板（切换历史时调用）
   */
  function restoreAutoResultsPanel(data) {
    if (!data || !data.results || data.results.length === 0) return;
    autoAnswerData = data;
    ensureAutoResults(true);
    const title = shadow.getElementById('auto-results-title');
    if (title) title.textContent = `答题结果 (共${data.total}题)`;
    const summary = shadow.getElementById('auto-results-summary');
    const doneCount = data.results.filter(r => r.status === 'done').length;
    if (summary) summary.textContent = `${doneCount}/${data.total} 题`;

    data.results.forEach(r => updateAutoItem(r.qnum, r.status, r));

    // 展开面板
    const body = shadow.getElementById('auto-results-body');
    const arr = shadow.getElementById('auto-arr');
    if (body && body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      arr.classList.remove('fold');
    }
  }

  /**
   * 更新单个题目的显示状态
   */
  function updateAutoItem(qnum, status, data) {
    const body = shadow.getElementById('auto-results-body');
    if (!body) return;

    let item = body.querySelector(`[data-qnum="${qnum}"]`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'auto-item';
      item.setAttribute('data-qnum', qnum);
      item.innerHTML = `<div class="auto-item-num">第${qnum}题</div><div class="auto-item-body"></div>`;
      body.appendChild(item);
    }

    const itemBody = item.querySelector('.auto-item-body');
    if (status === 'loading') {
      itemBody.innerHTML = '<div class="auto-item-loading">正在作答<div class="dots-sm"><span></span><span></span><span></span></div></div>';
    } else if (status === 'done') {
      itemBody.innerHTML = `
        <div class="auto-item-answer">
          <span class="auto-item-letter">${escapeHtml(data.letter)}</span>
          <span class="auto-item-done">已填写 ✓</span>
        </div>
        ${data.reason ? `<div class="auto-item-reason">${escapeHtml(data.reason)}</div>` : ''}
      `;
    } else if (status === 'error') {
      itemBody.innerHTML = `<div class="auto-item-error">${escapeHtml(data.error || '请求失败')}</div>`;
    } else if (status === 'skipped') {
      itemBody.innerHTML = '<div class="auto-item-reason">已作答，跳过</div>';
    }
  }

  /**
   * 更新按钮进度条填充
   */
  function updateButtonProgress(current, total) {
    if ($autoBtnFill) {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      $autoBtnFill.style.width = pct + '%';
    }
  }

  /**
   * 更新按钮文字和状态栏
   */
  function updateAutoStatus(current, total) {
    if (isAutoAnswerPaused) {
      $autoBtnText.innerHTML = '▶ 继续答题';
      $autoStatus.innerHTML = `<span style="color:var(--md-outline)">已暂停 (${current}/${total}) — 点击继续</span>`;
      return;
    }

    if (autoAnswerAbort) {
      $autoBtnText.innerHTML = `${ICON_AUTO}自动答题`;
      $autoStatus.innerHTML = `<span class="done">已结束 (${current}/${total}) ✓</span>`;
      $autoBtn.disabled = false;
      isAutoAnswering = false;
      updateButtonProgress(current, total);
      return;
    }

    if (current >= total) {
      $autoBtnText.innerHTML = `${ICON_AUTO}自动答题`;
      $autoStatus.innerHTML = `<span class="done">全部完成 ✓ (${total}/${total})</span>`;
      $autoBtn.disabled = false;
      isAutoAnswering = false;
      updateButtonProgress(current, total);

      // 更新结果面板
      const summary = shadow.getElementById('auto-results-summary');
      if (summary) {
        const doneCount = shadow.getElementById('auto-results-body')?.querySelectorAll('.auto-item-letter').length || 0;
        summary.textContent = `${doneCount}/${total} 题`;
      }
      // 展开结果面板
      const body = shadow.getElementById('auto-results-body');
      const arr = shadow.getElementById('auto-arr');
      if (body && body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        arr.classList.remove('fold');
      }
      // 自动保存
      clickSaveButton();
    } else {
      $autoBtnText.innerHTML = `${current}/${total}`;
      $autoStatus.textContent = `正在作答: ${current}/${total}`;
      updateButtonProgress(current, total);
    }
  }

  /**
   * 清除所有"正在作答"状态
   */
  function clearAllLoadingItems(statusText) {
    const body = shadow.getElementById('auto-results-body');
    if (!body) return;
    body.querySelectorAll('.auto-item-loading').forEach(el => {
      const item = el.closest('.auto-item');
      if (item) {
        const itemBody = item.querySelector('.auto-item-body');
        if (itemBody) itemBody.innerHTML = `<div class="auto-item-reason">${statusText}</div>`;
      }
    });
  }

  /**
   * 停止自动答题（长按触发）
   */
  function stopAutoAnswer() {
    if (!isAutoAnswering) return;
    autoAnswerAbort = true;
    isAutoAnswerPaused = false;
    clearAllLoadingItems('已取消');
    clickSaveButton();
  }

  /**
   * 主流程：开始自动答题 / 暂停 / 恢复
   * 点击：未开始→开始 | 进行中→暂停 | 暂停中→恢复
   * 长按(800ms)：结束
   */
  async function startAutoAnswer() {
    // === 暂停中 → 恢复 ===
    if (isAutoAnswerPaused) {
      isAutoAnswerPaused = false;
      updateAutoStatus(
        autoAnswerQueue.filter(q => {
          const inp = document.getElementById(`answer${q.qid}`);
          return inp && inp.value.trim();
        }).length + (isAutoAnswering ? 0 : 0),
        autoAnswerQueue.length
      );
      return;
    }

    // === 进行中 → 暂停 ===
    if (isAutoAnswering && !isAutoAnswerPaused) {
      isAutoAnswerPaused = true;
      clearAllLoadingItems('等待继续');
      // 计算已完成的
      let doneCount = 0;
      if (autoAnswerQueue.length > 0) {
        doneCount = autoAnswerQueue.filter(q => {
          const inp = document.getElementById(`answer${q.qid}`);
          return inp && inp.value.trim();
        }).length;
      }
      $autoBtnText.innerHTML = '▶ 继续答题';
      $autoStatus.innerHTML = `<span style="color:var(--md-outline)">已暂停 (${doneCount}/${autoAnswerQueue.length}) — 点击继续</span>`;
      updateButtonProgress(doneCount, autoAnswerQueue.length);
      clickSaveButton();
      return;
    }

    // === 新开始 ===
    if (!isHomework) return;

    const allQuestions = extractQuestions();
    const unanswered = allQuestions.filter(q => !q.answered);

    if (unanswered.length === 0) {
      $autoStatus.textContent = allQuestions.length > 0 ? '所有题目已作答完成' : '未检测到题目';
      return;
    }

    const settings = await chrome.storage.sync.get(['apiKey']);
    if (!settings.apiKey) {
      $autoStatus.textContent = '请先在设置中配置 API Key';
      return;
    }

    isAutoAnswering = true;
    isAutoAnswerPaused = false;
    autoAnswerAbort = false;
    $autoBtn.disabled = false;
    autoAnswerQueue = unanswered;

    // 初始化答题数据
    autoAnswerData = { total: allQuestions.length, results: [] };
    allQuestions.forEach(q => {
      if (q.answered) {
        autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '已作答，跳过', status: 'skipped' });
      }
    });

    ensureAutoResults();
    const totalAll = allQuestions.length;
    const title = shadow.getElementById('auto-results-title');
    if (title) title.textContent = `答题结果 (共${totalAll}题)`;

    // 标记已答题目
    allQuestions.forEach(q => {
      if (q.answered) updateAutoItem(q.qnum, 'skipped');
    });

    let completedCount = allQuestions.filter(q => q.answered).length;

    for (let i = 0; i < unanswered.length; i++) {
      // 检查是否被终止
      if (autoAnswerAbort) {
        saveConversation();
        updateAutoStatus(completedCount, totalAll);
        return;
      }

      // 等待暂停恢复
      while (isAutoAnswerPaused && !autoAnswerAbort) {
        await sleep(300);
      }
      if (autoAnswerAbort) {
        saveConversation();
        updateAutoStatus(completedCount, totalAll);
        return;
      }

      const q = unanswered[i];
      updateAutoItem(q.qnum, 'loading');
      updateAutoStatus(completedCount, totalAll);
      scrollToQuestion(q.qid);

      // 将题目作为用户消息加入聊天上下文（不渲染UI）
      const optionsText = q.options.map(o => `${o.letter}. ${o.text}`).join('\n');
      const questionMsg = `[第${q.qnum}题] ${q.question}\n\n${optionsText}`;
      chatHistory.push({ role: 'user', content: questionMsg, _auto: true });

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'answer-question',
          question: q.question,
          options: q.options
        });

        if (autoAnswerAbort) {
          saveConversation();
          updateAutoStatus(completedCount, totalAll);
          return;
        }
        // API 返回时如果已暂停，等待恢复或终止后再处理结果
        while (isAutoAnswerPaused && !autoAnswerAbort) {
          await sleep(200);
        }
        if (autoAnswerAbort) {
          saveConversation();
          updateAutoStatus(completedCount, totalAll);
          return;
        }

        if (result.letter) {
          const filled = fillAnswer(q.qid, result.letter);
          const reason = (filled ? '' : '⚠ 未找到选项 ') + (result.reason || '');
          updateAutoItem(q.qnum, 'done', { letter: result.letter, reason });
          // 将 AI 回答加入聊天上下文（不渲染UI）
          const answerMsg = `答案: ${result.letter}${result.reason ? '\n\n' + result.reason : ''}`;
          chatHistory.push({ role: 'assistant', content: answerMsg, _auto: true });
          // 记录答题数据供恢复
          autoAnswerData.results.push({ qnum: q.qnum, letter: result.letter, reason, status: 'done' });
        } else if (result.error) {
          updateAutoItem(q.qnum, 'error', { error: result.error });
          chatHistory.push({ role: 'assistant', content: `❌ [第${q.qnum}题] 答题失败: ${result.error}`, _auto: true });
          autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '', status: 'error' });
        } else {
          updateAutoItem(q.qnum, 'error', { error: 'AI 返回格式异常' });
          autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '', status: 'error' });
        }
      } catch (err) {
        updateAutoItem(q.qnum, 'error', { error: err.message });
        autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '', status: 'error' });
      }

      completedCount++;
      // 每 3 题自动保存一次
      if (completedCount % 3 === 0) clickSaveButton();
    }

    // 答题结束，保存对话历史
    saveConversation();
    updateAutoStatus(totalAll, totalAll);
  }

  // ======================== 挂载 ========================
  // 加载历史记录
  loadConversations();
  document.documentElement.appendChild(host);
})();
