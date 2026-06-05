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
  const SS = window.AIChatScreenshot;
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

    // 视觉模型 + 附件
    visionMode: 'none',
    visionModelProvider: 'openai',
    visionModel: '',
    attachedFiles: [],
    skipAnswered: true,

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
    $settingsVisionMode: null, $visionModelFields: null,
    $settingsVisionModel: null, $settingsVisionPrompt: null,
    $btnVisionTest: null,
    $settingsSkipAnswered: null,
    $attachmentsList: null,
    $btnAttach: null, $btnScreenshot: null,
    $settingsQuickShot: null, $fileInput: null,
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
  chrome.storage.local.get(['colorScheme', 'visionMode', 'visionModelProvider', 'visionModel', 'skipAnswered'], (data) => {
    C.colorScheme = data.colorScheme || 'purple';
    C.visionMode = data.visionMode || 'none';
    C.visionModelProvider = data.visionModelProvider || 'openai';
    C.visionModel = data.visionModel || '';
    C.skipAnswered = data.skipAnswered !== false;
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
  sidebar.innerHTML = window.AIChatTemplate(I);
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
  C.$settingsVisionMode = shadow.getElementById('settings-vision-mode');
  C.$visionModelFields = shadow.getElementById('vision-model-fields');
  C.$settingsVisionModel = shadow.getElementById('settings-vision-model');
  C.$settingsVisionPrompt = shadow.getElementById('settings-vision-prompt');
  C.$btnVisionTest = shadow.getElementById('btn-vision-test');
  C.$settingsSkipAnswered = shadow.getElementById('settings-skip-answered');
  C.$attachmentsList = shadow.getElementById('attachments-list');
  C.$btnAttach = shadow.getElementById('btn-attach');
  C.$btnScreenshot = shadow.getElementById('btn-screenshot');
  C.$settingsQuickShot = shadow.getElementById('settings-quick-shot');
  C.$fileInput = shadow.getElementById('file-input');

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
    C.$sendBtn.disabled = (!C.$input.value.trim() && C.attachedFiles.length === 0) || C.isStreaming;
  }
  C.autoResize = autoResize;
  C.renderAttachments = renderAttachments;

  // ======================== 发送消息 ========================
  async function doSend(text) {
    if ((!text && C.attachedFiles.length === 0) || C.isStreaming) return;

    // 构建包含附件的用户消息
    let fullUserText = text || '';
    const files = C.attachedFiles.slice();
    const images = [];
    if (files.length > 0) {
      const parts = [];
      files.forEach(f => {
        if (f.type.startsWith('image/')) {
          images.push({ dataUrl: f.dataUrl });
          // 多模态时图片以 vision_url 发送，文字标注可选
          if (C.visionMode !== 'main') {
            parts.push('[图片: ' + f.name + ']');
          }
        } else {
          // 文件内容通过 _attachments[].text 传给 AI，气泡只显示附件标签
        }
      });
      if (parts.length > 0) {
        fullUserText = parts.join('\n\n') + (text ? '\n\n---\n' + text : '');
      }
      if (images.length > 0 && !text) {
        fullUserText = '📷 ' + files.filter(f => f.type.startsWith('image/')).map(f => f.name).join(', ');
      } else if (files.length > 0 && !text && images.length === 0) {
        fullUserText = '📄 ' + files.map(f => f.name).join(', ');
      }
    }

    // 渲染用户消息 (有附件时在气泡下方追加标签/缩略图)
    HP.addMessage('user', text || (files.length > 0 ? '📎 ' + files.map(f => f.name).join(', ') : ''));
    if (files.length > 0) {
      const lastBubble = C.$messages.querySelector('.msg.user:last-of-type .bubble');
      if (lastBubble) {
        const attachDiv = document.createElement('div');
        attachDiv.className = 'attach-inline';
        files.forEach(f => {
          if (f.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = f.dataUrl;
            img.className = 'attach-inline-thumb';
            img.title = f.name;
            attachDiv.appendChild(img);
          } else {
            const chip = document.createElement('span');
            chip.className = 'attach-hist-chip';
            chip.textContent = '📄 ' + f.name;
            attachDiv.appendChild(chip);
          }
        });
        lastBubble.appendChild(attachDiv);
      }
    }

    // 存聊天历史
    // 图片 dataUrl 通过 chrome.storage.local 中转，避免 port.postMessage 序列化大体积数据崩溃
    const imageStorageKey = '_img_' + Date.now();
    const imageDataUrls = images.map(i => i.dataUrl);
    if (imageDataUrls.length > 0) {
      await chrome.storage.local.set({ [imageStorageKey]: imageDataUrls });
    }
    C.chatHistory.push({ role: 'user', content: fullUserText, _attachments: files.map(f => ({ name: f.name, type: f.type, text: f.text || '' })), _images: images.map((_, i) => ({ storageKey: imageStorageKey, index: i })) });
    // 清除附件
    C.attachedFiles = [];
    renderAttachments();

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
        C.$sendBtn.disabled = (!C.$input.value.trim() && C.attachedFiles.length === 0);
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
        C.$sendBtn.disabled = (!C.$input.value.trim() && C.attachedFiles.length === 0);
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
        C.$sendBtn.disabled = (!C.$input.value.trim() && C.attachedFiles.length === 0);
      }
    });

    C.currentPort.postMessage({ type: 'init', history: C.chatHistory.slice(), visionMode: C.visionMode });
  }
  C.doSend = doSend;

  async function sendMessage() {
    const text = C.$input.value.trim();
    if ((!text && C.attachedFiles.length === 0) || C.isStreaming) return;
    C.$input.value = '';
    autoResize();
    await doSend(text);
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

  // -- 附件上传 --
  C.$btnAttach.addEventListener('click', () => {
    C.$fileInput.click();
  });
  C.$fileInput.addEventListener('change', async () => {
    if (C.$fileInput.files && C.$fileInput.files.length > 0) {
      await addFiles(C.$fileInput.files);
    }
    C.$fileInput.value = '';
  });

  function readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  function readFileAsText(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    });
  }

  function renderAttachments() {
    if (!C.$attachmentsList) return;
    if (!C.attachedFiles || C.attachedFiles.length === 0) {
      C.$attachmentsList.innerHTML = '';
      return;
    }
    let html = '';
    C.attachedFiles.forEach((f, i) => {
      var isImg = f.type.startsWith('image/');
      html += '<div class="attach-chip">' +
        (isImg ? '<img src="' + f.dataUrl.replace(/"/g, '&quot;') + '" class="attach-thumb">' : '<span class="attach-icon">📄</span>') +
        '<span class="attach-name" title="' + MD.escapeHtml(f.name) + '">' + MD.escapeHtml(f.name.slice(0, 16) + (f.name.length > 16 ? '\u2026' : '')) + '</span>' +
        '<button class="attach-remove" data-idx="' + i + '" title="移除">✕</button>' +
      '</div>';
    });
    C.$attachmentsList.innerHTML = html;
    C.$attachmentsList.querySelectorAll('.attach-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(btn.dataset.idx);
        C.attachedFiles.splice(idx, 1);
        renderAttachments();
        autoResize();
      });
    });
  }

  // -- 拖拽文件到侧边栏 --
  sidebar.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sidebar.classList.add('drag-over');
  });
  sidebar.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!sidebar.contains(e.relatedTarget)) {
      sidebar.classList.remove('drag-over');
    }
  });
  sidebar.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    sidebar.classList.remove('drag-over');
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      await addFiles(dt.files);
    }
  });

  // -- Ctrl+V 粘贴图片 --
  C.$input.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const dataUrl = await readBlobAsDataURL(blob);
          C.attachedFiles.push({ name: '粘贴图片_' + Date.now() + '.png', type: blob.type, dataUrl, text: '' });
          renderAttachments();
          autoResize();
        }
      }
    }
  });

  // 处理文件列表（拖拽或选择共用）
  async function addFiles(fileList) {
    for (const file of fileList) {
      if (file.size > 20 * 1024 * 1024) continue;
      const isImage = file.type.startsWith('image/');
      const entry = { name: file.name, type: file.type, dataUrl: '', text: '' };
      if (isImage) {
        entry.dataUrl = await readFileAsDataURL(file);
      } else {
        entry.text = await readFileAsText(file);
      }
      C.attachedFiles.push(entry);
    }
    renderAttachments();
    autoResize();
  }

  function readBlobAsDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
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

  // -- 模块事件绑定 --
  HP.bindEvents();
  SP.bindEvents();
  AA.bindEvents();
  if (SS) { SS.bindEvents(); SS.loadPrefs(); }

  // ======================== 挂载 ========================
  await HP.loadConversations();
  document.documentElement.appendChild(host);

})();
