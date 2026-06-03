// ============================================================
// settings.js - 设置页面逻辑
// ============================================================

const DEFAULTS = {
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  systemPrompt: '你是一个有帮助的AI助手。',
  theme: 'system'
};

const $ = (id) => document.getElementById(id);

/**
 * 自动补全 API 端点路径
 */
function normalizeEndpoint(url) {
  if (!url) return url;
  let endpoint = url.trim().replace(/\/+$/, '');
  if (endpoint.endsWith('/chat/completions')) return endpoint;
  if (endpoint.endsWith('/v1')) return endpoint + '/chat/completions';
  if (/\/v\d+$/.test(endpoint)) return endpoint + '/chat/completions';
  return endpoint + '/chat/completions';
}

// 加载已保存的设置
async function loadSettings() {
  const settings = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    const el = $(key);
    if (el) el.value = settings[key] || defaultVal;
  }
}

// 保存设置
async function saveSettings() {
  const data = {
    apiEndpoint: normalizeEndpoint($('apiEndpoint').value),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    systemPrompt: $('systemPrompt').value.trim(),
    theme: $('theme').value
  };

  if (!data.apiEndpoint || data.apiEndpoint === '/chat/completions') {
    showStatus('请填写 API 端点地址', 'error');
    return;
  }

  // ✅ 回写补全后的地址到输入框，让用户看到最终值
  $('apiEndpoint').value = data.apiEndpoint;

  await chrome.storage.sync.set(data);
  showStatus('设置已保存 ✓', 'success');
}

// 测试连接
async function testConnection() {
  const settings = {
    apiEndpoint: normalizeEndpoint($('apiEndpoint').value),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim()
  };

  if (!settings.apiEndpoint || !settings.apiKey) {
    showStatus('请先填写 API 端点和 API Key', 'error');
    return;
  }

  // ✅ 显示实际请求的完整 URL
  const btn = $('btnTest');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> 测试中…`;
  showStatus(`正在测试连接: ${settings.apiEndpoint}`, 'success');

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'test-connection',
      settings
    });

    if (result.success) {
      showStatus('连接成功 ✓ API 配置正确', 'success');
    } else {
      showStatus(`连接失败: ${result.error}`, 'error');
    }
  } catch (err) {
    showStatus(`连接失败: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

// 显示状态消息
function showStatus(text, type) {
  const el = $('status');
  el.textContent = text;
  el.className = `status show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'status'; }, 5000);
}

// 密码显示/隐藏切换
$('toggleKey').addEventListener('click', () => {
  const input = $('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
});

// 绑定事件
$('btnSave').addEventListener('click', saveSettings);
$('btnTest').addEventListener('click', testConnection);

// 页面加载时读取设置
loadSettings();
