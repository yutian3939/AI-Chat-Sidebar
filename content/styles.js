// ============================================================
// content/styles.js — MD3 主题 CSS 常量
// ============================================================
'use strict';
window.AIChatCSS = `
    :host {
      --md-elevation1: 0 1px 3px 1px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.3);
      --md-elevation2: 0 2px 6px 2px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.3);
      --md-elevation3: 0 4px 8px 3px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.3);
      /* MD3 color tokens applied dynamically via applyColorScheme() */
      all: initial;
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

    /* ---- 上方按钮行 (加号) ---- */
    .top-row {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 16px 4px;
      background: var(--md-surface-container-low);
    }
    .attach-btn {
      width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid var(--md-outline-variant);
      background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--md-on-surface-variant); flex-shrink: 0;
      transition: background .2s, border-color .2s, color .2s;
      font-size: 20px; font-weight: 300;
    }
    .attach-btn:hover { background: var(--md-surface-container-high); border-color: var(--md-primary); color: var(--md-primary); }
    .attach-btn svg { pointer-events: none; width: 18px; height: 18px; }

    /* 附件列表 (在 top-row 内联显示) */
    .attachments-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .attach-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--md-surface-container);
      border: 1px solid var(--md-outline-variant);
      border-radius: 8px; padding: 2px 8px 2px 2px;
      font-size: 12px; max-width: 160px;
    }
    .attach-thumb { width: 24px; height: 24px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
    .attach-icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; }
    .attach-name { color: var(--md-on-surface); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .attach-remove {
      width: 18px; height: 18px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: var(--md-outline);
      font-size: 11px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: color .15s;
    }
    .attach-remove:hover { color: var(--md-error); }

    /* 消息气泡内图片缩略图 */
    .attach-inline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .attach-inline-thumb { max-width: 120px; max-height: 80px; border-radius: 8px; object-fit: cover; }

    /* 拖拽文件高亮 */
    #sidebar.drag-over::after {
      content: '松手添加文件';
      position: absolute; inset: 0; z-index: 99;
      display: flex; align-items: center; justify-content: center;
      background: rgba(103,80,164,.12);
      backdrop-filter: blur(2px);
      font-size: 18px; font-weight: 600; color: var(--md-primary);
      border: 3px dashed var(--md-primary);
      pointer-events: none;
    }

    /* 历史记录中的附件标签 */
    .attach-hist { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .attach-hist-chip {
      display: inline-block; padding: 2px 8px; border-radius: 6px;
      background: var(--md-surface-container);
      font-size: 11px; color: var(--md-on-surface-variant);
      border: 1px solid var(--md-outline-variant);
    }

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
      font-size: 20px; font-weight: 600; color: var(--md-on-surface); margin-bottom: 4px;
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
    .model-add-row {
      display: flex; gap: 8px; margin-bottom: 10px;
    }
    .model-add-row input {
      flex: 1; min-width: 0;
    }
    .model-add-btn {
      width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
      border: 1px solid var(--md-outline); background: var(--md-surface-container-high);
      color: var(--md-primary); cursor: pointer; font-size: 20px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s;
    }
    .model-add-btn:hover { background: var(--md-primary-container); }
    .model-chips {
      display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;
    }
    .model-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 16px;
      background: var(--md-primary-container); color: var(--md-on-primary-container);
      font-size: 12px; cursor: pointer; font-family: inherit;
      border: 1px solid transparent; transition: all .2s;
    }
    .model-chip:hover { border-color: var(--md-error); }
    .model-chip .del {
      font-size: 14px; font-weight: 700; opacity: 0; transition: opacity .15s;
      margin-left: 2px;
    }
    .model-chip:hover .del { opacity: 1; color: var(--md-error); }
    .model-chip.active {
      background: var(--md-primary); color: var(--md-on-primary);
    }
    .settings-hint-sm {
      font-size: 11px; color: var(--md-on-surface-variant); margin-bottom: 0; line-height: 1.5;
    }

    /* ---- MD3 开关 (Switch) ---- */
    .switch-row {
      display: flex; align-items: center;
      padding-top: 6px; min-height: 44px; cursor: pointer; user-select: none;
      -webkit-user-select: none;
    }
    .switch-label {
      font-size: 14px; color: var(--md-on-surface); line-height: 1.3;
    }
    .switch-track {
      position: relative; display: inline-block; width: 48px; height: 28px; flex-shrink: 0;
      vertical-align: middle; margin-left: 24px;
    }
    .switch-track input {
      position: absolute; inset: 0; opacity: 0; margin: 0; z-index: 2; cursor: pointer;
    }
    .switch-track-bg {
      position: absolute; inset: 0; border-radius: 14px;
      background: var(--md-surface-container-highest, #E6E0E9);
      border: 2px solid var(--md-outline);
      transition: background .2s, border-color .2s;
    }
    .switch-track input:checked ~ .switch-track-bg {
      background: var(--md-primary); border-color: var(--md-primary);
    }
    .switch-thumb {
      position: absolute; top: 4px; left: 4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--md-outline);
      transition: transform .2s cubic-bezier(.4,0,.2,1), background .2s;
      box-shadow: 0 1px 3px rgba(0,0,0,.25);
    }
    .switch-track input:checked ~ .switch-thumb {
      transform: translateX(20px);
      background: var(--md-on-primary);
    }
    .settings-body .field { margin-bottom: 12px; }
    .settings-body .field:last-child { margin-bottom: 0; }
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

    /* 测试按钮旁的内联状态 */
    .test-inline-status {
      display: inline-flex; align-items: center; margin-left: 10px; font-size: 13px; height: 38px;
      animation: fadeUp .2s ease;
    }
    .test-inline-status.success { color: #2E7D32; }
    :host([data-theme="dark"]) .test-inline-status.success { color: #81C784; }
    .test-inline-status.error { color: var(--md-error); }

    /* ---- 主题颜色选择器 ---- */
    .color-swatches { display: flex; gap: 10px; flex-wrap: wrap; }
    .color-swatch {
      width: 36px; height: 36px; border-radius: 50%;
      border: 3px solid var(--md-outline-variant);
      cursor: pointer; position: relative;
      transition: transform .2s, border-color .2s, box-shadow .2s;
    }
    .color-swatch:hover { transform: scale(1.15); border-color: var(--md-outline); }
    .color-swatch.active {
      border-color: var(--md-on-surface);
      box-shadow: 0 0 0 2px var(--md-primary);
    }
    .color-swatch::after {
      content: ''; position: absolute; inset: 0; border-radius: 50%;
      background: conic-gradient(var(--swatch-start) 0deg 180deg, var(--swatch-end) 180deg 360deg);
    }

    @keyframes spin { to { transform: rotate(360deg); } }
`;

