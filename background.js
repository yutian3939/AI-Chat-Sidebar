// ============================================================
// background.js - Service Worker
// 处理 API 请求、中继流式响应
// ============================================================

const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  systemPrompt: '你是一个有帮助的AI助手。',
  theme: 'system'
};

// 自动答题独立提示词（与聊天提示词分离）
const AUTO_ANSWER_PROMPT = `你是一个严谨的作业答题助手。请仔细分析题目和所有选项后，选出唯一正确答案。

【输出格式——严格遵循，不要输出任何其他内容】
第一行：正确选项的字母（如：A）
第二行：一句话简要解析

【注意】
- 只输出一个选项字母
- 必须从给定的选项中选择
- 选项字母必须在 A、B、C、D 中
- 如果题目涉及代码或专业知识，请认真分析`;

/**
 * 清理字符串首尾空白
 */
function cleanStr(str) {
  return (str || '').trim();
}

/**
 * 自动补全 API 端点路径
 * 用户可能只填了 base URL，自动补上 /v1/chat/completions 或 /chat/completions
 */
function normalizeEndpoint(url) {
  if (!url) return url;
  // 去掉末尾的斜杠
  let endpoint = url.trim().replace(/\/+$/, '');
  // 如果已经包含 chat/completions 就直接返回
  if (endpoint.endsWith('/chat/completions')) return endpoint;
  // 如果以 /v1 结尾，补上 /chat/completions
  if (endpoint.endsWith('/v1')) return endpoint + '/chat/completions';
  // 如果以 /v4 等版本号结尾，补上 /chat/completions
  if (/\/v\d+$/.test(endpoint)) return endpoint + '/chat/completions';
  // 其他情况也补上 /chat/completions
  return endpoint + '/chat/completions';
}

// ---- 处理来自 content script 的一次性消息 ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 提供 KaTeX CSS（备选：XHR 被 Chrome 拦截时使用）
  if (msg.type === 'get-katex-css') {
    fetch(chrome.runtime.getURL('lib/katex.min.css'))
      .then(r => r.text())
      .then(css => sendResponse({ css }))
      .catch(() => sendResponse({ css: '' }));
    return true;
  }

  // 测试 API 连接
  if (msg.type === 'test-connection') {
    testConnection(msg.settings).then(sendResponse);
    return true; // 保持通道开放以等待异步响应
  }

  // 自动答题：逐题请求 AI 解答
  if (msg.type === 'answer-question') {
    answerSingleQuestion(msg.question, msg.options).then(sendResponse);
    return true;
  }

  // 截图：captureVisibleTab + crop
  if (msg.type === 'capture-screenshot') {
    captureScreenshot(msg.rect).then(sendResponse);
    return true;
  }

  // 获取所有打开的标签页
  if (msg.type === 'get-tabs') {
    chrome.tabs.query({}).then(tabs => {
      const currentTab = tabs.find(t => t.active);
      sendResponse({
        tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active })),
        currentTabId: currentTab ? currentTab.id : null
      });
    }).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // 提取标签页文本内容
  if (msg.type === 'get-tab-content') {
    getTabContent(msg.tabId)
      .then(data => { try { sendResponse(data); } catch(e) {} })
      .catch(err => { try { sendResponse({ error: err.message || '提取失败' }); } catch(e) {} });
    return true;
  }
});

