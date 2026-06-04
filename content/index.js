// ============================================================
// content/index.js — 主入口：创建 DOM、绑定事件、编排各模块
// ============================================================

(async () => {
  'use strict';

  // 加载 KaTeX CSS
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

  const I = window.AIChatICONS;
  const MD = window.AIChatMD;
  const AA = window.AIChatAutoAnswer;
  const SP = window.AIChatSettings;
  const HP = window.AIChatHistory;

  // ======================== 共享上下文 ========================
  window.__CTX__ = {
    // 状态
    sidebarOpen: false,
    chatHistory: [],
    isStreaming: false,
    currentPort: null,
    fabY: 60,
    dragState: null,
    themePref: 'system',
    colorScheme: 'purple',
    isAutoAnswering: false,
    isAutoAnswerPaused: false,
    autoAnswerAbort: false,
    autoAnswerQueue: [],
    autoAnswerData: null,
    $autoResults: null,
    isHomework: false,
    longPressTimer: null,
    longPressTriggered: false,
    sidebarWidth: 400,
    resizeState: null,
    conversations: [],
    currentConvId: null,
    providers: [],
    currentProviderId: 'openai',
    currentModel: 'gpt-3.5-turbo',
    editingProviderId: 'openai',
    isComposing: false,

    // DOM 引用 (稍后填充)
    host: null, shadow: null,
    fab: null, sidebar: null, resizeHandle: null,
    $messages: null, $input: null, $sendBtn: null,
    $autoBtn: null, $autoStatus: null, $autoRow: null,
    $autoBtnFill: null, $autoBtnText: null,
    $historyPanel: null, $historyList: null,
    $settingsPanel: null,

    // 设置面板 DOM
    $settingsBaseUrl: null, $settingsApiKey: null,
    $settingsSystemPrompt: null, $settingsTheme: null,
    $colorSwatches: null,
    $settingsStatus: null, $settingsProvider: null,
    $settingsCustomNameWrap: null, $settingsCustomName: null,
    $settingsAddModel: null, $settingsModelChips: null,
    $settingsCurrentModel: null,
    $btnAddModel: null, $btnSettingsBack: null,
    $btnSettingsSave: null, $btnSettingsTest: null,
    $btnDeleteProvider: null, $toggleKey: null,

    // 函数引用 (指向模块导出)
    applyTheme: null,
    applyColorScheme: null,
    toggleSidebar: null,
    autoResize: null,
    saveConversation: HP.saveConversation,
    doSend: null,
    sendMessage: null
  };

  const C = window.__CTX__;

  // ======================== 主题 ========================
  const SCHEMES = window.AIChatColorSchemes;

  function getCurrentMode() {
    if (C.themePref === 'dark') return 'dark';
    if (C.themePref === 'light') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyColorScheme(schemeId) {
    const scheme = SCHEMES[schemeId] || SCHEMES.purple;
    const mode = getCurrentMode();
    const tokens = scheme[mode];
    Object.entries(tokens).forEach(([key, value]) => {
      C.host.style.setProperty(key, value);
    });
    // 存储偏好
    chrome.storage.local.set({ colorScheme: schemeId });
  }
  C.applyColorScheme = applyColorScheme;

  function applyTheme(pref) {
    C.host.setAttribute('data-theme', getCurrentMode());
    // 重新应用颜色 (亮/暗切换时)
    applyColorScheme(C.colorScheme);
  }
  C.applyTheme = applyTheme;

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (C.themePref === 'system') {
      applyTheme(C.themePref);
    }
  });

  // 加载主题偏好
  chrome.storage.sync.get('theme', ({ theme }) => {
    C.themePref = theme || 'system';
    applyTheme(C.themePref);
  });
  chrome.storage.local.get('colorScheme', ({ colorScheme }) => {
    C.colorScheme = colorScheme || 'purple';
    // 初始应用 (此时 host 已创建但 data-theme 是初始值)
    C.host.setAttribute('data-theme', getCurrentMode());
    applyColorScheme(C.colorScheme);
  });

  // ======================== 创建 Shadow DOM ========================
  const host = document.createElement('div');
  host.id = 'ai-chat-ext-root';
  const shadow = host.attachShadow({ mode: 'open' });
  host.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

  C.host = host;
  C.shadow = shadow;

  const style = document.createElement('style');
  style.textContent = window.AIChatCSS + (katexCss || '');

  // 悬浮球
  const fab = document.createElement('button');
  fab.id = 'fab';
  fab.innerHTML = I.CHAT;
  fab.title = 'AI 助手';
  fab.style.top = '60%';
  fab.style.transform = 'translateY(-50%)';
  C.fab = fab;

  // 侧边栏 DOM
  const sidebar = document.createElement('div');
  sidebar.id = 'sidebar';
  sidebar.innerHTML =
    '<div id="resize-handle"></div>' +
    '<div class="header">' +
      '<svg class="header-icon" viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>' +
      '<span class="header-title">AI 助手</span>' +
      '<button class="icon-btn" id="btn-history" title="历史记录">' + I.HISTORY + '</button>' +
      '<button class="icon-btn" id="btn-new-chat" title="新建对话">' + I.NEW + '</button>' +
      '<button class="icon-btn" id="btn-settings" title="设置">' + I.SETTINGS + '</button>' +
      '<button class="icon-btn" id="btn-close" title="关闭">' + I.CLOSE + '</button>' +
    '</div>' +
    '<div class="messages" id="messages">' +
      '<div class="welcome" id="welcome">' +
        '<svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>' +
        '<h3>AI 对话助手</h3>' +
        '<p>点击右下角悬浮球开始对话<br>首次使用请先前往设置配置 API</p>' +
      '</div>' +
    '</div>' +
    // 历史面板
    '<div class="history-panel" id="history-panel" style="display:none">' +
      '<div class="history-head">' +
        '<button class="icon-btn" id="btn-history-back" title="返回">' + I.CLOSE + '</button>' +
        '<span class="history-title">历史记录</span>' +
        '<button class="icon-btn" id="btn-history-new" title="新建对话">' + I.NEW + '</button>' +
      '</div>' +
      '<div class="history-list" id="history-list">' +
        '<div class="history-empty">' +
          '<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>' +
          '<span>暂无历史记录</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    // 设置面板
    '<div class="settings-panel" id="settings-panel" style="display:none">' +
      '<div class="settings-head">' +
        '<button class="icon-btn" id="btn-settings-back" title="返回">' + I.CLOSE + '</button>' +
        '<span class="settings-title">设置</span>' +
      '</div>' +
      '<div class="settings-body">' +
        '<div class="settings-section">' +
          '<h3>供应商</h3>' +
          '<div class="field"><select id="settings-provider"></select></div>' +
          '<div class="field" id="settings-custom-name-wrap" style="display:none">' +
            '<label for="settings-custom-name">供应商名称</label>' +
            '<input type="text" id="settings-custom-name" placeholder="输入自定义供应商名称" spellcheck="false">' +
            '<button class="settings-btn delete-provider-btn" id="btn-delete-provider" style="margin-top:8px;width:100%;justify-content:center;color:var(--md-error);border-color:var(--md-error)">删除此供应商</button>' +
          '</div>' +
          '<div class="field">' +
            '<label for="settings-base-url">Base URL</label>' +
            '<input type="text" id="settings-base-url" placeholder="https://api.openai.com/v1" spellcheck="false">' +
          '</div>' +
          '<div class="field">' +
            '<label for="settings-api-key">API Key</label>' +
            '<div class="password-wrap">' +
              '<input type="password" id="settings-api-key" placeholder="sk-..." spellcheck="false">' +
              '<button class="toggle-vis" id="settings-toggle-key" title="显示/隐藏">' +
                '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="field">' +
            '<label>管理模型</label>' +
            '<div class="model-add-row">' +
              '<input type="text" id="settings-add-model" placeholder="输入模型名称" spellcheck="false">' +
              '<button class="model-add-btn" id="btn-add-model" title="添加模型">+</button>' +
            '</div>' +
            '<div class="model-chips" id="settings-model-chips"></div>' +
            '<p class="settings-hint-sm">点击模型标签可删除</p>' +
          '</div>' +
          '<button class="settings-btn primary" id="btn-settings-save" style="width:100%;justify-content:center;margin-top:8px">' +
            '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' +
            '保存供应商' +
          '</button>' +
        '</div>' +
        '<div class="settings-section">' +
          '<h3>模型选择</h3>' +
          // '<p class="settings-hint-sm">列出所有已填写 API Key 的供应商的模型</p>' +
          '<div class="field"><select id="settings-current-model"></select></div>' +
          '<div class="field">' +
            '<label for="settings-system-prompt">系统提示词</label>' +
            '<textarea id="settings-system-prompt" rows="3" placeholder="你是一个有帮助的AI助手。"></textarea>' +
            // '<p class="settings-hint-sm">修改后自动保存</p>' +
          '</div>' +
          '<div class="settings-actions">' +
            '<button class="settings-btn outline" id="btn-settings-test">' +
              '<svg viewBox="0 0 24 24"><path d="M13 3v2h-2V3H9v2H7v2h2v2H7v2h2v2H7v2h2v2h2v-2h2v2h2v-2h2v-2h-2v-2h2V9h2V7h-2V5h-2v2h-2V5h-2zm-2 8h2v2h-2v-2z"/></svg>' +
              '测试连接' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<h3>主题</h3>' +
          '<div class="field">' +
            '<select id="settings-theme">' +
              '<option value="system">跟随系统</option>' +
              '<option value="light">浅色</option>' +
              '<option value="dark">深色</option>' +
            '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label>主题颜色</label>' +
            '<div class="color-swatches" id="color-swatches"></div>' +
          '</div>' +
        '</div>' +
        '<div class="settings-status" id="settings-status"></div>' +
      '</div>' +
    '</div>' +
    // 自动答题行
    '<div class="auto-row" id="auto-row" style="display:none">' +
      '<button class="auto-btn" id="btn-auto" title="自动答题">' +
        '<div class="auto-btn-fill" id="auto-btn-fill" style="width:0%"></div>' +
        '<span class="auto-btn-text" id="auto-btn-text">' + I.AUTO + '自动答题</span>' +
      '</button>' +
      '<span class="auto-status" id="auto-status"></span>' +
    '</div>' +
    '<div class="input-area" id="input-area">' +
      '<div class="input-wrap">' +
        '<textarea id="input" placeholder="输入消息… (Enter 发送, Shift+Enter 换行)" rows="1"></textarea>' +
      '</div>' +
      '<button class="send-btn" id="btn-send" title="发送">' + I.SEND + '</button>' +
    '</div>';
  C.sidebar = sidebar;

  shadow.appendChild(style);
  shadow.appendChild(fab);
  shadow.appendChild(sidebar);

  // ======================== 获取 DOM 引用 ========================
  C.$messages = shadow.getElementById('messages');
  C.$input = shadow.getElementById('input');
  C.$sendBtn = shadow.getElementById('btn-send');
  C.$autoBtn = shadow.getElementById('btn-auto');
  C.$autoStatus = shadow.getElementById('auto-status');
  C.$autoRow = shadow.getElementById('auto-row');
  C.$autoBtnFill = shadow.getElementById('auto-btn-fill');
  C.$autoBtnText = shadow.getElementById('auto-btn-text');
  C.$historyPanel = shadow.getElementById('history-panel');
  C.$historyList = shadow.getElementById('history-list');
  C.$settingsPanel = shadow.getElementById('settings-panel');

  // 设置面板 DOM
  C.$settingsProvider = shadow.getElementById('settings-provider');
  C.$settingsCustomNameWrap = shadow.getElementById('settings-custom-name-wrap');
  C.$settingsCustomName = shadow.getElementById('settings-custom-name');
  C.$settingsBaseUrl = shadow.getElementById('settings-base-url');
  C.$settingsApiKey = shadow.getElementById('settings-api-key');
  C.$settingsModelChips = shadow.getElementById('settings-model-chips');
  C.$settingsCurrentModel = shadow.getElementById('settings-current-model');
  C.$settingsAddModel = shadow.getElementById('settings-add-model');
  C.$settingsSystemPrompt = shadow.getElementById('settings-system-prompt');
  C.$settingsTheme = shadow.getElementById('settings-theme');
  C.$colorSwatches = shadow.getElementById('color-swatches');
  C.$settingsStatus = shadow.getElementById('settings-status');
  C.$btnAddModel = shadow.getElementById('btn-add-model');
  C.$btnSettingsBack = shadow.getElementById('btn-settings-back');
  C.$btnSettingsSave = shadow.getElementById('btn-settings-save');
  C.$btnSettingsTest = shadow.getElementById('btn-settings-test');
  C.$btnDeleteProvider = shadow.getElementById('btn-delete-provider');
  C.$toggleKey = shadow.getElementById('settings-toggle-key');

  // ======================== 侧边栏宽度 ========================
  chrome.storage.sync.get('sidebarWidth', ({ sidebarWidth: sw }) => {
    if (sw && sw >= 320) {
      C.sidebarWidth = sw;
      sidebar.style.width = sw + 'px';
      if (C.sidebarOpen) fab.style.right = (sw + 12) + 'px';
    }
  });

  // 拖拽调整侧边栏宽度
  const resizeHandle = shadow.getElementById('resize-handle');
  C.resizeHandle = resizeHandle;

  resizeHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    C.resizeState = { startX: e.clientX, startWidth: C.sidebarWidth };
    resizeHandle.classList.add('resizing');
    resizeHandle.setPointerCapture(e.pointerId);
    sidebar.style.transition = 'none';
  });
  resizeHandle.addEventListener('pointermove', (e) => {
    if (!C.resizeState) return;
    const dx = C.resizeState.startX - e.clientX;
    let newWidth = Math.round(C.resizeState.startWidth + dx);
    newWidth = Math.max(300, Math.min(window.innerWidth * 0.7, newWidth));
    C.sidebarWidth = newWidth;
    sidebar.style.width = newWidth + 'px';
    if (C.sidebarOpen) fab.style.right = (newWidth + 12) + 'px';
  });
  resizeHandle.addEventListener('pointerup', () => {
    if (!C.resizeState) return;
    resizeHandle.classList.remove('resizing');
    C.resizeState = null;
    sidebar.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
    chrome.storage.sync.set({ sidebarWidth: C.sidebarWidth });
  });
  resizeHandle.addEventListener('pointerleave', () => {
    if (C.resizeState) {
      resizeHandle.classList.remove('resizing');
      C.resizeState = null;
      sidebar.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
      chrome.storage.sync.set({ sidebarWidth: C.sidebarWidth });
    }
  });

  // ======================== 侧边栏控制 ========================
  function toggleSidebar(force) {
    C.sidebarOpen = typeof force === 'boolean' ? force : !C.sidebarOpen;
    sidebar.classList.toggle('open', C.sidebarOpen);
    fab.classList.toggle('open', C.sidebarOpen);
    if (C.sidebarOpen) {
      fab.style.right = (C.sidebarWidth + 12) + 'px';
      C.isHomework = !!document.querySelector('.questionLi[typename="单选题"]');
      C.$autoRow.style.display = C.isHomework ? 'flex' : 'none';
      if (C.isHomework) C.$autoStatus.textContent = '';
      setTimeout(() => C.$input.focus(), 320);
    } else {
      fab.style.right = '';
    }
  }
  C.toggleSidebar = toggleSidebar;

  function autoResize() {
    C.$input.style.height = 'auto';
    C.$input.style.height = Math.min(C.$input.scrollHeight, 120) + 'px';
    C.$sendBtn.disabled = !C.$input.value.trim() || C.isStreaming;
  }
  C.autoResize = autoResize;

  // ======================== 发送消息 ========================
  function doSend(text) {
    if (!text || C.isStreaming) return;
    HP.addMessage('user', text);
    C.chatHistory.push({ role: 'user', content: text });
    C.isStreaming = true;
    C.$sendBtn.disabled = true;
    HP.addLoading();

    C.currentPort = chrome.runtime.connect({ name: 'ai-chat' });
    let aiBubble = null;
    let fullText = '';

    C.currentPort.onMessage.addListener((msg) => {
      if (msg.type === 'chunk') {
        if (!aiBubble) {
          HP.removeLoading();
          aiBubble = HP.addMessage('ai', '');
        }
        fullText += msg.content;
        aiBubble.innerHTML = MD.renderMarkdown(fullText) + '<span class="cursor-blink"></span>';
        HP.scrollToBottom();
      } else if (msg.type === 'error') {
        HP.removeLoading();
        HP.addError(msg.content);
        HP.saveConversation();
        C.isStreaming = false;
        C.currentPort = null;
        C.$sendBtn.disabled = !C.$input.value.trim();
      } else if (msg.type === 'done') {
        HP.removeLoading();
        if (aiBubble) {
          aiBubble.innerHTML = MD.renderMarkdown(fullText);
        }
        if (fullText) {
          C.chatHistory.push({ role: 'assistant', content: fullText });
          HP.saveConversation();
        }
        C.isStreaming = false;
        C.currentPort = null;
        C.$sendBtn.disabled = !C.$input.value.trim();
      }
    });

    C.currentPort.onDisconnect.addListener(() => {
      HP.removeLoading();
      if (C.isStreaming) {
        if (aiBubble) {
          aiBubble.innerHTML = MD.renderMarkdown(fullText);
        }
        if (fullText) {
          C.chatHistory.push({ role: 'assistant', content: fullText });
          HP.saveConversation();
        }
        C.isStreaming = false;
        C.currentPort = null;
        C.$sendBtn.disabled = !C.$input.value.trim();
      }
    });

    C.currentPort.postMessage({ type: 'init', history: C.chatHistory.slice() });
  }
  C.doSend = doSend;

  async function sendMessage() {
    const text = C.$input.value.trim();
    if (!text || C.isStreaming) return;
    C.$input.value = '';
    autoResize();
    doSend(text);
  }
  C.sendMessage = sendMessage;

  // ======================== 事件绑定 ========================

  // -- 悬浮球拖拽 + 点击 --
  fab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    C.dragState = { startY: e.clientY, startPct: C.fabY, moved: false };
    fab.style.transition = 'box-shadow .2s, border-radius .2s';
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener('pointermove', (e) => {
    if (!C.dragState) return;
    const dy = e.clientY - C.dragState.startY;
    if (Math.abs(dy) > 4) C.dragState.moved = true;
    if (C.dragState.moved) {
      const vh = window.innerHeight;
      const newPct = C.dragState.startPct + (dy / vh) * 100;
      C.fabY = Math.max(8, Math.min(92, newPct));
      fab.style.top = C.fabY + '%';
    }
  });
  fab.addEventListener('pointerup', () => {
    if (!C.dragState) return;
    fab.style.transition = 'right .3s cubic-bezier(.4,0,.2,1), box-shadow .2s, border-radius .2s';
    if (!C.dragState.moved) toggleSidebar();
    C.dragState = null;
  });

  // -- 侧边栏按钮 --
  shadow.getElementById('btn-close').addEventListener('click', () => toggleSidebar(false));
  shadow.getElementById('btn-settings').addEventListener('click', SP.openSettingsPanel);

  // -- 输入框 --
  C.$input.addEventListener('compositionstart', () => { C.isComposing = true; });
  C.$input.addEventListener('compositionend', () => { C.isComposing = false; });

  window.addEventListener('keydown', (e) => {
    if (!e.composedPath().includes(C.$input)) return;
    if (C.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sendMessage();
    }
  }, true);
  C.$input.addEventListener('input', autoResize);
  C.$sendBtn.addEventListener('click', sendMessage);

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

  // -- 模块事件绑定 --
  HP.bindEvents();
  SP.bindEvents();
  AA.bindEvents();

  // ======================== 挂载 ========================
  await HP.loadConversations();
  document.documentElement.appendChild(host);

})();
