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

    // Agent 模式
    agentMode: false,
    agentRunning: false,
    agentMaxSteps: 5,
    agentToolCards: {},

    // 视觉模型 + 附件
    visionMode: 'none',
    visionModelProvider: 'openai',
    visionModel: '',
    attachedFiles: [],
    skipAnswered: true,
    autoContext: false,

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
    $settingsQuickShot: null, $settingsAutoContext: null, $fileInput: null,
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
    sendMessage: null,
    stopAgent: null,
    // Agent 恢复渲染函数 — 供 history-panel 和跨标签页同步使用
    restoreAgentMessages: null,
    restoreAgentToolCard: null
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
  chrome.storage.local.get(['colorScheme', 'visionMode', 'visionModelProvider', 'visionModel', 'skipAnswered', 'autoContext', 'agentMode', 'agentMaxSteps'], (data) => {
    C.colorScheme = data.colorScheme || 'purple';
    C.visionMode = data.visionMode || 'none';
    C.visionModelProvider = data.visionModelProvider || 'openai';
    C.visionModel = data.visionModel || '';
    C.skipAnswered = data.skipAnswered !== false;
    C.autoContext = !!data.autoContext;
    C.agentMode = !!data.agentMode;
    C.agentMaxSteps = data.agentMaxSteps != null ? data.agentMaxSteps : 5;
    C.host.setAttribute('data-theme', getCurrentMode());
    applyColorScheme(C.colorScheme);
    if (C.$settingsAutoContext) C.$settingsAutoContext.checked = C.autoContext;
    updateAgentToggleUI();
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
  C.$settingsAutoContext = shadow.getElementById('settings-auto-context');
  C.$fileInput = shadow.getElementById('file-input');
  // Agent DOM
  C.$agentStatusBar = shadow.getElementById('agent-status-bar');
  C.$agentDot = shadow.getElementById('agent-dot');
  C.$agentText = shadow.getElementById('agent-text');
  C.$agentStep = shadow.getElementById('agent-step');
  C.$btnAgentToggle = shadow.getElementById('btn-agent-toggle');
  C.$btnAgentStop = shadow.getElementById('btn-agent-stop');

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
  var _pollTimer = null;
  var _lastSyncCounter = -1;

  function startSyncPoll() {
    stopSyncPoll();
    _pollTimer = setInterval(function() {
      if (C.agentRunning) return; // 自己是 Agent 运行者，不干扰
      chrome.storage.local.get(['_agentSync', 'conversations', 'currentConvId'], function(data) {
        var sync = data._agentSync;
        if (!sync) return;
        if (sync.counter === _lastSyncCounter) return;
        _lastSyncCounter = sync.counter;

        // 有活跃 Agent 会话 → 切换过去并显示状态栏
        if (sync.convId) {
          C.currentConvId = sync.convId;
        }
        if (sync.running && sync.convId) {
          if (!C.agentRunning) {
            updateAgentStatusBar(true);
            updateAgentDot('running');
            if (C.$agentText) C.$agentText.textContent = 'Agent 运行中';
            if (C.$agentStep) {
              var ms = sync.maxSteps > 100 ? '不限制' : sync.maxSteps;
              C.$agentStep.textContent = '步骤 ' + (sync.step||0) + '/' + ms;
            }
          }
        } else if (!sync.running && !C.agentRunning) {
          updateAgentStatusBar(false);
        } else if (!sync.running) {
          updateAgentDot('done');
          if (C.$agentText) C.$agentText.textContent = 'Agent 已完成';
        }

        C.conversations = data.conversations || [];
        if (C.currentConvId && C.$messages) {
          var conv = C.conversations.find(function(c) { return c.id === C.currentConvId; });
          if (conv) {
            C.chatHistory = conv.messages.slice();
            C.autoAnswerData = conv.autoAnswerData || null;
            C.$messages.innerHTML = '';
            restoreAgentMessagesFromHistory();
            HP.scrollToBottom();
          }
        }
      });
    }, 800);
  }

  function stopSyncPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function toggleSidebar(force) {
    C.sidebarOpen = typeof force === 'boolean' ? force : !C.sidebarOpen;
    sidebar.classList.toggle('open', C.sidebarOpen);
    fab.classList.toggle('open', C.sidebarOpen);
    if (C.sidebarOpen) {
      fab.style.right = (C.sidebarWidth + 12) + 'px';
      // 立即加载最新数据
      syncFromStorage();
      // 启动轮询：每 800ms 检查是否有新步骤
      startSyncPoll();
      C.isHomework = !!document.querySelector('.questionLi[typename="单选题"]');
      C.$autoRow.style.display = C.isHomework ? 'flex' : 'none';
      if (C.isHomework) C.$autoStatus.textContent = '';
      // 页面感知：自动提取当前页面内容
      if (C.autoContext && !C._autoContextAdded && C.attachedFiles.length === 0) {
        addCurrentPageContext();
      }
      setTimeout(() => C.$input.focus(), 320);
    } else {
      stopSyncPoll();
      fab.style.right = '';
    }
  }
  C.toggleSidebar = toggleSidebar;

  // 提取当前页面文本
  function extractPageText() {
    try {
      var article = document.querySelector('article') || document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      var clone = article.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, iframe, nav, footer, header, .sidebar, .nav, .menu, .advertisement, [role="navigation"]').forEach(function(el) { el.remove(); });
      var text = (clone.innerText || clone.textContent || '');
      return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 30000);
    } catch(e) { return ''; }
  }

  function addCurrentPageContext() {
    var text = extractPageText();
    if (!text) return;
    var title = document.title || '当前页面';
    var name = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.txt';
    C.attachedFiles.push({
      name: name,
      type: 'text/plain',
      dataUrl: '',
      text: '【网页标题】' + title + '\n【网页地址】' + location.href + '\n\n' + text
    });
    C._autoContextAdded = true;
    renderAttachments();
    autoResize();
    if (C.$autoStatus && !C.isHomework) {
      C.$autoStatus.textContent = '已感知当前页面';
      setTimeout(function() { if (C.$autoStatus) C.$autoStatus.textContent = ''; }, 3000);
    }
  }

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

    // ======== Agent 模式 vs 普通模式 ========
    if (C.agentMode) {
      // 检查是否有其他标签页的 Agent 在运行
      var syncCheck = await chrome.storage.local.get(['_agentSync']);
      if (syncCheck._agentSync && syncCheck._agentSync.running && !C.agentRunning) {
        // 其他标签页的 Agent 正在执行 → 转发消息给 background
        HP.removeLoading();
        chrome.runtime.sendMessage({ type: 'agent-input', text: fullUserText, convId: syncCheck._agentSync.convId });
        C.isStreaming = false;
        C.$sendBtn.disabled = (!C.$input.value.trim() && C.attachedFiles.length === 0);
        // 切到 Agent 的会话
        C.currentConvId = syncCheck._agentSync.convId;
        return;
      }

      // 没有活跃 Agent 或自己是发起者 → 启动新 Agent
      C.agentRunning = true;
      C.agentToolCards = {};
      updateAgentStatusBar(true);

      C.currentPort = chrome.runtime.connect({ name: 'ai-chat' });
      let aiBubble = null;
      let fullText = '';

      C.currentPort.onMessage.addListener((msg) => {
        if (msg.type === 'agent-thinking') {
          updateAgentDot('thinking');
          if (C.$agentStep) C.$agentStep.textContent = msg.maxSteps > 100 ? `步骤 ${msg.step}/不限制` : `步骤 ${msg.step}/${msg.maxSteps}`;
          if (C.$agentText) C.$agentText.textContent = '正在思考...';
        } else if (msg.type === 'agent-tool-start') {
          updateAgentDot('running');
          const toolLabel = getToolLabel(msg.name);
          if (C.$agentText) C.$agentText.textContent = `执行: ${toolLabel}`;
          // 存入 chatHistory
          C.chatHistory.push({ role: '_agent_tool', toolCallId: msg.toolCallId, name: msg.name, args: msg.args, status: 'running' });
          agentSaveToDisk();
          addAgentToolCard(msg.toolCallId, msg.name, msg.args);
        } else if (msg.type === 'agent-tool-result') {
          updateAgentDot('thinking');
          // 更新 chatHistory 中对应的 _agent_tool
          var toolIdx = -1;
          for (var i = C.chatHistory.length - 1; i >= 0; i--) {
            if (C.chatHistory[i].role === '_agent_tool' && C.chatHistory[i].toolCallId === msg.toolCallId) {
              toolIdx = i; break;
            }
          }
          if (toolIdx >= 0) {
            C.chatHistory[toolIdx].status = msg.error ? 'error' : 'done';
            C.chatHistory[toolIdx].result = msg.result;
            C.chatHistory[toolIdx].error = msg.error || null;
          }
          agentSaveToDisk();
          updateAgentToolCard(msg.toolCallId, msg.result, msg.error);
        } else if (msg.type === 'chunk') {
          if (!aiBubble) {
            HP.removeLoading();
            updateAgentDot('done');
            aiBubble = HP.addMessage('ai', '');
          }
          fullText += msg.content;
          aiBubble.innerHTML = MD.renderMarkdown(fullText) + '<span class="cursor-blink"></span>';
          HP.scrollToBottom();
        } else if (msg.type === 'error') {
          HP.removeLoading();
          updateAgentDot('error');
          HP.addError(msg.content);
          C.chatHistory.push({ role: 'assistant', content: '❌ ' + msg.content });
          finishAgent();
          HP.saveConversation();
        } else if (msg.type === 'done') {
          HP.removeLoading();
          if (aiBubble) {
            aiBubble.innerHTML = MD.renderMarkdown(fullText);
          }
          if (fullText) {
            C.chatHistory.push({ role: 'assistant', content: fullText });
          }
          updateAgentDot('done');
          finishAgent();
          HP.saveConversation();
        }
      });

      C.currentPort.onDisconnect.addListener(() => {
        HP.removeLoading();
        if (C.agentRunning) {
          if (aiBubble) aiBubble.innerHTML = MD.renderMarkdown(fullText);
          if (fullText) {
            C.chatHistory.push({ role: 'assistant', content: fullText });
          }
          finishAgent();
          HP.saveConversation();
        }
      });

      C.currentPort.postMessage({
        type: 'agent-init',
        convId: C.currentConvId,
        history: C.chatHistory.slice(),
        maxSteps: C.agentMaxSteps,
        visionMode: C.visionMode
      });
      return;
    }

    // 普通模式（不变）
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

  // ======================== Agent 辅助函数 ========================

  // 递增的同步计数器，确保每次 Agent 步骤都触发跨标签页 onChanged
  var _agentSyncCounter = 0;

  function agentSaveToDisk() {
    // 如果没有 convId，自动创建（确保第一次 Agent 步骤就写入 storage）
    if (!C.currentConvId) C.currentConvId = 'conv_' + Date.now();
    if (C.chatHistory.length === 0) return;
    var idx = C.conversations.findIndex(function(c) { return c.id === C.currentConvId; });
    var conv = {
      id: C.currentConvId,
      title: HP.genConvTitle(),
      messages: C.chatHistory.slice(),
      updatedAt: Date.now(),
      createdAt: idx >= 0 ? C.conversations[idx].createdAt : Date.now(),
      autoAnswerData: C.autoAnswerData ? Object.assign({}, C.autoAnswerData) : null
    };
    if (idx >= 0) C.conversations[idx] = conv;
    else C.conversations.unshift(conv);

    _agentSyncCounter++;
    chrome.storage.local.set({
      conversations: C.conversations,
      currentConvId: C.currentConvId,
      _agentSync: {
        counter: _agentSyncCounter,
        convId: C.currentConvId,
        running: C.agentRunning,
        updatedAt: Date.now()
      }
    });
  }

  function finishAgent() {
    C.agentRunning = false;
    C.isStreaming = false;
    C.currentPort = null;
    C.$sendBtn.disabled = (!C.$input.value.trim() && C.attachedFiles.length === 0);
    updateAgentStatusBar(false);
    _agentSyncCounter++;
    chrome.storage.local.set({
      _agentSync: {
        counter: _agentSyncCounter,
        convId: C.currentConvId,
        running: false,
        updatedAt: Date.now()
      }
    });
  }

  function updateAgentToggleUI() {
    if (!C.$btnAgentToggle) return;
    if (C.agentMode) {
      C.$btnAgentToggle.classList.add('active');
      C.$btnAgentToggle.title = 'Agent模式已开启 - 点击关闭';
    } else {
      C.$btnAgentToggle.classList.remove('active');
      C.$btnAgentToggle.title = 'Agent模式：AI可自动操作浏览器';
    }
  }
  C.updateAgentToggleUI = updateAgentToggleUI;

  function updateAgentStatusBar(show) {
    if (!C.$agentStatusBar) return;
    C.$agentStatusBar.style.display = show ? 'flex' : 'none';
    if (!show) {
      updateAgentDot('');
      if (C.$agentText) C.$agentText.textContent = '';
      if (C.$agentStep) C.$agentStep.textContent = '';
    }
  }

  function updateAgentDot(state) {
    if (!C.$agentDot) return;
    C.$agentDot.className = 'agent-dot';
    if (state) C.$agentDot.classList.add(state);
  }

  function getToolLabel(name) {
    const labels = {
      open_tab: '打开网页', click_element: '点击元素', type_text: '输入文本',
      get_page_structure: '分析页面', get_page_text: '读取页面',
      web_search: '搜索网页', list_tabs: '列出标签页', scroll_page: '滚动页面',
      wait_for_element: '等待元素', screenshot: '截取页面', eval_js: '执行脚本',
      fetch_webpage: '获取网页'
    };
    return labels[name] || name;
  }

  function getToolIcon(name) {
    const icons = {
      open_tab: '📄', click_element: '🖱️', type_text: '⌨️',
      get_page_structure: '🔍', get_page_text: '📖', web_search: '🌐',
      list_tabs: '📑', scroll_page: '↕️', wait_for_element: '⏳',
      screenshot: '📸', eval_js: '⚡', fetch_webpage: '📥'
    };
    return icons[name] || '🔧';
  }

  function addAgentToolCard(toolCallId, name, argsStr) {
    C.agentToolCards[toolCallId] = { name };
    // 移除loading
    HP.removeLoading();
    const wrap = document.createElement('div');
    wrap.className = 'msg ai';
    wrap.id = 'agent-card-' + toolCallId;
    const card = document.createElement('div');
    const label = getToolLabel(name);
    const icon = getToolIcon(name);
    let argsDisplay = '';
    try {
      const parsed = JSON.parse(argsStr);
      argsDisplay = JSON.stringify(parsed, null, 1)
        .replace(/[{}"]/g, '').replace(/^\s*|\s*$/gm, '')
        .replace(/\n/g, ', ').slice(0, 150);
    } catch { argsDisplay = argsStr.slice(0, 150); }

    card.className = 'agent-card';
    card.innerHTML =
      '<div class="agent-card-head agent-card-toggle">' +
        '<span class="collapse-arrow">▶</span>' +
        '<span class="agent-card-icon">' + icon + '</span>' +
        '<span class="agent-card-name">' + label + '</span>' +
        '<span class="agent-card-args" style="font-size:11px;color:var(--md-on-surface-variant);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">' + MD.escapeHtml(argsDisplay) + '</span>' +
        '<span class="agent-card-status running">执行中...</span>' +
      '</div>' +
      '<div class="agent-card-body"></div>';
    wrap.appendChild(card);
    C.$messages.appendChild(wrap);

    // 折叠/展开
    card.querySelector('.agent-card-toggle').addEventListener('click', function() {
      const body = card.querySelector('.agent-card-body');
      const arrow = card.querySelector('.collapse-arrow');
      body.classList.toggle('open');
      arrow.classList.toggle('open');
    });

    HP.scrollToBottom();
  }

  function updateAgentToolCard(toolCallId, resultStr, error) {
    const wrap = C.shadow.getElementById('agent-card-' + toolCallId);
    if (!wrap) return;
    const statusEl = wrap.querySelector('.agent-card-status');
    const bodyEl = wrap.querySelector('.agent-card-body');

    if (error) {
      if (statusEl) { statusEl.textContent = '失败'; statusEl.className = 'agent-card-status error'; }
      if (bodyEl) bodyEl.textContent = '错误: ' + error;
    } else {
      if (statusEl) { statusEl.textContent = '完成'; statusEl.className = 'agent-card-status done'; }
      if (bodyEl) {
        let displayText;
        try {
          const parsed = JSON.parse(resultStr);
          displayText = JSON.stringify(parsed, null, 2);
        } catch { displayText = resultStr; }
        if (displayText.length > 5000) displayText = displayText.slice(0, 5000) + '\n...(截断)';
        bodyEl.textContent = displayText;
      }
    }

    // 更新工具名后面的参数（压缩显示）
    const argsEl = wrap.querySelector('.agent-card-args');
    if (argsEl && !error) {
      try {
        const parsed = JSON.parse(resultStr);
        const summary = typeof parsed.success !== 'undefined' ? (parsed.success ? '✓ 成功' : '✗ 失败')
          : parsed.tabId ? '✓ Tab#' + parsed.tabId
          : parsed.count !== undefined ? '✓ ' + parsed.count + '项'
          : '✓ 完成';
        if (summary.length < 30) argsEl.textContent = summary;
      } catch {}
    }
  }

  function stopAgent() {
    // 通过 runtime 通知 background 停止全局 Agent 会话
    chrome.runtime.sendMessage({ type: 'agent-stop' });
    if (C.currentPort && C.agentRunning) {
      C.currentPort.disconnect();
      finishAgent();
      HP.removeLoading();
    }
    // 即使自己没有在跑，也清理本地状态
    if (!C.agentRunning) {
      finishAgent();
      HP.removeLoading();
    }
  }
  C.stopAgent = stopAgent;

  // Agent 开关按钮
  if (C.$btnAgentToggle) {
    C.$btnAgentToggle.addEventListener('click', function() {
      if (C.isStreaming) return;
      C.agentMode = !C.agentMode;
      updateAgentToggleUI();
      updateAgentStatusBar(false);
      chrome.storage.local.set({ agentMode: C.agentMode });
    });
  }

  // Agent 停止按钮
  if (C.$btnAgentStop) {
    C.$btnAgentStop.addEventListener('click', stopAgent);
  }

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

  // -- 附件菜单 (上传文件 / 添加网页上下文) --
  const attachMenu = document.createElement('div');
  attachMenu.id = 'attach-menu';
  attachMenu.className = 'attach-menu';
  attachMenu.style.display = 'none';
  attachMenu.innerHTML = '<div class="attach-menu-card" id="attach-menu-card"></div>';
  C.$autoRow.parentNode.insertBefore(attachMenu, C.$autoRow.nextSibling);
  C.$attachMenu = attachMenu;
  let attachMenuMode = 'main';

  function showAttachMenu() {
    attachMenu.style.display = 'flex';
    attachMenuMode = 'main';
    renderAttachMenuMain();
  }
  function hideAttachMenu() {
    attachMenu.style.display = 'none';
    attachMenuMode = 'main';
  }

  function renderAttachMenuMain() {
    var card = shadow.getElementById('attach-menu-card');
    if (!card) return;
    card.innerHTML =
      '<div class="attach-menu-item" data-action="file">' +
        '<span class="attach-menu-icon">📁</span><span>上传文件</span>' +
      '</div>' +
      '<div class="attach-menu-item" data-action="webpage">' +
        '<span class="attach-menu-icon">🌐</span><span>添加网页上下文</span>' +
      '</div>';
  }

  // ---- 统一事件委托 (挂载一次，不随 innerHTML 改变而丢失) ----
  (function setupAttachMenuDelegation() {
    var card = shadow.getElementById('attach-menu-card');
    if (!card) return;
    card.addEventListener('click', function(e) {
      e.stopPropagation();
      var tabItem = e.target.closest('.attach-tab-item');
      if (tabItem) {
        addTabContent(parseInt(tabItem.dataset.tabId));
        return;
      }
      var item = e.target.closest('[data-action]');
      if (!item) return;
      var action = item.dataset.action;
      if (action === 'file') {
        hideAttachMenu();
        C.$fileInput.click();
      } else if (action === 'webpage') {
        loadTabList();
      } else if (action === 'back') {
        attachMenuMode = 'main';
        renderAttachMenuMain();
      }
    });
  })();

  function renderLoadingCard(backLabel) {
    var card = shadow.getElementById('attach-menu-card');
    if (!card) return;
    card.innerHTML =
      '<div class="attach-menu-item attach-menu-back" data-action="back">' +
        '<span class="attach-menu-icon">←</span><span>' + (backLabel || '返回') + '</span>' +
      '</div>' +
      '<div class="attach-menu-loading">加载中...</div>';
  }

  function renderErrorCard(errMsg) {
    var card = shadow.getElementById('attach-menu-card');
    if (!card) return;
    card.innerHTML =
      '<div class="attach-menu-item attach-menu-back" data-action="back">' +
        '<span class="attach-menu-icon">←</span><span>返回</span>' +
      '</div>' +
      '<div class="attach-menu-error">' + MD.escapeHtml(errMsg) + '</div>';
  }

  function renderEmptyCard(msg) {
    var card = shadow.getElementById('attach-menu-card');
    if (!card) return;
    card.innerHTML =
      '<div class="attach-menu-item attach-menu-back" data-action="back">' +
        '<span class="attach-menu-icon">←</span><span>返回</span>' +
      '</div>' +
      '<div class="attach-menu-empty">' + MD.escapeHtml(msg) + '</div>';
  }

  async function loadTabList() {
    attachMenuMode = 'tabs';
    renderLoadingCard('返回');

    var tabsRes;
    try {
      tabsRes = await Promise.race([
        chrome.runtime.sendMessage({ type: 'get-tabs' }),
        new Promise(function(_, reject) { setTimeout(function() { reject(new Error('请求超时，请刷新扩展')); }, 5000); })
      ]);
    } catch (err) {
      renderErrorCard(err.message || '请确认扩展已重新加载（edge://extensions/ 点击刷新）');
      return;
    }

    if (!tabsRes || tabsRes.error) {
      renderErrorCard(tabsRes?.error || '获取标签页失败');
      return;
    }

    // 只过滤系统页面（edge://, chrome:// 等），允许选择当前页面
    var tabList = tabsRes.tabs.filter(function(t) {
      return /^https?:\/\//i.test(t.url || '');
    });

    if (tabList.length === 0) {
      renderEmptyCard('没有可读取的网页标签');
      return;
    }

    var html =
      '<div class="attach-menu-item attach-menu-back" data-action="back">' +
        '<span class="attach-menu-icon">←</span><span>选择标签页 (' + tabList.length + ')</span>' +
      '</div>' +
      '<div class="attach-menu-tabs">';
    tabList.forEach(function(tab) {
      var isCurrent = tab.id === tabsRes.currentTabId;
      html +=
        '<div class="attach-menu-item attach-tab-item' + (isCurrent ? ' current' : '') + '" data-tab-id="' + tab.id + '">' +
          '<span class="attach-menu-icon">' + (isCurrent ? '📍' : '📄') + '</span>' +
          '<div class="attach-tab-info">' +
            '<div class="attach-tab-title">' + MD.escapeHtml(tab.title || '无标题') + (isCurrent ? ' <span style="font-size:11px;color:var(--md-primary)">(当前)</span>' : '') + '</div>' +
            '<div class="attach-tab-url">' + MD.escapeHtml((tab.url || '').slice(0, 60)) + '</div>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    var card = shadow.getElementById('attach-menu-card');
    if (card) card.innerHTML = html;
  }

  async function addTabContent(tabId) {
    hideAttachMenu();
    if (C.$autoStatus) C.$autoStatus.textContent = '正在提取网页内容...';
    try {
      var raw = await Promise.race([
        chrome.runtime.sendMessage({ type: 'get-tab-content', tabId: tabId }).catch(function(e) {
          return { error: e.message || '通道关闭，请重新加载扩展' };
        }),
        new Promise(function(_, reject) { setTimeout(function() { reject(new Error('请求超时')); }, 8000); })
      ]);
      var result = raw || {};
      if (result.text) {
        var title = result.title || '网页';
        var name = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.txt';
        C.attachedFiles.push({
          name: name,
          type: 'text/plain',
          dataUrl: '',
          text: '【网页标题】' + title + '\n【网页地址】' + (result.url || '') + '\n\n' + result.text
        });
        renderAttachments();
        autoResize();
        if (C.$autoStatus) C.$autoStatus.textContent = '已添加网页: ' + title.slice(0, 18) + '…';
        setTimeout(function() { if (C.$autoStatus) C.$autoStatus.textContent = ''; }, 3000);
      } else if (result && result.error) {
        console.error('[AttachMenu] get-tab-content error:', result.error);
        if (C.$autoStatus) C.$autoStatus.textContent = '提取失败: ' + result.error;
        setTimeout(function() { if (C.$autoStatus) C.$autoStatus.textContent = ''; }, 4000);
      } else {
        if (C.$autoStatus) C.$autoStatus.textContent = '网页内容为空';
        setTimeout(function() { if (C.$autoStatus) C.$autoStatus.textContent = ''; }, 3000);
      }
    } catch (err) {
      console.error('[AttachMenu] addTabContent failed:', err);
      if (C.$autoStatus) C.$autoStatus.textContent = '提取失败: ' + err.message;
      setTimeout(function() { if (C.$autoStatus) C.$autoStatus.textContent = ''; }, 4000);
    }
  }

  C.$btnAttach.addEventListener('click', function(e) {
    e.stopPropagation();
    if (attachMenu.style.display !== 'none') { hideAttachMenu(); }
    else { showAttachMenu(); }
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

  // -- 代码复制 + 关闭附件菜单 (事件委托) --
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
    // 点击菜单外部关闭
    if (attachMenu.style.display !== 'none' && !attachMenu.contains(e.target) && e.target !== C.$btnAttach) {
      hideAttachMenu();
    }
  });

  // -- 模块事件绑定 --
  HP.bindEvents();
  SP.bindEvents();
  AA.bindEvents();
  if (SS) { SS.bindEvents(); SS.loadPrefs(); }

  // ======================== 跨标签页会话同步 ========================
  // 打开侧边栏 / 新标签页加载时，从 storage 拉取最新会话数据

  function syncFromStorage() {
    chrome.storage.local.get(['currentConvId', 'conversations', '_agentSync'], function(data) {
      // 不覆盖正在运行 Agent 的当前标签页
      if (C.agentRunning) return;

      var sync = data._agentSync;
      // 如果有活跃 Agent 会话，自动切到它
      if (sync && sync.running && sync.convId) {
        C.currentConvId = sync.convId;
      } else if (!C.currentConvId) {
        C.currentConvId = data.currentConvId || null;
      }

      C.conversations = data.conversations || [];

      if (C.currentConvId && C.$messages) {
        var conv = C.conversations.find(function(c) { return c.id === C.currentConvId; });
        if (conv) {
          C.chatHistory = conv.messages.slice();
          C.autoAnswerData = conv.autoAnswerData || null;
          C.$messages.innerHTML = '';
          restoreAgentMessagesFromHistory();
          HP.scrollToBottom();
        }
        // 如果没有找到 conv（边缘情况），至少清空以免显示旧数据
        else if (C.chatHistory.length > 0) {
          // 有 _agentSync 但没有对应的 conversation → 可能正在写入中，稍后再试
          // 不清空当前数据
        }
      }
    });
  }

  function checkAgentSessionOnInit() {
    syncFromStorage();
    // Agent 打开的新标签页自动展开侧边栏（轮询等待 background 写入 storage）
    var _fastRetry = 0;
    var _fastPoll = function() {
      chrome.storage.local.get(['_agentSync'], function(d) {
        _fastRetry++;
        var has = !!(d._agentSync && d._agentSync.running && d._agentSync.convId);
        if (has) {
          C.currentConvId = d._agentSync.convId;
          syncFromStorage();
          startSyncPoll();
          updateAgentStatusBar(true);
          updateAgentDot('running');
          if (C.$agentText) C.$agentText.textContent = 'Agent 运行中';
          if (C.$agentStep) {
            var ms = d._agentSync.maxSteps > 100 ? '不限制' : d._agentSync.maxSteps;
            C.$agentStep.textContent = '步骤 ' + (d._agentSync.step||0) + '/' + ms;
          }
          if (!C.sidebarOpen) toggleSidebar(true);
        } else if (_fastRetry < 15) {
          setTimeout(_fastPoll, 200);
        }
      });
    };
    _fastPoll();
  }

  // 渲染带 Agent 卡片的历史消息（同时被 HP.restoreMessagesFromHistory 和跨标签页同步使用）
  function restoreAgentMessagesFromHistory() {
    if (!C.$messages) return;
    C.$messages.innerHTML = '';
    C.chatHistory.forEach(function(m) {
      if (m._auto) return;
      if (/^\[第\d+题\]/.test(m.content)) return;
      if (m.role === 'user') {
        var bubble = HP.addMessageBubble('user', m.content);
        if (m._attachments && m._attachments.length > 0) {
          var attachDiv = document.createElement('div');
          attachDiv.className = 'attach-hist';
          m._attachments.forEach(function(a) {
            var isImg = (a.type || '').startsWith('image/');
            var chip = document.createElement('span');
            chip.className = 'attach-hist-chip';
            chip.textContent = (isImg ? '\u{1F4F7} ' : '\u{1F4C4} ') + MD.escapeHtml(a.name);
            attachDiv.appendChild(chip);
          });
          bubble.appendChild(attachDiv);
        }
      } else if (m.role === 'assistant') {
        HP.addMessageBubble('ai', m.content);
      } else if (m.role === '_agent_tool') {
        // 恢复 Agent 工具卡片
        restoreAgentToolCard(m);
      }
    });
    if (C.chatHistory.length === 0) HP.showWelcome();
  }

  function restoreAgentToolCard(m) {
    var wrap = document.createElement('div');
    wrap.className = 'msg ai';
    var card = document.createElement('div');
    var label = getToolLabel(m.name);
    var icon = getToolIcon(m.name);
    var statusClass = m.status === 'done' ? 'done' : (m.status === 'error' ? 'error' : 'running');
    var statusText = m.status === 'done' ? '完成' : (m.status === 'error' ? '失败' : '执行中...');
    var argsDisplay = '';
    try {
      var parsed = JSON.parse(m.args);
      argsDisplay = JSON.stringify(parsed, null, 1)
        .replace(/[{}"]/g, '').replace(/^\s*|\s*$/gm, '')
        .replace(/\n/g, ', ').slice(0, 150);
    } catch(e) { argsDisplay = (m.args || '').slice(0, 150); }

    var resultDisplay = '';
    if (m.result) {
      resultDisplay = m.result;
      if (resultDisplay.length > 5000) resultDisplay = resultDisplay.slice(0, 5000) + '\n...(截断)';
    }

    card.className = 'agent-card';
    card.innerHTML =
      '<div class="agent-card-head agent-card-toggle">' +
        '<span class="collapse-arrow">▶</span>' +
        '<span class="agent-card-icon">' + icon + '</span>' +
        '<span class="agent-card-name">' + label + '</span>' +
        '<span class="agent-card-args" style="font-size:11px;color:var(--md-on-surface-variant);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">' + MD.escapeHtml(argsDisplay) + '</span>' +
        '<span class="agent-card-status ' + statusClass + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="agent-card-body">' + (resultDisplay ? MD.escapeHtml(resultDisplay) : (m.error || '')) + '</div>';
    wrap.appendChild(card);
    C.$messages.appendChild(wrap);

    card.querySelector('.agent-card-toggle').addEventListener('click', function() {
      var body = card.querySelector('.agent-card-body');
      var arrow = card.querySelector('.collapse-arrow');
      body.classList.toggle('open');
      arrow.classList.toggle('open');
    });
  }

  C.restoreAgentMessages = restoreAgentMessagesFromHistory;
  C.restoreAgentToolCard = restoreAgentToolCard;

  // ======================== 挂载 ========================
  await HP.loadConversations();
  document.documentElement.appendChild(host);
  // 检查是否有正在运行的 Agent 会话（其他标签页可能正在执行）
  checkAgentSessionOnInit();

})();