// ============================================================
// MD3 配色方案 — 6 套主题，含亮色 + 暗色 token
// 基于 Material Design 3 Tonal Palette 生成
// ============================================================
window.AIChatColorSchemes = {
  purple: {
    name: '默认 (紫)',
    seed: '#6750A4',
    light: {
      '--md-primary': '#6750A4',
      '--md-on-primary': '#FFFFFF',
      '--md-primary-container': '#EADDFF',
      '--md-on-primary-container': '#21005D',
      '--md-secondary-container': '#E8DEF8',
      '--md-on-secondary-container': '#1D192B',
      '--md-surface': '#FEF7FF',
      '--md-surface-dim': '#DED8E1',
      '--md-surface-container-lowest': '#FFFFFF',
      '--md-surface-container-low': '#F7F2FA',
      '--md-surface-container': '#F3EDF7',
      '--md-surface-container-high': '#ECE6F0',
      '--md-on-surface': '#1D1B20',
      '--md-on-surface-variant': '#49454F',
      '--md-outline': '#79747E',
      '--md-outline-variant': '#CAC4D0',
      '--md-error': '#B3261E'
    },
    dark: {
      '--md-primary': '#D0BCFF',
      '--md-on-primary': '#381E72',
      '--md-primary-container': '#4F378B',
      '--md-on-primary-container': '#EADDFF',
      '--md-secondary-container': '#4A4458',
      '--md-on-secondary-container': '#E8DEF8',
      '--md-surface': '#141218',
      '--md-surface-dim': '#141218',
      '--md-surface-container-lowest': '#0F0D13',
      '--md-surface-container-low': '#1D1B20',
      '--md-surface-container': '#211F26',
      '--md-surface-container-high': '#2B2930',
      '--md-on-surface': '#E6E0E9',
      '--md-on-surface-variant': '#CAC4D0',
      '--md-outline': '#938F99',
      '--md-outline-variant': '#49454F',
      '--md-error': '#F2B8B5'
    }
  },
  blue: {
    name: '海蓝',
    seed: '#43658B',
    light: {
      '--md-primary': '#3C6090',
      '--md-on-primary': '#FFFFFF',
      '--md-primary-container': '#D5E3FF',
      '--md-on-primary-container': '#001C3A',
      '--md-secondary-container': '#DAE2F9',
      '--md-on-secondary-container': '#131C2B',
      '--md-surface': '#F9F9FF',
      '--md-surface-dim': '#D9DAE0',
      '--md-surface-container-lowest': '#FFFFFF',
      '--md-surface-container-low': '#F3F3F9',
      '--md-surface-container': '#EDEEF4',
      '--md-surface-container-high': '#E7E8EE',
      '--md-on-surface': '#1A1C20',
      '--md-on-surface-variant': '#43474E',
      '--md-outline': '#73777F',
      '--md-outline-variant': '#C3C6CF',
      '--md-error': '#BA1A1A'
    },
    dark: {
      '--md-primary': '#A6C8FF',
      '--md-on-primary': '#00315E',
      '--md-primary-container': '#214876',
      '--md-on-primary-container': '#D5E3FF',
      '--md-secondary-container': '#3F4858',
      '--md-on-secondary-container': '#DAE2F9',
      '--md-surface': '#111318',
      '--md-surface-dim': '#111318',
      '--md-surface-container-lowest': '#0C0E13',
      '--md-surface-container-low': '#1A1C20',
      '--md-surface-container': '#1E2024',
      '--md-surface-container-high': '#282A2F',
      '--md-on-surface': '#E2E2E9',
      '--md-on-surface-variant': '#C3C6CF',
      '--md-outline': '#8D9199',
      '--md-outline-variant': '#43474E',
      '--md-error': '#FFB4AB'
    }
  },
  teal: {
    name: '青碧',
    seed: '#006A68',
    light: {
      '--md-primary': '#006A68',
      '--md-on-primary': '#FFFFFF',
      '--md-primary-container': '#6FF7F5',
      '--md-on-primary-container': '#002020',
      '--md-secondary-container': '#CCEDEC',
      '--md-on-secondary-container': '#041F1E',
      '--md-surface': '#F8FDFC',
      '--md-surface-dim': '#D8DDDC',
      '--md-surface-container-lowest': '#FFFFFF',
      '--md-surface-container-low': '#F2F7F6',
      '--md-surface-container': '#ECF1F0',
      '--md-surface-container-high': '#E7ECEA',
      '--md-on-surface': '#191C1C',
      '--md-on-surface-variant': '#3F4948',
      '--md-outline': '#6F7978',
      '--md-outline-variant': '#BEC9C7',
      '--md-error': '#BA1A1A'
    },
    dark: {
      '--md-primary': '#4DDAD8',
      '--md-on-primary': '#003736',
      '--md-primary-container': '#00504F',
      '--md-on-primary-container': '#6FF7F5',
      '--md-secondary-container': '#3B4B4B',
      '--md-on-secondary-container': '#CCEDEC',
      '--md-surface': '#0E1413',
      '--md-surface-dim': '#0E1413',
      '--md-surface-container-lowest': '#090F0E',
      '--md-surface-container-low': '#171C1B',
      '--md-surface-container': '#1B201F',
      '--md-surface-container-high': '#252A29',
      '--md-on-surface': '#E0E3E2',
      '--md-on-surface-variant': '#BEC9C7',
      '--md-outline': '#899391',
      '--md-outline-variant': '#3F4948',
      '--md-error': '#FFB4AB'
    }
  },
  sakura: {
    name: '樱粉',
    seed: '#984061',
    light: {
      '--md-primary': '#984061',
      '--md-on-primary': '#FFFFFF',
      '--md-primary-container': '#FFD9E2',
      '--md-on-primary-container': '#3E001D',
      '--md-secondary-container': '#F0DEE4',
      '--md-on-secondary-container': '#2B151C',
      '--md-surface': '#FFF8F8',
      '--md-surface-dim': '#E3D7D9',
      '--md-surface-container-lowest': '#FFFFFF',
      '--md-surface-container-low': '#FEF1F2',
      '--md-surface-container': '#F8EBEC',
      '--md-surface-container-high': '#F2E5E6',
      '--md-on-surface': '#201A1B',
      '--md-on-surface-variant': '#514346',
      '--md-outline': '#837376',
      '--md-outline-variant': '#D5C2C5',
      '--md-error': '#BA1A1A'
    },
    dark: {
      '--md-primary': '#FFB0C8',
      '--md-on-primary': '#5E112F',
      '--md-primary-container': '#7B2947',
      '--md-on-primary-container': '#FFD9E2',
      '--md-secondary-container': '#4A353A',
      '--md-on-secondary-container': '#F0DEE4',
      '--md-surface': '#141212',
      '--md-surface-dim': '#141212',
      '--md-surface-container-lowest': '#0F0D0D',
      '--md-surface-container-low': '#1D1A1A',
      '--md-surface-container': '#211E1E',
      '--md-surface-container-high': '#2B2828',
      '--md-on-surface': '#ECE0E0',
      '--md-on-surface-variant': '#D5C2C5',
      '--md-outline': '#9E8C90',
      '--md-outline-variant': '#514346',
      '--md-error': '#FFB4AB'
    }
  },
  olive: {
    name: '松绿',
    seed: '#3D6B3D',
    light: {
      '--md-primary': '#3D6B3D',
      '--md-on-primary': '#FFFFFF',
      '--md-primary-container': '#BEF3B9',
      '--md-on-primary-container': '#002104',
      '--md-secondary-container': '#CFE5CC',
      '--md-on-secondary-container': '#0B1F0D',
      '--md-surface': '#F7FBF2',
      '--md-surface-dim': '#D8DBD4',
      '--md-surface-container-lowest': '#FFFFFF',
      '--md-surface-container-low': '#F1F5ED',
      '--md-surface-container': '#EBEFE7',
      '--md-surface-container-high': '#E6EAE2',
      '--md-on-surface': '#1A1C19',
      '--md-on-surface-variant': '#43483F',
      '--md-outline': '#73786F',
      '--md-outline-variant': '#C3C8BD',
      '--md-error': '#BA1A1A'
    },
    dark: {
      '--md-primary': '#A2D69D',
      '--md-on-primary': '#0D390F',
      '--md-primary-container': '#265226',
      '--md-on-primary-container': '#BEF3B9',
      '--md-secondary-container': '#3A4B38',
      '--md-on-secondary-container': '#CFE5CC',
      '--md-surface': '#11140F',
      '--md-surface-dim': '#11140F',
      '--md-surface-container-lowest': '#0C0F0A',
      '--md-surface-container-low': '#1A1C17',
      '--md-surface-container': '#1E201B',
      '--md-surface-container-high': '#282B25',
      '--md-on-surface': '#E1E4DC',
      '--md-on-surface-variant': '#C3C8BD',
      '--md-outline': '#8D9387',
      '--md-outline-variant': '#43483F',
      '--md-error': '#FFB4AB'
    }
  },
  amber: {
    name: '暖橙',
    seed: '#8A5024',
    light: {
      '--md-primary': '#8A5024',
      '--md-on-primary': '#FFFFFF',
      '--md-primary-container': '#FFDCC2',
      '--md-on-primary-container': '#2F1500',
      '--md-secondary-container': '#F2DFD1',
      '--md-on-secondary-container': '#28160B',
      '--md-surface': '#FFF8F6',
      '--md-surface-dim': '#E4D7D2',
      '--md-surface-container-lowest': '#FFFFFF',
      '--md-surface-container-low': '#FEF1EB',
      '--md-surface-container': '#F8EBE5',
      '--md-surface-container-high': '#F3E6DF',
      '--md-on-surface': '#211A17',
      '--md-on-surface-variant': '#52443C',
      '--md-outline': '#84746B',
      '--md-outline-variant': '#D6C3B8',
      '--md-error': '#BA1A1A'
    },
    dark: {
      '--md-primary': '#FFB77C',
      '--md-on-primary': '#4E2600',
      '--md-primary-container': '#6E3A10',
      '--md-on-primary-container': '#FFDCC2',
      '--md-secondary-container': '#4E4037',
      '--md-on-secondary-container': '#F2DFD1',
      '--md-surface': '#15120F',
      '--md-surface-dim': '#15120F',
      '--md-surface-container-lowest': '#100D0A',
      '--md-surface-container-low': '#1D1A17',
      '--md-surface-container': '#221E1B',
      '--md-surface-container-high': '#2C2925',
      '--md-on-surface': '#EDE0D9',
      '--md-on-surface-variant': '#D6C3B8',
      '--md-outline': '#9F8E83',
      '--md-outline-variant': '#52443C',
      '--md-error': '#FFB4AB'
    }
  }
};
