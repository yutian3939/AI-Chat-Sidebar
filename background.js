// ============================================================
// background.js - Service Worker
// 处理 API 请求、中继流式响应、打开设置页
// ============================================================

const DEFAULT_SETTINGS = {
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
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
  // 打开设置页面
  if (msg.type === 'open-settings') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
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
});

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

        const messages = [];
        if (settings.systemPrompt) {
          messages.push({ role: 'system', content: settings.systemPrompt });
        }
        messages.push(...msg.history);

        await streamChat(settings, messages, port);
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
      'Authorization': `Bearer ${settings.apiKey}`
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
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
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
    if (!doneSent) {
      port.postMessage({ type: 'done' });
    }
  }
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
        'Authorization': `Bearer ${settings.apiKey}`
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
        'Authorization': `Bearer ${settings.apiKey}`
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
