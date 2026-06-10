// ============================================================
// background.js - Service Worker
// 处理 API 请求、中继流式响应
// ============================================================

// ---- 更新检查配置 ----
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/yutian3939/AI-Chat-Sidebar/main/manifest.json';
const PROJECT_URL = 'https://github.com/yutian3939/AI-Chat-Sidebar';

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

  // Agent 输入中转：用户在非原始标签页发消息时，追加到 Agent 会话
  if (msg.type === 'agent-input') {
    handleAgentInput(msg).then(sendResponse);
    return true;
  }

  // Agent 停止：任意标签页点停止
  if (msg.type === 'agent-stop') {
    if (agentSession) { agentSession.controller.abort(); agentSession = null; }
    sendResponse({ ok: true });
    return false;
  }

  // 检查更新
  if (msg.type === 'check-update') {
    checkUpdate().then(sendResponse);
    return true;
  }

  // 获取项目地址
  if (msg.type === 'get-project-url') {
    sendResponse({ url: PROJECT_URL });
    return false;
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
        // Agent 模式时使用更强的系统提示词注入浏览器自动化能力说明
        if (settings.systemPrompt) {
          messages.push({ role: 'system', content: settings.systemPrompt });
        }

        let hasMultimodal = false;
        for (const m of msg.history) {
          const hasImgs = !!(m._images && m._images.length > 0);
          const storageKey = m._images?.[0]?.storageKey;
          const stored = storageKey ? await chrome.storage.local.get(storageKey) : {};
          const dataUrls = (stored[storageKey] || []).filter(Boolean); // 过滤空的 dataUrl
          const hasValidImgs = hasImgs && dataUrls.length > 0;

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

          // 只有真正有图片数据时才走多模态路径
          if (hasValidImgs && visionMode === 'main') {
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

    // ========== Agent 模式消息处理 ==========
    if (msg.type === 'agent-init') {
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

        settings.apiEndpoint = normalizeEndpoint(settings.apiEndpoint);

        // 新建 convId
        const convId = msg.convId || ('conv_' + Date.now());

        // 加载 Agent 设置
        const agentData = await chrome.storage.local.get([
          'agentMaxSteps', 'agentSearchProvider', 'agentRequireConfirm'
        ]);
        const maxSteps = msg.maxSteps != null ? msg.maxSteps : (agentData.agentMaxSteps != null ? agentData.agentMaxSteps : 5);

        // 构建消息（Agent 模式加浏览器能力提示）
        const messages = [];
        const agentSysMsg = msg.history.find(m => m.role === 'system');
        if (agentSysMsg) {
          messages.push({ role: 'system', content: agentSysMsg.content });
        } else if (settings.systemPrompt) {
          messages.push({ role: 'system', content: settings.systemPrompt });
        }

        if (messages.length > 0 && messages[0].role === 'system') {
          messages[0].content += '\n\n你是一个浏览器自动化助手。你可以使用提供的工具来操作浏览器：打开标签页、点击元素、输入文字、获取页面结构、搜索网页、执行JavaScript等。当前你可以直接控制用户的浏览器，请在每一步操作后仔细分析工具返回的结果，再决定下一步行动。如果遇到页面加载，请使用 wait_for_element 等待关键元素出现后再继续。';
        }

        // 构建聊天历史（含 _agent_tool 用于 UI 显示）
        const chatHistory = [];
        const visionMode = msg.visionMode || 'none';
        for (const m of msg.history) {
          if (m.role === 'system') continue;
          chatHistory.push(m);
          if (m.role === 'user' || m.role === 'assistant') {
            let content = m.content || '';
            if (m._attachments && m._attachments.length > 0) {
              const fileTexts = [];
              m._attachments.forEach(a => {
                if (!(a.type || '').startsWith('image/') && a.text) {
                  fileTexts.push('[文件内容: ' + a.name + ']\n' + a.text);
                }
              });
              if (fileTexts.length > 0) {
                content = fileTexts.join('\n\n') + (content ? '\n\n---\n' + content : '');
              }
            }

            // 处理图片：Agent 模式同样支持多模态
            const hasImgs = !!(m._images && m._images.length > 0);
            if (hasImgs && visionMode === 'main') {
              const storageKey = m._images[0].storageKey;
              const stored = storageKey ? await chrome.storage.local.get(storageKey) : {};
              const dataUrls = stored[storageKey] || [];
              const contentArr = [];
              dataUrls.forEach(url => {
                contentArr.push({ type: 'image_url', image_url: { url } });
              });
              contentArr.push({ type: 'text', text: content || '请描述这张图片' });
              messages.push({ role: m.role, content: contentArr });
              if (storageKey) chrome.storage.local.remove(storageKey);
            } else if (m.role !== '_agent_tool') {
              messages.push({ role: m.role, content });
            }
          }
        }

        // 设置全局 Agent 会话（供 storage 持久化和跨标签页交互）
        agentSession = {
          convId,
          controller: null,
          running: true,
          chatHistory,
          settings,
          maxSteps
        };
        // 立即写 storage：新标签页通过轮询感知 Agent 正在运行
        await chrome.storage.local.set({
          _agentSync: { counter: Date.now(), convId, running: true, updatedAt: Date.now() },
          currentConvId: convId
        });

        await runAgentLoop(settings, messages, maxSteps, port);
      } catch (err) {
        port.postMessage({ type: 'error', content: err.message || 'Agent 发生未知错误' });
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
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  try {
    console.log('[ChatCompletion] 使用模型:', settings.model, '端点:', settings.apiEndpoint, '消息数:', messages.length, '请求体大小:', Math.round(JSON.stringify({ model: settings.model, messages, stream: false }).length / 1024) + 'KB');
    const body = JSON.stringify({ model: settings.model, messages, stream: false });

    const response = await fetch(settings.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
      },
      body,
      signal: controller.signal
    });

    console.log('[ChatCompletion] HTTP 状态:', response.status);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[ChatCompletion] API 错误:', response.status, text.slice(0, 500));
      if (!controller.signal.aborted) {
        port.postMessage({ type: 'error', content: `API 错误 (${response.status}): ${text || response.statusText}` });
        port.postMessage({ type: 'done' });
      }
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log('[ChatCompletion] 响应内容长度:', content ? content.length : 0);

    if (controller.signal.aborted) return;
    if (content) {
      port.postMessage({ type: 'chunk', content });
    } else {
      port.postMessage({ type: 'error', content: 'API 返回空内容，请检查模型是否支持视觉输入' });
    }
    port.postMessage({ type: 'done' });
  } catch (err) {
    console.error('[ChatCompletion] 异常:', err.name, err.message);
    if (err.name === 'AbortError') return;
    if (!controller.signal.aborted) {
      port.postMessage({ type: 'error', content: err.message });
      port.postMessage({ type: 'done' });
    }
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

// ============================================================
// ===== Agent 框架：工具定义、循环、执行器 =====
// ============================================================

/**
 * Agent 工具定义 (OpenAI tool_choice 格式)
 * 工具名会被 LLM 看到，描述要精确
 */
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_tab',
      description: '在浏览器中新打开一个标签页。当用户要求访问某个网站、打开链接时使用。返回标签页ID、URL和标题。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整URL，以http://或https://开头' },
          active: { type: 'boolean', default: true, description: '是否立即切换到新标签页，默认true' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_element',
      description: '在指定页面上点击一个元素。支持CSS选择器、可见文本、aria-label三种定位方式。点击后自动等待800ms让页面响应。一次只点击一个元素。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID。不传则使用当前活跃标签页' },
          selector: { type: 'string', description: 'CSS选择器，如"#btn-submit"、".nav a"、"button[type=submit]"' },
          text: { type: 'string', description: '元素的可见文本内容(模糊匹配)，如"登录"、"提交"' },
          ariaLabel: { type: 'string', description: '元素的精确aria-label属性值' },
          index: { type: 'integer', description: '多个匹配时选第几个(从0开始)，默认0' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: '在输入框中输入文本并触发事件。模拟真实用户逐字符输入。可按回车提交。用于填写搜索框、表单等。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID，不传则用当前活跃页' },
          selector: { type: 'string', description: 'input或textarea的CSS选择器' },
          text: { type: 'string', description: '要输入的文本' },
          clearFirst: { type: 'boolean', default: true, description: '是否先清空已有内容' },
          pressEnter: { type: 'boolean', default: false, description: '输入后是否按回车提交' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_page_structure',
      description: '获取页面的结构化信息。可获取可交互元素(按钮/链接/输入框等及其选择器)、标题层级、链接列表、表单结构。用于理解页面布局和定位目标元素。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID，不传则用当前活跃页' },
          mode: {
            type: 'string',
            enum: ['interactive', 'headings', 'links', 'forms'],
            default: 'interactive',
            description: 'interactive=可交互元素列表(含选择器)，headings=标题层级，links=所有链接，forms=表单字段结构'
          },
          maxElements: { type: 'integer', default: 80, description: '最大返回数量' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网获取最新信息。返回每个结果的标题、URL和摘要。需要查找实时信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询词' },
          count: { type: 'integer', default: 5, description: '返回结果数，最大10' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_page_text',
      description: '获取指定标签页的完整纯文本内容（最多30000字）。用于深入阅读页面内容。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID，不传则用当前活跃页' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tabs',
      description: '列出浏览器所有打开的标签页，返回ID、标题和URL。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scroll_page',
      description: '滚动页面。可上下滚动、滚到顶部或底部。用于触发懒加载或查看页面更多内容。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID' },
          direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], default: 'down' },
          amount: { type: 'integer', description: '滚动像素(与up/down配合)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_element',
      description: '等待某个元素出现在页面中。用于等待页面加载、异步内容渲染完成后再继续操作。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID' },
          selector: { type: 'string', description: 'CSS选择器' },
          timeout: { type: 'integer', default: 5000, description: '最大等待毫秒数' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: '截取标签页的可见区域截图，返回base64编码的图片数据。用于视觉分析页面内容。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'eval_js',
      description: '在页面中执行任意JavaScript代码并返回结果。可读取页面全局变量、调用函数、获取动态数据。返回值会被JSON序列化。',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: '目标标签页ID，不传则用当前活跃页' },
          code: { type: 'string', description: '要执行的JavaScript代码。用return返回结果。' },
          timeout: { type: 'integer', default: 5000, description: '执行超时(ms)' }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_webpage',
      description: '在后台静默获取任意网页URL的内容并提取纯文本。适合快速读取文章、API响应等，无需打开标签页。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页URL' }
        },
        required: ['url']
      }
    }
  }
];

