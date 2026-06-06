// ============================================================
// content/settings-panel.js — 设置面板 (供应商/模型/主题管理)
// 通过 window.__CTX__ 获取共享状态和 DOM 引用
// ============================================================
'use strict';
(function() {

  var DEFAULT_PROVIDERS = [
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: [] },
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', models: [] },
    { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', models: [] },
    { id: 'glm', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', models: [] },
    { id: 'moonshot', name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', apiKey: '', models: [] }
  ];

  function isCustomProvider(id) { return (id || '').indexOf('custom_') === 0; }

  function getAllProviders() {
    var C = window.__CTX__;
    var result = [];
    DEFAULT_PROVIDERS.forEach(function(d) {
      var saved = findInProviders(d.id);
      result.push(saved ? { id: d.id, name: saved.name || d.name, baseUrl: saved.baseUrl || d.baseUrl, apiKey: saved.apiKey || '', models: saved.models || d.models } : { id: d.id, name: d.name, baseUrl: d.baseUrl, apiKey: '', models: d.models.slice() });
    });
    C.providers.forEach(function(p) {
      if (isCustomProvider(p.id) && !DEFAULT_PROVIDERS.some(function(d) { return d.id === p.id; })) {
        result.push({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey || '', models: p.models || [] });
      }
    });
    return result;
  }

  function findInProviders(id) {
    var C = window.__CTX__;
    for (var i = 0; i < C.providers.length; i++) {
      if (C.providers[i].id === id) return C.providers[i];
    }
    return null;
  }

  function findProvider(id) {
    var all = getAllProviders();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  function findProviderByModel(modelName) {
    var all = getAllProviders();
    for (var i = 0; i < all.length; i++) {
      if (all[i].models.indexOf(modelName) >= 0) return all[i];
    }
    return null;
  }

  async function persistProviders() {
    var C = window.__CTX__;
    var all = getAllProviders();
    var modified = [];
    all.forEach(function(p) {
      if (isCustomProvider(p.id) || p.apiKey) {
        modified.push({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models });
      }
    });
    await chrome.storage.local.set({ providers: modified, currentProviderId: C.currentProviderId, currentModel: C.currentModel });
  }

  function renderProviderSelect() {
    var C = window.__CTX__;
    if (!C.$settingsProvider) return;
    var all = getAllProviders();
    var html = '';
    all.forEach(function(p) {
      var sel = p.id === C.editingProviderId ? ' selected' : '';
      html += '<option value="' + p.id + '"' + sel + '>' + p.name + '</option>';
    });
    html += '<option value="__custom__">＋自定义</option>';
    C.$settingsProvider.innerHTML = html;
  }

  function renderModelChips() {
    var C = window.__CTX__;
    if (!C.$settingsModelChips) return;
    var provider = findProvider(C.editingProviderId);
    var models = provider ? provider.models : [];
    var html = '';
    models.forEach(function(m) {
      html += '<span class="model-chip" data-model="' + m + '">' + m + '<span class="del">×</span></span>';
    });
    C.$settingsModelChips.innerHTML = html;
    C.$settingsModelChips.querySelectorAll('.model-chip').forEach(function(chip) {
      chip.addEventListener('click', function() { removeModel(chip.dataset.model); });
    });
  }

  function renderCurrentModelSelect() {
    var C = window.__CTX__;
    if (!C.$settingsCurrentModel) return;
    var all = getAllProviders();
    var withKey = [];
    all.forEach(function(p) { if (p.apiKey && p.models.length > 0) withKey.push(p); });
    if (withKey.length === 0) {
      C.$settingsCurrentModel.innerHTML = '<option value="">请先配置供应商的 API Key 和模型</option>';
      return;
    }
    var html = '';
    withKey.forEach(function(p) {
      html += '<optgroup label="' + p.name + '">';
      p.models.forEach(function(m) {
        var val = p.id + '::' + m;
        var sel = (p.id === C.currentProviderId && m === C.currentModel) ? ' selected' : '';
        html += '<option value="' + val + '"' + sel + '>' + m + '</option>';
      });
      html += '</optgroup>';
    });
    C.$settingsCurrentModel.innerHTML = html;
  }

  function fillProviderFields() {
    var C = window.__CTX__;
    var provider = findProvider(C.editingProviderId);
    if (!provider) return;
    C.$settingsBaseUrl.value = provider.baseUrl || '';
    C.$settingsApiKey.value = provider.apiKey || '';
    C.$settingsCustomNameWrap.style.display = isCustomProvider(C.editingProviderId) ? 'block' : 'none';
    if (isCustomProvider(C.editingProviderId)) C.$settingsCustomName.value = provider.name || '';
    renderModelChips();
    renderCurrentModelSelect();
  }

  async function addModel() {
    var C = window.__CTX__;
    var name = C.$settingsAddModel.value.trim();
    if (!name) return;
    var provider = findProvider(C.editingProviderId);
    if (!provider) return;
    if (provider.models.indexOf(name) >= 0) { showSettingsStatus('该模型已存在', 'error'); return; }
    provider.models.push(name);
    upsertProvider(provider);
    await persistProviders();
    C.$settingsAddModel.value = '';
    renderModelChips();
    renderCurrentModelSelect();
    showSettingsStatus('已添加模型: ' + name, 'success');
  }

  async function removeModel(model) {
    var C = window.__CTX__;
    var provider = findProvider(C.editingProviderId);
    if (!provider) return;
    var idx = provider.models.indexOf(model);
    if (idx >= 0) provider.models.splice(idx, 1);
    if (C.currentModel === model) C.currentModel = provider.models[0];
    upsertProvider(provider);
    await persistProviders();
    renderModelChips();
    renderCurrentModelSelect();
    showSettingsStatus('已删除模型: ' + model, 'success');
  }

  function upsertProvider(p) {
    var C = window.__CTX__;
    for (var i = 0; i < C.providers.length; i++) {
      if (C.providers[i].id === p.id) { C.providers[i] = { id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models }; return; }
    }
    C.providers.push({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models });
  }

  async function saveProviderData() {
    var C = window.__CTX__;
    var baseUrl = C.$settingsBaseUrl.value.trim();
    if (!baseUrl) { showSettingsStatus('请填写 Base URL', 'error'); return; }
    var apiKey = C.$settingsApiKey.value.trim();
    var def = DEFAULT_PROVIDERS.find(function(d) { return d.id === C.editingProviderId; });
    var name = isCustomProvider(C.editingProviderId) ? (C.$settingsCustomName.value.trim() || '自定义供应商') : (def ? def.name : '');
    if (isCustomProvider(C.editingProviderId) && !C.$settingsCustomName.value.trim()) { showSettingsStatus('请填写供应商名称', 'error'); return; }
    var provider = findProvider(C.editingProviderId);
    var models = provider ? provider.models : [];
    upsertProvider({ id: C.editingProviderId, name: name, baseUrl: baseUrl, apiKey: apiKey, models: models });
    await persistProviders();
    renderProviderSelect();
    renderModelChips();
    renderCurrentModelSelect();
    showSettingsStatus('供应商已保存', 'success');
  }

  async function deleteProvider() {
    var C = window.__CTX__;
    if (!isCustomProvider(C.editingProviderId)) return;
    var pIdx = -1;
    for (var i = 0; i < C.providers.length; i++) {
      if (C.providers[i].id === C.editingProviderId) { pIdx = i; break; }
    }
    if (pIdx < 0) return;
    C.providers.splice(pIdx, 1);
    if (C.currentProviderId === C.editingProviderId) {
      var all = getAllProviders();
      C.currentProviderId = all.length > 0 ? all[0].id : 'openai';
      C.currentModel = (all[0] && all[0].models[0]) || 'gpt-3.5-turbo';
    }
    C.editingProviderId = C.currentProviderId;
    await persistProviders();
    await chrome.storage.local.set({ currentProviderId: C.currentProviderId, currentModel: C.currentModel });
    renderProviderSelect();
    fillProviderFields();
    showSettingsStatus('供应商已删除', 'success');
  }

  async function syncActiveSettings() {
    var C = window.__CTX__;
    var parts = (C.$settingsCurrentModel.value || '').split('::');
    C.currentProviderId = parts[0] || C.currentProviderId;
    C.currentModel = parts[1] || C.currentModel;
    var provider = findProvider(C.currentProviderId);
    if (!provider) return;
    await chrome.storage.sync.set({ apiEndpoint: provider.baseUrl, apiKey: provider.apiKey, model: C.currentModel, systemPrompt: C.$settingsSystemPrompt.value.trim(), theme: C.$settingsTheme.value });
    await persistProviders();
  }

  async function testConnectionFromPanel() {
    var C = window.__CTX__;
    var parts = (C.$settingsCurrentModel.value || '').split('::');
    var provider = parts[0] ? findProvider(parts[0]) : null;
    if (!provider || !provider.apiKey) { showSettingsStatus('请先在供应商中填写 API Key', 'error'); return; }
    C.$btnSettingsTest.disabled = true;
    var origHTML = C.$btnSettingsTest.innerHTML;
    C.$btnSettingsTest.textContent = '测试中...';
    try {
      var result = await chrome.runtime.sendMessage({ type: 'test-connection', settings: { apiEndpoint: provider.baseUrl, apiKey: provider.apiKey, model: parts[1] } });
      if (result.success) showSettingsStatus('✓ 连接成功', 'success', C.$btnSettingsTest);
      else showSettingsStatus('✗ ' + result.error, 'error', C.$btnSettingsTest);
    } catch (err) {
      showSettingsStatus('✗ ' + err.message, 'error', C.$btnSettingsTest);
    } finally {
      C.$btnSettingsTest.disabled = false;
      C.$btnSettingsTest.innerHTML = origHTML;
    }
  }

  function showSettingsStatus(text, type, targetEl) {
    var C = window.__CTX__;
    // 如果指定了 targetEl → 在其后面显示内联状态
    if (targetEl) {
      var old = targetEl.nextElementSibling;
      if (old && old.classList.contains('test-inline-status')) old.remove();
      var span = document.createElement('span');
      span.className = 'test-inline-status ' + type;
      span.textContent = text;
      targetEl.insertAdjacentElement('afterend', span);
      clearTimeout(targetEl._statusTimer);
      targetEl._statusTimer = setTimeout(function() { span.remove(); }, 5000);
      return;
    }
    // 否则回退到全局状态栏
    if (!C.$settingsStatus) return;
    C.$settingsStatus.textContent = text;
    C.$settingsStatus.className = 'settings-status show ' + type;
    clearTimeout(C.$settingsStatus._timer);
    C.$settingsStatus._timer = setTimeout(function() {
      if (C.$settingsStatus) C.$settingsStatus.className = 'settings-status';
    }, 5000);
  }

  function openSettingsPanel() {
    var C = window.__CTX__;
    if (!C.$settingsPanel) return;
    if (C.$historyPanel) C.$historyPanel.style.display = 'none';
    loadSettingsToPanel();
    C.$settingsPanel.style.display = 'flex';
  }
  function closeSettingsPanel() {
    var C = window.__CTX__;
    if (C.$settingsPanel) C.$settingsPanel.style.display = 'none';
  }

  async function loadSettingsToPanel() {
    await loadProvidersFromStorage();
    renderProviderSelect();
    fillProviderFields();
    renderCurrentModelSelect();
    var data = await chrome.storage.local.get(['systemPrompt', 'theme', 'colorScheme', 'visionMode', 'visionModelProvider', 'visionModel', 'visionPrompt', 'skipAnswered', 'autoContext', 'agentMode', 'agentMaxSteps']);
    var C = window.__CTX__;
    C.$settingsSystemPrompt.value = data.systemPrompt || '你是一个有帮助的AI助手。';
    C.$settingsTheme.value = data.theme || 'system';
    C.colorScheme = data.colorScheme || 'purple';
    C.skipAnswered = data.skipAnswered !== false; // 默认 true
    if (C.$settingsSkipAnswered) C.$settingsSkipAnswered.checked = C.skipAnswered;
    C.autoContext = !!data.autoContext;
    if (C.$settingsAutoContext) C.$settingsAutoContext.checked = C.autoContext;
    C.visionMode = data.visionMode || 'none';
    C.visionModelProvider = data.visionModelProvider || 'openai';
    C.visionModel = data.visionModel || '';
    C.$settingsVisionMode.value = C.visionMode;
    C.$settingsVisionPrompt.value = data.visionPrompt || '请简洁描述图片内容。';
    // Agent 设置
    C.agentMode = !!data.agentMode;
    C.agentMaxSteps = data.agentMaxSteps != null ? data.agentMaxSteps : 5;
    var $agentMode = C.shadow.getElementById('settings-agent-mode');
    if ($agentMode) $agentMode.checked = C.agentMode;
    var $agentMaxSteps = C.shadow.getElementById('settings-agent-max-steps');
    if ($agentMaxSteps) $agentMaxSteps.value = String(C.agentMaxSteps);
    renderColorSwatches();
    renderVisionFields();
    hideSettingsStatus();
  }

  // ======================== 视觉模型 ========================

  function renderVisionFields() {
    var C = window.__CTX__;
    var show = C.visionMode === 'vision';
    C.$visionModelFields.style.display = show ? 'block' : 'none';
    if (show) renderVisionModelSelect();
  }

  function renderVisionModelSelect() {
    var C = window.__CTX__;
    if (!C.$settingsVisionModel) return;
    var all = getAllProviders();
    var withKey = [];
    all.forEach(function(p) { if (p.apiKey && p.models.length > 0) withKey.push(p); });
    if (withKey.length === 0) {
      C.$settingsVisionModel.innerHTML = '<option value="">请先配置供应商的 API Key 和模型</option>';
      return;
    }
    var html = '';
    withKey.forEach(function(p) {
      html += '<optgroup label="' + p.name + '">';
      p.models.forEach(function(m) {
        var val = p.id + '::' + m;
        var sel = (p.id === C.visionModelProvider && m === C.visionModel) ? ' selected' : '';
        html += '<option value="' + val + '"' + sel + '>' + m + '</option>';
      });
      html += '</optgroup>';
    });
    C.$settingsVisionModel.innerHTML = html;
  }

  async function saveVisionSettings() {
    var C = window.__CTX__;
    var visionParts = (C.$settingsVisionModel.value || '').split('::');
    C.visionMode = C.$settingsVisionMode.value;
    C.visionModelProvider = visionParts[0] || '';
    C.visionModel = visionParts[1] || '';
    await chrome.storage.local.set({
      visionMode: C.visionMode,
      visionModelProvider: C.visionModelProvider,
      visionModel: C.visionModel
    });
  }

  async function testVisionConnection() {
    var C = window.__CTX__;
    var visionParts = (C.$settingsVisionModel.value || '').split('::');
    var provider = visionParts[0] ? findProvider(visionParts[0]) : null;
    if (!provider || !provider.apiKey) { showSettingsStatus('请先在供应商中填写 API Key', 'error'); return; }
    if (!C.$btnVisionTest) return;
    C.$btnVisionTest.disabled = true;
    var origText = C.$btnVisionTest.textContent;
    C.$btnVisionTest.textContent = '测试中...';
    try {
      var result = await chrome.runtime.sendMessage({ type: 'test-connection', settings: { apiEndpoint: provider.baseUrl, apiKey: provider.apiKey, model: visionParts[1] } });
      if (result.success) showSettingsStatus('✓ 连接成功', 'success', C.$btnVisionTest);
      else showSettingsStatus('✗ ' + result.error, 'error', C.$btnVisionTest);
    } catch (err) {
      showSettingsStatus('✗ ' + err.message, 'error', C.$btnVisionTest);
    } finally {
      C.$btnVisionTest.disabled = false;
      C.$btnVisionTest.textContent = origText;
    }
  }

  // ======================== 主题颜色选择器 ========================

  function renderColorSwatches() {
    var C = window.__CTX__;
    var SCHEMES = window.AIChatColorSchemes;
    if (!C.$colorSwatches) return;

    var html = '';
    Object.keys(SCHEMES).forEach(function(id) {
      var scheme = SCHEMES[id];
      var seed = scheme.seed;
      var active = C.colorScheme === id ? ' active' : '';
      html += '<button class="color-swatch' + active + '" data-scheme="' + id +
        '" style="--swatch-start:' + seed + ';--swatch-end:' + seed + 'CC;" title="' + scheme.name + '"></button>';
    });
    C.$colorSwatches.innerHTML = html;

    C.$colorSwatches.querySelectorAll('.color-swatch').forEach(function(sw) {
      sw.addEventListener('click', function() {
        var schemeId = sw.dataset.scheme;
        C.colorScheme = schemeId;
        if (C.applyColorScheme) C.applyColorScheme(schemeId);
        chrome.storage.local.set({ colorScheme: schemeId });
        renderColorSwatches();
      });
    });
  }

  async function loadProvidersFromStorage() {
    var C = window.__CTX__;
    var data = await chrome.storage.local.get(['providers', 'currentProviderId', 'currentModel']);
    C.providers = data.providers || [];
    C.currentProviderId = data.currentProviderId || 'openai';
    C.currentModel = data.currentModel || 'gpt-3.5-turbo';
    C.editingProviderId = C.currentProviderId;
    var found = findProviderByModel(C.currentModel);
    if (!found) { var p = findProvider(C.currentProviderId); C.currentModel = (p && p.models[0]) || 'gpt-3.5-turbo'; }
  }

  // ======================== 事件绑定 ========================

  function bindSettingsEvents() {
    var C = window.__CTX__;

    C.$settingsProvider.addEventListener('change', function() {
      var newVal = C.$settingsProvider.value;
      if (newVal === '__custom__') {
        var customId = 'custom_' + Date.now();
        C.editingProviderId = customId;
        C.providers.push({ id: customId, name: '自定义供应商', baseUrl: '', apiKey: '', models: [] });
        persistProviders();
        renderProviderSelect();
        fillProviderFields();
        C.$settingsCustomName.focus();
        return;
      }
      C.editingProviderId = newVal;
      fillProviderFields();
    });

    C.$settingsCurrentModel.addEventListener('change', function() {
      var parts = (C.$settingsCurrentModel.value || '').split('::');
      C.currentProviderId = parts[0];
      C.currentModel = parts[1];
      syncActiveSettings();
    });

    C.$settingsTheme.addEventListener('change', function() {
      C.themePref = C.$settingsTheme.value;
      if (C.applyTheme) C.applyTheme(C.themePref);
      chrome.storage.local.set({ theme: C.$settingsTheme.value });
      chrome.storage.sync.set({ theme: C.$settingsTheme.value });
    });

    C.$settingsSystemPrompt.addEventListener('blur', function() {
      var val = C.$settingsSystemPrompt.value.trim();
      chrome.storage.local.set({ systemPrompt: val });
      chrome.storage.sync.set({ systemPrompt: val });
    });

    C.$btnAddModel.addEventListener('click', addModel);
    C.$settingsAddModel.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); addModel(); }
    });

    C.$toggleKey.addEventListener('click', function() {
      C.$settingsApiKey.type = C.$settingsApiKey.type === 'password' ? 'text' : 'password';
    });

    C.$btnSettingsBack.addEventListener('click', closeSettingsPanel);
    C.$btnSettingsSave.addEventListener('click', saveProviderData);
    C.$btnDeleteProvider.addEventListener('click', deleteProvider);
    C.$btnSettingsTest.addEventListener('click', testConnectionFromPanel);

    // 视觉模型事件
    C.$settingsVisionMode.addEventListener('change', function() {
      C.visionMode = C.$settingsVisionMode.value;
      renderVisionFields();
      saveVisionSettings();
    });
    C.$settingsVisionModel.addEventListener('change', saveVisionSettings);
    C.$settingsVisionPrompt.addEventListener('blur', function() {
      var val = C.$settingsVisionPrompt.value.trim();
      chrome.storage.local.set({ visionPrompt: val });
    });
    if (C.$btnVisionTest) {
      C.$btnVisionTest.addEventListener('click', testVisionConnection);
    }

    // 答题设置
    if (C.$settingsSkipAnswered) {
      C.$settingsSkipAnswered.addEventListener('change', function() {
        C.skipAnswered = C.$settingsSkipAnswered.checked;
        chrome.storage.local.set({ skipAnswered: C.skipAnswered });
      });
    }
    // 页面感知
    if (C.$settingsAutoContext) {
      C.$settingsAutoContext.addEventListener('change', function() {
        C.autoContext = C.$settingsAutoContext.checked;
        chrome.storage.local.set({ autoContext: C.autoContext });
      });
    }

    // Agent 设置
    var $agentMode = C.shadow.getElementById('settings-agent-mode');
    if ($agentMode) {
      $agentMode.addEventListener('change', function() {
        C.agentMode = $agentMode.checked;
        chrome.storage.local.set({ agentMode: C.agentMode });
        if (typeof C.updateAgentToggleUI === 'function') C.updateAgentToggleUI();
      });
    }
    var $agentMaxSteps = C.shadow.getElementById('settings-agent-max-steps');
    if ($agentMaxSteps) {
      var saveMaxSteps = function() {
        var v = parseInt($agentMaxSteps.value);
        C.agentMaxSteps = isNaN(v) ? 5 : Math.max(0, Math.min(999, v));
        $agentMaxSteps.value = C.agentMaxSteps;
        chrome.storage.local.set({ agentMaxSteps: C.agentMaxSteps });
      };
      $agentMaxSteps.addEventListener('input', saveMaxSteps);
      $agentMaxSteps.addEventListener('blur', saveMaxSteps);
    }
  }

  // ======================== 导出 ========================

  window.AIChatSettings = {
    bindEvents: bindSettingsEvents,
    openSettingsPanel: openSettingsPanel,
    closeSettingsPanel: closeSettingsPanel,
    loadSettingsToPanel: loadSettingsToPanel,
    loadProvidersFromStorage: loadProvidersFromStorage,
    syncActiveSettings: syncActiveSettings,
    renderVisionFields: renderVisionFields
  };

})();