// ---- 截图工具 ----
async function captureScreenshot(rect) {
  try {
    console.warn('[Screenshot BG] 收到截图请求:', rect);
    const fullDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    console.warn('[Screenshot BG] captureVisibleTab 结果长度:', fullDataUrl ? fullDataUrl.length : 0);
    if (!fullDataUrl) { console.error('[Screenshot BG] captureVisibleTab 返回空'); return null; }

    const dpr = rect.dpr || 1;
    const sx = Math.round(rect.x * dpr);
    const sy = Math.round(rect.y * dpr);
    const sw = Math.round(rect.w * dpr);
    const sh = Math.round(rect.h * dpr);
    console.warn('[Screenshot BG] 裁切参数:', { sx, sy, sw, sh, dpr });

    // 裁切：直接创建小 canvas 绘制目标区域
    const imgBlob = await fetch(fullDataUrl).then(r => r.blob());
    const img = await createImageBitmap(imgBlob);
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx2d = canvas.getContext('2d');
    ctx2d.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const result = await new Promise((resolve) => {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
    img.close();
    console.warn('[Screenshot BG] 裁切完成, 结果长度:', result ? result.length : 0);
    return result;
  } catch (err) {
    console.error('[Screenshot BG] 截图失败:', err);
    return null;
  }
}

// ---- 处理来自 content script 的长连接 (流式响应) ----
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-chat') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'init') {
      try {
        const settings = {
          ...DEFAULT_SETTINGS,
          ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS)))
        };

        if (!settings.apiKey) {
          port.postMessage({ type: 'error', content: '请先在设置中配置 API Key' });
          port.postMessage({ type: 'done' });
          return;
        }

        // ✅ 自动补全端点路径
        settings.apiEndpoint = normalizeEndpoint(settings.apiEndpoint);

        const visionMode = msg.visionMode || 'none';

        // 视觉模型转述：先读图片数据和外挂模型配置
        const visionSettings = visionMode === 'vision'
          ? await loadVisionSettings() : null;

        const messages = [];
        if (settings.systemPrompt) {
          messages.push({ role: 'system', content: settings.systemPrompt });
        }

        let hasMultimodal = false;
        for (const m of msg.history) {
          const hasImgs = !!(m._images && m._images.length > 0);
          const storageKey = m._images?.[0]?.storageKey;
          const stored = storageKey ? await chrome.storage.local.get(storageKey) : {};
          const dataUrls = stored[storageKey] || [];

          // 构建该条消息的最终文本 (含文件内容)
          let fullMsgText = m.content || '';
          if (m._attachments && m._attachments.length > 0) {
            const fileTexts = [];
            m._attachments.forEach(a => {
              if (!(a.type || '').startsWith('image/') && a.text) {
                fileTexts.push('[文件内容: ' + a.name + ']\n' + a.text);
              }
            });
            if (fileTexts.length > 0) {
              fullMsgText = fileTexts.join('\n\n') + (fullMsgText ? '\n\n---\n' + fullMsgText : '');
            }
          }

          if (hasImgs && visionMode === 'main') {
            hasMultimodal = true;
            const contentArr = [];
            dataUrls.forEach(url => {
              contentArr.push({ type: 'image_url', image_url: { url } });
            });
            contentArr.push({ type: 'text', text: fullMsgText || '请描述这张图片' });
            messages.push({ role: m.role, content: contentArr });
            if (storageKey) chrome.storage.local.remove(storageKey);
          } else if (hasImgs && visionMode === 'vision' && visionSettings) {
            hasMultimodal = false;
            const desc = await describeImages(visionSettings, dataUrls, fullMsgText);
            messages.push({ role: m.role, content: desc });
            if (storageKey) chrome.storage.local.remove(storageKey);
          } else {
            messages.push({ role: m.role, content: fullMsgText });
          }
        }

        if (hasMultimodal) {
          await chatCompletion(settings, messages, port);
        } else {
          await streamChat(settings, messages, port);
        }
      } catch (err) {
        port.postMessage({ type: 'error', content: err.message || '发生未知错误' });
        port.postMessage({ type: 'done' });
      }
    }
  });
});

// ---- 流式调用 OpenAI 兼容 API ----
async function streamChat(settings, messages, port) {
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  const response = await fetch(settings.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: true
    }),
    signal: controller.signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    port.postMessage({ type: 'error', content: `API 错误 (${response.status}): ${text || response.statusText}` });
    port.postMessage({ type: 'done' });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneSent = false;
  let chunkSent = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          port.postMessage({ type: 'done' });
          doneSent = true;
          return;
        }

        try {
          const json = JSON.parse(data);
          // 检测 SSE 流内错误 (如 OpenAI 返回的 error)
          if (json.error) {
            port.postMessage({ type: 'error', content: json.error.message || JSON.stringify(json.error) });
            port.postMessage({ type: 'done' });
            doneSent = true;
            return;
          }
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            chunkSent = true;
            port.postMessage({ type: 'chunk', content });
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      port.postMessage({ type: 'error', content: err.message });
    }
  } finally {
    // 流结束但未发送任何 chunk 也没有错误 → API 返回了空内容
    if (!doneSent && !chunkSent) {
      port.postMessage({ type: 'error', content: 'API 返回了空响应，请检查模型是否支持多模态输入（如 gpt-4o）' });
    }
    if (!doneSent) {
      port.postMessage({ type: 'done' });
    }
  }
}

// ---- 非流式调用 (用于多模态，避免 Qwen 等兼容性问题) ----
async function chatCompletion(settings, messages, port) {
  try {
    const body = JSON.stringify({ model: settings.model, messages, stream: false });

    const response = await fetch(settings.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
      },
      body
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      port.postMessage({ type: 'error', content: `API 错误 (${response.status}): ${text || response.statusText}` });
      port.postMessage({ type: 'done' });
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      port.postMessage({ type: 'chunk', content });
    } else {
      port.postMessage({ type: 'error', content: 'API 返回空内容，请检查模型是否支持视觉输入' });
    }
    port.postMessage({ type: 'done' });
  } catch (err) {
    port.postMessage({ type: 'error', content: err.message });
    port.postMessage({ type: 'done' });
  }
}