// 工具安全分级
const TOOL_SAFETY_LEVELS = {
  open_tab: 'green', list_tabs: 'green', get_page_structure: 'green',
  get_page_text: 'green', web_search: 'green', fetch_webpage: 'green',
  wait_for_element: 'green', scroll_page: 'green', screenshot: 'green',
  click_element: 'yellow', type_text: 'yellow',
  eval_js: 'red'
};

// 速率限制器
const RATE_LIMITS = {};
function checkRateLimit(toolName) {
  const now = Date.now();
  if (!RATE_LIMITS[toolName]) RATE_LIMITS[toolName] = { count: 0, resetAt: now + 60000 };
  if (now > RATE_LIMITS[toolName].resetAt) {
    RATE_LIMITS[toolName] = { count: 0, resetAt: now + 60000 };
  }
  RATE_LIMITS[toolName].count++;
  const maxPerMin = toolName === 'eval_js' ? 5 : 20;
  if (RATE_LIMITS[toolName].count > maxPerMin) {
    throw new Error(`工具 "${toolName}" 超过速率限制 (${maxPerMin}次/分钟)`);
  }
}

// 小工具函数
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getCurrentTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

// ---- Agent 全局会话 + 持久化 ----
let agentSession = null; // { convId, controller, chatHistory, running, step, maxSteps }

