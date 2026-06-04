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
    C.$messages.innerHTML = '';
    C.chatHistory.forEach(function(m) {
      if (m._auto) return;
      if (/^\[第\d+题\]/.test(m.content)) return;
      if (m.role === 'user') addMessageBubble('user', m.content);
      else if (m.role === 'assistant') addMessageBubble('ai', m.content);
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
      '<svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>' +
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
    restoreMessagesFromHistory();
    if (C.autoAnswerData) window.AIChatAutoAnswer.restoreAutoResultsPanel(C.autoAnswerData);
    scrollToBottom();
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
          '<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>' +
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

  function addMessageBubble(role, text) {
    var C = window.__CTX__;
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = MD.renderMarkdown(text);
    wrap.appendChild(bubble);
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
    addLoading: addLoading,
    removeLoading: removeLoading,
    addError: addError,
    scrollToBottom: scrollToBottom,
    timeStr: timeStr
  };

})();