// ---- 视觉模型转述：加载配置 ----
async function loadVisionSettings() {
  const data = await chrome.storage.local.get([
    'visionModelProvider', 'visionModel', 'visionPrompt', 'providers'
  ]);
  const providers = data.providers || [];
  const provider = providers.find(p => p.id === data.visionModelProvider) || {};
  return {
    baseUrl: provider.baseUrl || '',
    apiKey: provider.apiKey || '',
    model: data.visionModel || '',
    prompt: data.visionPrompt || '请简洁描述图片内容。'
  };
}

// ---- 视觉模型转述：调视觉模型获取文字描述 ----
async function describeImages(vs, dataUrls, userText) {
  if (!vs.baseUrl || !vs.apiKey || !vs.model) {
    throw new Error('视觉模型未配置，请在设置中选择视觉模型');
  }
  const endpoint = normalizeEndpoint(vs.baseUrl);
  const contentArr = [];
  dataUrls.forEach(url => {
    contentArr.push({ type: 'image_url', image_url: { url } });
  });
  contentArr.push({ type: 'text', text: vs.prompt });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cleanStr(vs.apiKey)
    },
    body: JSON.stringify({
      model: vs.model,
      messages: [
        { role: 'user', content: contentArr }
      ],
      max_tokens: 500
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`视觉模型请求失败 (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const desc = data.choices?.[0]?.message?.content || '';
  if (!desc) throw new Error('视觉模型返回空内容');

  // 组合：视觉描述 + 用户原文
  const prefix = '【以下是 AI 对图片的描述】\n' + desc;
  return userText ? prefix + '\n\n---\n用户问题：' + userText : prefix + '\n\n请根据以上图片描述回答问题。';
}

// ---- 测试 API 连接 ----
async function testConnection(settings) {
  try {
    // ✅ 自动补全端点路径
    const endpoint = normalizeEndpoint(settings.apiEndpoint);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });

    if (res.ok) {
      return { success: true };
    } else {
      const text = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---- 单题解答（非流式，用于自动答题） ----
async function answerSingleQuestion(question, options) {
  try {
    const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    const settings = { ...DEFAULT_SETTINGS, ...stored };

    if (!settings.apiKey) {
      return { error: '请先在设置中配置 API Key' };
    }

    const endpoint = normalizeEndpoint(settings.apiEndpoint);

    // 构建选项文本
    const optionsText = options
      .map(o => `${o.letter}. ${o.text}`)
      .join('\n');

    const messages = [
      { role: 'system', content: AUTO_ANSWER_PROMPT },
      { role: 'user', content: `题目：${question}\n\n选项：\n${optionsText}` }
    ];

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_tokens: 300,
        temperature: 0.1
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `API 错误 (${res.status}): ${text || res.statusText}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 AI 回复：第一行是答案字母，第二行是解析
    const lines = content.trim().split('\n').filter(l => l.trim());
    let letter = '';
    let reason = '';

    // 尝试从第一行提取字母 [A-D]
    const letterMatch = lines[0]?.match(/[A-D]/);
    if (letterMatch) {
      letter = letterMatch[0];
    }
    // 如果第一行没找到，尝试在整个回复中找
    if (!letter) {
      const globalMatch = content.match(/答案[：:]\s*([A-D])/);
      if (globalMatch) letter = globalMatch[1];
    }
    if (!letter) {
      // 最后尝试匹配任意孤单的 [A-D] 字母
      const fallback = content.match(/^[A-D]$/m);
      if (fallback) letter = fallback[0];
    }

    reason = lines.slice(1).join(' ').trim() ||
             lines[0]?.replace(/^[A-D][.、，,。\s]*/, '').trim() ||
             '';

    return { letter, reason: reason.slice(0, 100) };
  } catch (err) {
    return { error: err.message };
  }
}

// ---- 提取标签页文本内容 ----
async function getTabContent(tabId) {
  try {
    // 先检查标签页是否存在
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return { error: '标签页不存在' };

    // 检查是否是受限页面 (chrome://, edge://, about: 等)
    if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
      return { error: '无法读取系统页面 (仅支持 http/https 网页)' };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // 尝试提取主要内容区域
        const article = document.querySelector('article')
          || document.querySelector('main')
          || document.querySelector('[role="main"]')
          || document.body;
        const clone = article.cloneNode(true);
        // 移除非内容元素
        clone.querySelectorAll('script, style, noscript, iframe, nav, footer, header, .sidebar, .nav, .menu, .advertisement, [role="navigation"]').forEach(el => el.remove());
        const text = (clone.innerText || clone.textContent || '');
        return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 30000);
      }
    });
    if (results && results[0] && results[0].result) {
      return { text: results[0].result, title: tab.title || '', url: tab.url || '' };
    }
    return { text: '', title: tab.title || '', url: tab.url || '' };
  } catch (err) {
    return { error: err.message || '提取失败' };
  }
}