// 把 Agent 消息写入 storage，供所有标签页轮询
async function agentPersistToStorage() {
  if (!agentSession) return;
  const convId = agentSession.convId;
  const data = await chrome.storage.local.get(['conversations']);
  const conversations = data.conversations || [];
  const idx = conversations.findIndex(c => c.id === convId);

  const history = [];
  if (agentSession.chatHistory) {
    for (const m of agentSession.chatHistory) {
      history.push(m);
    }
  }

  const conv = {
    id: convId,
    title: history.find(m => m.role === 'user')?.content?.slice(0, 20) || 'Agent 会话',
    messages: history,
    updatedAt: Date.now(),
    createdAt: idx >= 0 ? conversations[idx].createdAt : Date.now()
  };
  if (idx >= 0) conversations[idx] = conv;
  else conversations.unshift(conv);

  await chrome.storage.local.set({
    conversations,
    currentConvId: convId,
    _agentSync: {
      counter: Date.now(),
      convId,
      running: agentSession.running,
      step: agentSession.step || 0,
      maxSteps: agentSession.maxSteps || 5,
      updatedAt: Date.now()
    }
  });
}

// 处理来自其他标签页的用户输入
async function handleAgentInput(msg) {
  if (!agentSession || !agentSession.running) {
    return { error: '没有活跃的 Agent 会话' };
  }
  // 中断当前 API 请求
  agentSession.controller.abort();
  // 追加用户消息
  const userMsg = { role: 'user', content: msg.text };
  agentSession.chatHistory.push(userMsg);
  // 清理 system 消息，重建纯 api 消息数组
  const apiMessages = [];
  const systemMsg = agentSession.chatHistory.find(m => m.role === 'system');
  if (systemMsg) apiMessages.push(systemMsg);
  for (const m of agentSession.chatHistory) {
    if (m.role === 'system' || m.role === '_agent_tool') continue;
    apiMessages.push({ role: m.role, content: m.content || '' });
  }
  // 重新启动循环
  agentSession.controller = new AbortController();
  agentSession.apiMessages = apiMessages;
  // 异步重新运行——不阻塞 sendResponse
  setTimeout(async () => {
    await runAgentLoop(agentSession.settings, apiMessages, agentSession.maxSteps, null);
  }, 100);
  return { ok: true };
}

