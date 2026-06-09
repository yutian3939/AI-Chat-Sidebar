// ============================================================
// content/template.js — 侧边栏 HTML 模板
// ============================================================
'use strict';
window.AIChatTemplate = function(I) {
  return '<div id="resize-handle"></div>' +
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
        I.STAR +
        '<h3>AI 对话助手</h3>' +
        '<p>点击右下角悬浮球开始对话<br>首次使用请先前往设置配置 API</p>' +
      '</div>' +
    '</div>' +
    '<div class="history-panel" id="history-panel" style="display:none">' +
      '<div class="history-head">' +
        '<button class="icon-btn" id="btn-history-back" title="返回">' + I.CLOSE + '</button>' +
        '<span class="history-title">历史记录</span>' +
        '<button class="icon-btn" id="btn-history-new" title="新建对话">' + I.NEW + '</button>' +
      '</div>' +
      '<div class="history-list" id="history-list">' +
        '<div class="history-empty">' +
          I.HISTORY +
          '<span>暂无历史记录</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
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
              '<button class="toggle-vis" id="settings-toggle-key" title="显示/隐藏">' + I.EYE + '</button>' +
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
          '<button class="settings-btn primary" id="btn-settings-save" style="width:100%;justify-content:center;margin-top:8px">' + I.CHECK + '保存供应商</button>' +
        '</div>' +
        '<div class="settings-section">' +
          '<h3>主模型</h3>' +
          '<div class="field"><select id="settings-current-model"></select></div>' +
          '<div class="settings-actions">' +
            '<button class="settings-btn outline" id="btn-settings-test">' + I.TEST + '测试连接</button>' +
          '</div>' +
          '<div class="field">' +
            '<label for="settings-system-prompt">系统提示词</label>' +
            '<textarea id="settings-system-prompt" rows="3" placeholder="你是一个有帮助的AI助手。"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<h3>视觉模型</h3>' +
          '<p class="settings-hint-sm">用于处理聊天中上传的图片</p>' +
          '<div class="field">' +
            '<select id="settings-vision-mode">' +
              '<option value="none">无 (忽略图片)</option>' +
              '<option value="main">使用主模型 (需支持多模态)</option>' +
              '<option value="vision">使用视觉模型转述</option>' +
            '</select>' +
          '</div>' +
          '<div id="vision-model-fields" style="display:none">' +
            '<div class="field"><select id="settings-vision-model"></select></div>' +
            '<div class="settings-actions">' +
              '<button class="settings-btn outline" id="btn-vision-test">' + I.TEST + '测试连接</button>' +
            '</div>' +
            '<div class="field">' +
              '<label for="settings-vision-prompt">视觉系统提示词</label>' +
              '<textarea id="settings-vision-prompt" rows="2" placeholder="请简洁描述图片内容。"></textarea>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section">' +
          '<h3>答题设置</h3>' +
          '<label class="switch-row">' +
            '<span class="switch-label">自动答题时跳过已答题目</span>' +
            '<span class="switch-track">' +
              '<input type="checkbox" id="settings-skip-answered" checked>' +
              '<span class="switch-track-bg"></span>' +
              '<span class="switch-thumb"></span>' +
            '</span>' +
          '</label>' +
          '<label class="switch-row">' +
            '<span class="switch-label">快速截图（松开鼠标直接发送）</span>' +
            '<span class="switch-track">' +
              '<input type="checkbox" id="settings-quick-shot">' +
              '<span class="switch-track-bg"></span>' +
              '<span class="switch-thumb"></span>' +
            '</span>' +
          '</label>' +
          '<label class="switch-row">' +
            '<span class="switch-label">页面感知（打开侧边栏时自动添加上下文）</span>' +
            '<span class="switch-track">' +
              '<input type="checkbox" id="settings-auto-context">' +
              '<span class="switch-track-bg"></span>' +
              '<span class="switch-thumb"></span>' +
            '</span>' +
          '</label>' +
        '</div>' +
        '<div class="settings-section">' +
          '<h3>Agent 设置</h3>' +
          '<p class="settings-hint-sm">开启后 AI 可自动操作浏览器（打开网页、点击、输入等）</p>' +
          '<label class="switch-row">' +
            '<span class="switch-label">启用 Agent 模式</span>' +
            '<span class="switch-track">' +
              '<input type="checkbox" id="settings-agent-mode">' +
              '<span class="switch-track-bg"></span>' +
              '<span class="switch-thumb"></span>' +
            '</span>' +
          '</label>' +
          '<div class="field">' +
            '<label for="settings-agent-max-steps">最大步数（0 = 不限制）</label>' +
            '<input type="number" id="settings-agent-max-steps" value="5" min="0" max="999" step="1">' +
            '<p class="settings-hint-sm">简单任务 3-5 步，复杂任务 8-15 步。输入 0 不限制步数。</p>' +
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
    '<div class="auto-row" id="auto-row" style="display:none">' +
      '<button class="auto-btn" id="btn-auto" title="自动答题">' +
        '<div class="auto-btn-fill" id="auto-btn-fill" style="width:0%"></div>' +
        '<span class="auto-btn-text" id="auto-btn-text">' + I.AUTO + '自动答题</span>' +
      '</button>' +
      '<span class="auto-status" id="auto-status"></span>' +
    '</div>' +
    // Agent 状态栏
    '<div class="agent-status-bar" id="agent-status-bar" style="display:none">' +
      '<span class="agent-dot" id="agent-dot"></span>' +
      '<span class="agent-text" id="agent-text">Agent 就绪</span>' +
      '<span class="agent-step" id="agent-step"></span>' +
      '<button class="agent-stop-btn" id="btn-agent-stop" title="停止Agent">⏹</button>' +
    '</div>' +
    '<div class="top-row" id="top-row">' +
      '<button class="attach-btn" id="btn-attach" title="添加图片/文件">' + I.PLUS + '</button>' +
      '<button class="attach-btn" id="btn-screenshot" title="框选截图">' + I.SCISSORS + '</button>' +
      '<button class="attach-btn agent-toggle-btn" id="btn-agent-toggle" title="Agent模式：AI可自动操作浏览器">' + I.AGENT + '</button>' +
      '<div class="attachments-list" id="attachments-list"></div>' +
    '</div>' +
    '<div class="input-area" id="input-area">' +
      '<div class="input-wrap">' +
        '<textarea id="input" placeholder="输入消息… (Enter 发送, Shift+Enter 换行)" rows="1"></textarea>' +
      '</div>' +
      '<button class="send-btn" id="btn-send" title="发送">' + I.SEND + '</button>' +
    '</div>' +
    '<input type="file" id="file-input" style="display:none" accept="image/*,.txt,.md,.json,.csv" multiple>';
};
