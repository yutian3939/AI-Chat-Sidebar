// ============================================================
// content.js - 注入页面的悬浮球 + 侧边栏 AI 对话窗口
// 使用 Shadow DOM 隔离样式，遵循 Material Design 3
// ============================================================

(() => {
  'use strict';

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
      right: 16px;
      width: 56px;
      height: 56px;
      border-radius: 16px;
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
    #fab:active { border-radius: 20px; }
    #fab svg { width: 28px; height: 28px; fill: currentColor; pointer-events: none; }
    #fab.open { right: 416px; }

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
  `;

  // ======================== 状态 ========================
  let sidebarOpen = false;
  let chatHistory = [];
  let isStreaming = false;
  let currentPort = null;
  let fabY = 60;
  let dragState = null;
  let themePref = 'system';

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
    <div class="header">
      <svg class="header-icon" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>
      <span class="header-title">AI 助手</span>
      <button class="icon-btn" id="btn-clear" title="清空对话">${ICON_CLEAR}</button>
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
    <div class="input-area">
      <div class="input-wrap">
        <textarea id="input" placeholder="输入消息… (Enter 发送, Shift+Enter 换行)" rows="1"></textarea>
      </div>
      <button class="send-btn" id="btn-send" title="发送">${ICON_SEND}</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(fab);
  shadow.appendChild(sidebar);

  // 快捷引用
  const $messages = shadow.getElementById('messages');
  const $input = shadow.getElementById('input');
  const $sendBtn = shadow.getElementById('btn-send');

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

  // ✅ 修复：通过消息让 background 打开设置页，兼容所有上下文
  shadow.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-settings' });
  });

  shadow.getElementById('btn-clear').addEventListener('click', clearChat);

  // -- 输入框 --
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $input.addEventListener('input', autoResize);
  $sendBtn.addEventListener('click', sendMessage);

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
      setTimeout(() => $input.focus(), 320);
    }
  }

  function autoResize() {
    $input.style.height = 'auto';
    $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
    $sendBtn.disabled = !$input.value.trim() && !isStreaming;
  }

  // ======================== 聊天功能 ========================
  function clearChat() {
    chatHistory = [];
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

  function timeStr() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(role, text) {
    const wel = shadow.getElementById('welcome');
    if (wel) wel.remove();

    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.appendChild(bubble);
    const ts = document.createElement('div');
    ts.className = 'ts';
    ts.textContent = timeStr();
    wrap.appendChild(ts);

    if (role === 'user') {
      bubble.textContent = text;
    } else {
      bubble.innerHTML = renderMarkdown(text);
    }
    $messages.appendChild(wrap);
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

    addMessage('user', text);
    chatHistory.push({ role: 'user', content: text });
    $input.value = '';
    autoResize();

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
      } else if (msg.type === 'done') {
        removeLoading();
        if (aiBubble) {
          aiBubble.innerHTML = renderMarkdown(fullText);
        }
        if (fullText) {
          chatHistory.push({ role: 'assistant', content: fullText });
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
        isStreaming = false;
        currentPort = null;
        $sendBtn.disabled = !$input.value.trim();
      }
    });

    currentPort.postMessage({ type: 'init', history: [...chatHistory] });
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

  // ======================== 挂载 ========================
  document.documentElement.appendChild(host);
})();