// ---- Agent 主循环 ----
async function runAgentLoop(settings, messages, maxSteps, port) {
  const effectiveMax = maxSteps > 0 ? maxSteps : 999; // 0 = 不限制
  const controller = new AbortController();
  if (agentSession) agentSession.controller = controller;
  if (port) {
    port.onDisconnect.addListener(() => {
      controller.abort();
    });
  }

  let stepCount = 0;
  const TOTAL_TIMEOUT = 300000; // 5分钟
  const startTime = Date.now();

  while (stepCount < effectiveMax) {
    // 总超时检查
    if (Date.now() - startTime > TOTAL_TIMEOUT) {
      port.postMessage({ type: 'error', content: 'Agent 执行超时(5分钟)，任务可能过于复杂。' });
      port.postMessage({ type: 'done' });
      return;
    }

    try {
      // Agent 循环使用非流式请求检测 tool_calls
      const response = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          tools: AGENT_TOOLS,
          tool_choice: 'auto',
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`API 错误(${response.status}): ${errText || response.statusText}`);
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message;

      if (!msg) {
        throw new Error('API 返回空消息');
      }

      // 检查 tool_calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // 真正执行工具 → 记录步数
        stepCount++;
        if (port) port.postMessage({ type: 'agent-thinking', step: stepCount, maxSteps: effectiveMax });
        if (agentSession) { agentSession.step = stepCount; agentSession.maxSteps = effectiveMax; }
        // 追加 assistant 消息(含 tool_calls)到历史
        messages.push(msg);

        // 逐工具执行
        for (const tc of msg.tool_calls) {
          if (controller.signal.aborted) break;

          const toolName = tc.function.name;
          let toolArgs = {};

          try {
            toolArgs = JSON.parse(tc.function.arguments);
          } catch {
            messages.push({ role: 'tool', tool_call_id: tc.id, content: '{"error":"参数解析失败"}' });
            continue;
          }

          checkRateLimit(toolName);

          // 通知 UI：开始执行工具
          if (port) port.postMessage({
            type: 'agent-tool-start',
            toolCallId: tc.id,
            name: toolName,
            args: JSON.stringify(toolArgs)
          });
          // 更新聊天历史 → 写入 storage
          if (agentSession) {
            agentSession.chatHistory.push({ role: '_agent_tool', toolCallId: tc.id, name: toolName, args: JSON.stringify(toolArgs), status: 'running' });
            agentPersistToStorage();
          }

          // 异步执行工具
          let toolResult;
          try {
            toolResult = await executeTool(toolName, toolArgs);
          } catch (toolErr) {
            toolResult = { error: toolErr.message || '工具执行异常' };
          }

          const resultStr = JSON.stringify(toolResult);

          // 通知 UI：工具结果
          if (port) port.postMessage({
            type: 'agent-tool-result',
            toolCallId: tc.id,
            name: toolName,
            result: resultStr.length > 8000 ? resultStr.slice(0, 8000) + '...(truncated)' : resultStr,
            error: toolResult.error || null
          });
          // 更新聊天历史 → 写入 storage
          if (agentSession) {
            for (let i = agentSession.chatHistory.length - 1; i >= 0; i--) {
              if (agentSession.chatHistory[i].toolCallId === tc.id) {
                agentSession.chatHistory[i].status = toolResult.error ? 'error' : 'done';
                agentSession.chatHistory[i].result = resultStr.length > 8000 ? resultStr.slice(0, 8000) + '...(truncated)' : resultStr;
                agentSession.chatHistory[i].error = toolResult.error || null;
                break;
              }
            }
            agentPersistToStorage();
          }

          // 追加 tool 消息
          messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
        }

        // 继续循环
        continue;
      }

      // 无 tool_calls → 最终答案
      if (msg.content) {
        messages.push({ role: 'assistant', content: msg.content });
        if (port) port.postMessage({ type: 'chunk', content: msg.content });
        if (port) port.postMessage({ type: 'done' });
        // 保存最终答案到 storage
        if (agentSession) {
          agentSession.chatHistory.push({ role: 'assistant', content: msg.content });
          agentSession.running = false;
          await agentPersistToStorage();
          agentSession = null;
        }
        return;
      }

      // 空响应
      if (port) port.postMessage({ type: 'error', content: 'API 返回空结果，Agent 结束。' });
      if (port) port.postMessage({ type: 'done' });
      if (agentSession) { agentSession.running = false; await agentPersistToStorage(); agentSession = null; }
      return;

    } catch (err) {
      if (err.name === 'AbortError') {
        if (port) port.postMessage({ type: 'error', content: 'Agent 已被取消' });
      } else {
        if (port) port.postMessage({ type: 'error', content: err.message || 'Agent 执行失败' });
      }
      if (port) port.postMessage({ type: 'done' });
      if (agentSession) { agentSession.running = false; await agentPersistToStorage(); agentSession = null; }
      return;
    }
  }

  // 超步数
  if (port) port.postMessage({
    type: 'error',
    content: maxSteps > 0
      ? `Agent 达到最大步数(${maxSteps})，已执行${stepCount}步，请检查结果或增加步数限制。`
      : `Agent 已执行${stepCount}步并超时，任务可能过于复杂。`
  });
  if (port) port.postMessage({ type: 'done' });
  if (agentSession) { agentSession.running = false; await agentPersistToStorage(); agentSession = null; }
}

