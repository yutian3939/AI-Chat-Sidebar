// ============================================================
// content/history-panel.js — 历史记录面板
// 通过 window.__CTX__ 获取共享状态和 DOM 引用
// ============================================================
'use strict';
(function() {

  var I = window.AIChatICONS;
  var MD = window.AIChatMD;

  function genConvTitle() {
    var C = window.__CTX__;
    var firstUser = C.chatHistory.find(function(m) { return m.role === 'user'; });
    if (firstUser) return firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '\u2026' : '');
    return '新对话';
  }

  async function saveConversation() {
    var C = window.__CTX__;
    if (C.chatHistory.length === 0) return;
    if (!C.currentConvId) {
      C.currentConvId = 'conv_' + Date.now();
    }
    var idx = C.conversations.findIndex(function(c) { return c.id === C.currentConvId; });
    var conv = {
      id: C.currentConvId,
      title: genConvTitle(),
      messages: C.chatHistory.slice(),
      updatedAt: Date.now(),
      createdAt: idx >= 0 ? C.conversations[idx].createdAt : Date.now(),
      autoAnswerData: C.autoAnswerData ? Object.assign({}, C.autoAnswerData) : null
    };
    if (idx >= 0) C.conversations[idx] = conv;
    else C.conversations.unshift(conv);
    await chrome.storage.local.set({ conversations: C.conversations, currentConvId: C.currentConvId });
  }

  async function loadConversations() {
    var C = window.__CTX__;
    var data = await chrome.storage.local.get(['conversations', 'currentConvId']);
    C.conversations = data.conversations || [];
    C.currentConvId = data.currentConvId || null;
    if (C.currentConvId) {
      var conv = C.conversations.find(function(c) { return c.id === C.currentConvId; });
      if (conv) {
        C.chatHistory = conv.messages.slice();
        C.autoAnswerData = conv.autoAnswerData || null;
        clearAutoResultsPanel();
        restoreMessagesFromHistory();
        if (C.autoAnswerData) window.AIChatAutoAnswer.restoreAutoResultsPanel(C.autoAnswerData);
        scrollToBottom();
        return;
      }
    }
    C.currentConvId = null;
    C.chatHistory = [];
    C.autoAnswerData = null;
  }

  function restoreMessagesFromHistory() {
    var C = window.__CTX__;
    // 如果 index.js 已加载，使用支持 Agent 卡片的新渲染函数
    if (C.restoreAgentMessages) {
      C.restoreAgentMessages();
      scrollToBottom();
      return;
    }
    // 降级：旧版渲染（不支持 Agent 卡片）
    var MD = window.AIChatMD;
    C.$messages.innerHTML = '';
    C.chatHistory.forEach(function(m) {
      if (m._auto) return;
      if (/^\[第\d+题\]/.test(m.content)) return;
      if (m.role === 'user') {
        var bubble = addMessageBubble('user', m.content);
        if (m._attachments && m._attachments.length > 0) {
          var attachDiv = document.createElement('div');
          attachDiv.className = 'attach-hist';
          m._attachments.forEach(function(a) {
            var isImg = (a.type || '').startsWith('image/');
            var chip = document.createElement('span');
            chip.className = 'attach-hist-chip';
            chip.textContent = (isImg ? '📷 ' : '📄 ') + MD.escapeHtml(a.name);
            attachDiv.appendChild(chip);
          });
          bubble.appendChild(attachDiv);
        }
      } else if (m.role === 'assistant') {
        addMessageBubble('ai', m.content);
      } else if (m.role === '_agent_tool') {
        // 降级渲染 Agent 工具（简单文字）
        var label = m.name || '工具调用';
        var icon = {open_tab:'📄',click_element:'🖱️',type_text:'⌨️',get_page_structure:'🔍',get_page_text:'📖',web_search:'🌐',list_tabs:'📑',scroll_page:'↕️',wait_for_element:'⏳',screenshot:'📸',eval_js:'⚡',fetch_webpage:'📥'}[m.name] || '🔧';
        addMessageBubble('ai', icon + ' ' + label + (m.status === 'error' ? ' ❌ 失败' : m.status === 'done' ? ' ✅ 完成' : ' ⏳ 执行中...'));
      }
    });
    if (C.chatHistory.length === 0) showWelcome();
  }

  function showWelcome() {
    var C = window.__CTX__;
    C.$messages.innerHTML = '';
    var wel = document.createElement('div');
    wel.className = 'welcome';
    wel.id = 'welcome';
    wel.innerHTML =
      I.STAR +
      '<h3>AI 对话助手</h3>' +
      '<p>输入消息开始对话<br>首次使用请先前往设置配置 API</p>';
    C.$messages.appendChild(wel);
  }

  async function newChat() {
    var C = window.__CTX__;
    if (C.isStreaming) return;
    if (C.currentConvId && C.chatHistory.length > 0) {
      await saveConversation();
    }
    C.currentConvId = null;
    C.chatHistory = [];
    C.autoAnswerData = null;
    clearAutoResultsPanel();
    showWelcome();
    C.$input.value = '';
    if (C.autoResize) C.autoResize();
    await chrome.storage.local.set({ currentConvId: null });
    renderHistoryList();
  }

  async function deleteConversation(id) {
    var C = window.__CTX__;
    var idx = C.conversations.findIndex(function(c) { return c.id === id; });
    if (idx >= 0) {
      C.conversations.splice(idx, 1);
      if (C.currentConvId === id) {
        C.currentConvId = null;
        C.chatHistory = [];
        C.autoAnswerData = null;
        clearAutoResultsPanel();
        showWelcome();
      }
      await chrome.storage.local.set({ conversations: C.conversations, currentConvId: C.currentConvId });
      renderHistoryList();
    }
  }

  async function switchConversation(id) {
    var C = window.__CTX__;
    if (C.isStreaming) return;
    if (C.currentConvId && C.chatHistory.length > 0) {
      await saveConversation();
    }
    var conv = C.conversations.find(function(c) { return c.id === id; });
    if (!conv) return;
    C.currentConvId = conv.id;
    C.chatHistory = conv.messages.slice();
    C.autoAnswerData = conv.autoAnswerData || null;
    clearAutoResultsPanel();
    C.$messages.style.scrollBehavior = 'auto';
    restoreMessagesFromHistory();
    if (C.autoAnswerData) window.AIChatAutoAnswer.restoreAutoResultsPanel(C.autoAnswerData);
    C.$messages.scrollTop = C.$messages.scrollHeight;
    C.$messages.style.scrollBehavior = '';
    await chrome.storage.local.set({ currentConvId: C.currentConvId });
    closeHistoryPanel();
  }

  function clearAutoResultsPanel() {
    var C = window.__CTX__;
    if (C.$autoResults) { C.$autoResults.remove(); C.$autoResults = null; }
  }

  function openHistoryPanel() {
    var C = window.__CTX__;
    if (C.$historyPanel) {
      C.$historyPanel.style.display = 'flex';
      renderHistoryList();
    }
  }

  function closeHistoryPanel() {
    var C = window.__CTX__;
    if (C.$historyPanel) C.$historyPanel.style.display = 'none';
  }

  function renderHistoryList() {
    var C = window.__CTX__;
    if (!C.$historyList) return;
    if (C.conversations.length === 0) {
      C.$historyList.innerHTML =
        '<div class="history-empty">' +
          I.HISTORY +
          '<span>暂无历史记录</span>' +
        '</div>';
      return;
    }
    C.$historyList.innerHTML = C.conversations.map(function(c) {
      var msgCount = c.messages ? c.messages.length : 0;
      var date = new Date(c.updatedAt || c.createdAt);
      var dateStr = (date.getMonth() + 1) + '/' + date.getDate() + ' ' +
        date.getHours().toString().padStart(2, '0') + ':' +
        date.getMinutes().toString().padStart(2, '0');
      var isActive = c.id === C.currentConvId;
      return '<div class="history-item' + (isActive ? ' active' : '') + '" data-id="' + c.id + '">' +
        '<div class="history-item-info">' +
          '<div class="history-item-title">' + MD.escapeHtml(c.title || '新对话') + '</div>' +
          '<div class="history-item-meta">' +
            '<span>' + msgCount + ' 条消息</span>' +
            '<span>' + dateStr + '</span>' +
          '</div>' +
        '</div>' +
        '<button class="history-item-del" data-del="' + c.id + '" title="删除">' + I.CLEAR + '</button>' +
      '</div>';
    }).join('');

    C.$historyList.querySelectorAll('.history-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.history-item-del')) return;
        switchConversation(el.dataset.id);
      });
    });
    C.$historyList.querySelectorAll('.history-item-del').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteConversation(el.dataset.del);
      });
    });
  }

  // ======================== 消息渲染辅助 (需要 context) ========================

  function addCopyButton(bubble, rawText) {
    // 移除旧按钮（防重复）
    var old = bubble.querySelector('.copy-ai-btn');
    if (old) old.remove();
    var btn = document.createElement('button');
    btn.className = 'copy-ai-btn';
    btn.title = '复制原始文本';
    btn.textContent = '📋 复制';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(rawText).then(function() {
        btn.textContent = '✓ 已复制';
        setTimeout(function() { btn.textContent = '📋 复制'; }, 800);
      }).catch(function() {
        btn.textContent = '✗ 失败';
        setTimeout(function() { btn.textContent = '📋 复制'; }, 800);
      });
    });
    bubble.appendChild(btn);
  }

  function addMessageBubble(role, text) {
    var C = window.__CTX__;
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = MD.renderMarkdown(text);
    wrap.appendChild(bubble);
    if (role === 'ai' && text) {
      addCopyButton(bubble, text);
    }
    var ts = document.createElement('div');
    ts.className = 'ts';
    ts.textContent = timeStr();
    wrap.appendChild(ts);
    C.$messages.appendChild(wrap);
    return bubble;
  }

  function addMessage(role, text) {
    var C = window.__CTX__;
    var wel = C.shadow.getElementById('welcome');
    if (wel) wel.remove();
    var bubble = addMessageBubble(role, text);
    scrollToBottom();
    return bubble;
  }

  function addLoading() {
    var C = window.__CTX__;
    var wel = C.shadow.getElementById('welcome');
    if (wel) wel.remove();
    var wrap = document.createElement('div');
    wrap.className = 'msg ai';
    wrap.id = 'loading-msg';
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
    wrap.appendChild(bubble);
    C.$messages.appendChild(wrap);
    scrollToBottom();
  }

  function removeLoading() {
    var C = window.__CTX__;
    var el = C.shadow.getElementById('loading-msg');
    if (el) el.remove();
  }

  function addError(text) {
    var C = window.__CTX__;
    var wrap = document.createElement('div');
    wrap.className = 'msg ai';
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = '<div class="err">' + MD.escapeHtml(text) + '</div>';
    wrap.appendChild(bubble);
    C.$messages.appendChild(wrap);
    scrollToBottom();
  }

  function scrollToBottom() {
    var C = window.__CTX__;
    requestAnimationFrame(function() {
      C.$messages.scrollTop = C.$messages.scrollHeight;
    });
  }

  function timeStr() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function bindHistoryEvents() {
    var C = window.__CTX__;
    C.shadow.getElementById('btn-history').addEventListener('click', openHistoryPanel);
    C.shadow.getElementById('btn-history-back').addEventListener('click', closeHistoryPanel);
    C.shadow.getElementById('btn-history-new').addEventListener('click', function() { closeHistoryPanel(); newChat(); });
    C.shadow.getElementById('btn-new-chat').addEventListener('click', newChat);
  }

  // ======================== 导出 ========================

  window.AIChatHistory = {
    // Core
    loadConversations: loadConversations,
    saveConversation: saveConversation,
    newChat: newChat,
    deleteConversation: deleteConversation,
    switchConversation: switchConversation,
    genConvTitle: genConvTitle,
    // UI
    bindEvents: bindHistoryEvents,
    renderHistoryList: renderHistoryList,
    openHistoryPanel: openHistoryPanel,
    closeHistoryPanel: closeHistoryPanel,
    showWelcome: showWelcome,
    restoreMessagesFromHistory: restoreMessagesFromHistory,
    clearAutoResultsPanel: clearAutoResultsPanel,
    // Messages
    addMessage: addMessage,
    addMessageBubble: addMessageBubble,
    addCopyButton: addCopyButton,
    addLoading: addLoading,
    removeLoading: removeLoading,
    addError: addError,
    scrollToBottom: scrollToBottom,
    timeStr: timeStr
  };

})();