// ---- 工具分发器 ----
async function executeTool(name, args) {
  switch (name) {
    case 'open_tab':          return tool_openTab(args);
    case 'click_element':     return tool_clickElement(args);
    case 'type_text':         return tool_typeText(args);
    case 'get_page_structure': return tool_getPageStructure(args);
    case 'get_page_text':     return tool_getPageText(args);
    case 'web_search':        return tool_webSearch(args);
    case 'list_tabs':         return tool_listTabs();
    case 'scroll_page':       return tool_scrollPage(args);
    case 'wait_for_element':  return tool_waitForElement(args);
    case 'screenshot':        return tool_screenshot(args);
    case 'eval_js':           return tool_evalJs(args);
    case 'fetch_webpage':     return tool_fetchWebpage(args);
    default: throw new Error(`未知工具: ${name}`);
  }
}

// ====================== 工具实现 ======================

async function tool_openTab(args) {
  let url = args.url;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const tab = await chrome.tabs.create({ url, active: args.active !== false });
  await sleep(2000);
  return { tabId: tab.id, url: tab.url, title: tab.title, status: 'opened' };
}

async function tool_clickElement(args) {
  const tabId = args.tabId || await getCurrentTabId();
  if (!tabId) return { error: '没有可用的标签页' };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selector, text, ariaLabel, index) => {
      let el = null;
      if (selector) {
        const els = document.querySelectorAll(selector);
        el = els[index || 0];
      } else if (text) {
        const sel = 'a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], .btn, [onclick]';
        const all = [...document.querySelectorAll(sel)];
        el = all.find(e => {
          const t = (e.textContent || e.innerText || e.value || '').trim();
          return t.includes(text);
        });
      } else if (ariaLabel) {
        el = document.querySelector(`[aria-label="${ariaLabel}"]`) || document.querySelector(`[aria-label*="${ariaLabel}"]`);
      }
      if (!el) return { error: '未找到匹配元素。请用 get_page_structure 查看可选元素。' };
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.click();
      return {
        success: true,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.value || '').trim().slice(0, 100),
        id: el.id || '',
        className: (el.className?.toString() || '').slice(0, 80),
        href: el.href || '',
        type: el.type || ''
      };
    },
    args: [args.selector || null, args.text || null, args.ariaLabel || null, args.index || 0]
  });

  await sleep(800);
  return results[0]?.result || { error: '脚本执行失败' };
}

async function tool_typeText(args) {
  const tabId = args.tabId || await getCurrentTabId();
  if (!tabId) return { error: '没有可用的标签页' };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selector, text, clearFirst, pressEnter) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `未找到元素: ${selector}` };
      el.focus();
      if (clearFirst) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 分批写入并触发事件
      el.value += text;
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      if (pressEnter) {
        const form = el.closest('form');
        // 触发 keydown/keyup Enter
        ['keydown', 'keypress', 'keyup'].forEach(type => {
          el.dispatchEvent(new KeyboardEvent(type, {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
          }));
        });
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }

      return {
        success: true,
        textLength: text.length,
        finalValue: (el.value || '').slice(0, 200),
        tag: el.tagName.toLowerCase(),
        pressedEnter: pressEnter,
        formSubmitted: !!el.closest('form')
      };
    },
    args: [args.selector, args.text, args.clearFirst !== false, args.pressEnter || false]
  });

  await sleep(500);
  return results[0]?.result || { error: '输入操作失败' };
}

async function tool_getPageStructure(args) {
  const tabId = args.tabId || await getCurrentTabId();
  if (!tabId) return { error: '没有可用的标签页' };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (mode, maxEl) => {
      const result = { url: location.href, title: document.title, mode };

      const getXPath = (el) => {
        if (el.id) return `#${el.id}`;
        if (el === document.body) return 'body';
        let path = '';
        let current = el;
        while (current && current !== document.body) {
          let tag = current.tagName.toLowerCase();
          if (current.id) { path = `#${current.id}` + (path ? ' > ' + path : ''); break; }
          const parent = current.parentElement;
          if (parent) {
            const siblings = [...parent.children].filter(c => c.tagName === current.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current) + 1;
              tag += `:nth-of-type(${idx})`;
            }
          }
          path = path ? `${tag} > ${path}` : tag;
          current = current.parentElement;
        }
        return path;
      };

      switch (mode) {
        case 'interactive': {
          const intSel = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="textbox"], [role="searchbox"], [role="combobox"], [onclick], [tabindex]';
          const seen = new Set();
          const elements = [];
          document.querySelectorAll(intSel).forEach(el => {
            if (elements.length >= maxEl) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const key = (el.id || '') + (el.className?.toString() || '') + el.tagName;
            if (seen.has(key)) return;
            seen.add(key);
            const text = (el.textContent || el.getAttribute('aria-label') || el.title || el.value || el.placeholder || '').trim().slice(0, 60);
            elements.push({
              tag: el.tagName.toLowerCase(),
              type: el.type || '',
              text,
              id: el.id || '',
              class: (el.className?.toString() || '').slice(0, 40),
              selector: getXPath(el).slice(0, 80),
              href: (el.href || '').slice(0, 100),
              name: el.name || '',
              placeholder: el.placeholder || ''
            });
          });
          result.elements = elements.slice(0, maxEl);
          result.count = result.elements.length;
          if (elements.length >= maxEl) result.truncated = true;
          break;
        }
        case 'headings': {
          const hds = [];
          document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
            hds.push({ level: parseInt(h.tagName[1]), text: h.textContent.trim().slice(0, 200), id: h.id || '' });
          });
          result.headings = hds;
          break;
        }
        case 'links': {
          const links = [];
          document.querySelectorAll('a[href]').forEach(a => {
            if (links.length >= maxEl) return;
            const href = a.href;
            if (href.startsWith('javascript:')) return;
            links.push({ text: a.textContent.trim().slice(0, 100), href: href.slice(0, 200) });
          });
          result.links = links;
          result.count = links.length;
          if (links.length >= maxEl) result.truncated = true;
          break;
        }
        case 'forms': {
          const forms = [];
          document.querySelectorAll('form').forEach(form => {
            const fields = [];
            form.querySelectorAll('input, textarea, select, button').forEach(el => {
              fields.push({
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                name: el.name || '', id: el.id || '',
                placeholder: el.placeholder || '',
                text: (el.textContent || '').trim().slice(0, 50),
                selector: el.id ? '#'+el.id : (el.name ? `${el.tagName.toLowerCase()}[name="${el.name}"]` : el.tagName.toLowerCase())
              });
            });
            forms.push({
              action: form.action || '', method: form.method || 'get',
              id: form.id || '', fields,
              submitBtn: [...form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])')]
                .map(b => ({ text: (b.textContent||b.value).trim(), selector: getXPath(b) }))
            });
          });
          result.forms = forms;
          break;
        }
      }
      return result;
    },
    args: [args.mode || 'interactive', args.maxElements || 80]
  });

  return results[0]?.result || { error: '获取结构失败' };
}

async function tool_getPageText(args) {
  const tabId = args.tabId || await getCurrentTabId();
  return await getTabContent(tabId);
}

async function tool_webSearch(args) {
  try {
    const query = encodeURIComponent(args.query);
    const count = Math.min(args.count || 5, 10);
    const resp = await fetch(`https://lite.duckduckgo.com/lite/?q=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await resp.text();

    // 简易解析 DuckDuckGo Lite 结果
    const results = [];
    // 匹配行: <a rel="nofollow" class="result-link" href="...">title</a>
    const linkRe = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snipRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const linkMatches = [...html.matchAll(linkRe)];
    const snipMatches = [...html.matchAll(snipRe)];

    for (let i = 0; i < Math.min(linkMatches.length, count); i++) {
      const href = linkMatches[i][1];
      const title = linkMatches[i][2].replace(/<[^>]*>/g, '').trim();
      const snippet = snipMatches[i]
        ? snipMatches[i][1].replace(/<[^>]*>/g, '').trim().slice(0, 300)
        : '';
      if (href && title) {
        results.push({ title, url: href, snippet });
      }
    }

    if (results.length === 0) {
      return { query: args.query, results: [], message: '未找到搜索结果，请尝试其他关键词' };
    }

    return { query: args.query, results, count: results.length };
  } catch (err) {
    return { error: '搜索失败: ' + err.message };
  }
}

async function tool_listTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const currentTab = tabs.find(t => t.active);
    return {
      tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url || '', active: t.active })),
      currentTabId: currentTab?.id || null,
      count: tabs.length
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function tool_scrollPage(args) {
  const tabId = args.tabId || await getCurrentTabId();
  if (!tabId) return { error: '没有可用的标签页' };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (direction, amount) => {
      const prevY = window.scrollY;
      switch (direction) {
        case 'top': window.scrollTo({ top: 0, behavior: 'instant' }); break;
        case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }); break;
        case 'up': window.scrollBy({ top: -(amount || 500), behavior: 'smooth' }); break;
        case 'down': default: window.scrollBy({ top: amount || 500, behavior: 'smooth' }); break;
      }
      return { previousY: prevY, currentY: window.scrollY, direction };
    },
    args: [args.direction || 'down', args.amount || 500]
  });

  await sleep(400);
  return results[0]?.result || { error: '滚动失败' };
}

async function tool_waitForElement(args) {
  const tabId = args.tabId || await getCurrentTabId();
  if (!tabId) return { error: '没有可用的标签页' };

  const timeoutMs = Math.min(args.timeout || 5000, 15000);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selector) => !!document.querySelector(selector),
      args: [args.selector]
    });
    if (results[0]?.result) {
      return { found: true, selector: args.selector, waitedMs: Date.now() - start };
    }
    await sleep(300);
  }

  return { found: false, selector: args.selector, timeoutMs, message: '等待超时，元素未出现' };
}

async function tool_screenshot(args) {
  try {
    const tabId = args.tabId || await getCurrentTabId();
    if (!tabId) return { error: '没有可用的标签页' };

    // 先激活标签页
    await chrome.tabs.update(tabId, { active: true });
    await sleep(500);

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 });
    return { screenshot: dataUrl.slice(0, 200) + '...(base64 data)', hasData: !!dataUrl, message: '截图已获取(base64 JPEG)' };
  } catch (err) {
    return { error: '截图失败: ' + err.message };
  }
}

async function tool_evalJs(args) {
  const tabId = args.tabId || await getCurrentTabId();
  if (!tabId) return { error: '没有可用的标签页' };

  const timeoutMs = Math.min(args.timeout || 5000, 10000);

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (code, timeout) => {
      const timeoutP = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('超时(' + timeout + 'ms)')), timeout)
      );
      const execP = new Promise((resolve) => {
        try {
          const r = eval(code);
          resolve(r === undefined ? undefined : r);
        } catch (e) { resolve({ error: e.message }); }
      });
      return Promise.race([execP, timeoutP]);
    },
    args: [args.code, timeoutMs]
  });

  const val = results[0]?.result;
  if (val === undefined) return { result: undefined, type: 'undefined' };
  if (val === null) return { result: null, type: 'null' };

  try {
    const str = JSON.stringify(val);
    if (str.length > 8000) return { result: str.slice(0, 8000) + '...(truncated)', type: typeof val, truncated: true };
    return { result: val, type: typeof val };
  } catch {
    return { result: String(val).slice(0, 5000), type: typeof val };
  }
}

async function tool_fetchWebpage(args) {
  try {
    let url = args.url;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!resp.ok) return { error: `HTTP ${resp.status}: ${resp.statusText}` };

    const html = await resp.text();

    // 简易提取正文
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 15000) text = text.slice(0, 15000) + '...(truncated)';

    return { url, textLength: text.length, text };
  } catch (err) {
    return { error: '获取网页失败: ' + err.message };
  }
}

// ---- 更新检查 ----
function compareVersion(a, b) {
  var pa = (a || '0.0.0').split('.').map(Number);
  var pb = (b || '0.0.0').split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function checkUpdate() {
  var current = chrome.runtime.getManifest().version;
  try {
    var resp = await fetch(UPDATE_MANIFEST_URL, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var remote = await resp.json();
    var latest = remote.version;
    var isNewer = compareVersion(latest, current) > 0;
    return {
      currentVersion: current,
      latestVersion: latest || '',
      hasUpdate: isNewer,
      projectUrl: PROJECT_URL
    };
  } catch (err) {
    return { error: '检查失败: ' + err.message, currentVersion: current, projectUrl: PROJECT_URL };
  }
}
