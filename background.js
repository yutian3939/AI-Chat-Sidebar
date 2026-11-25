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

// 自动答题独立提示词（与聊天提示词分离，支持单选/多选/判断）
// 强制 JSON 结构化输出，便于稳定解析
const AUTO_ANSWER_PROMPT = `你是一个严谨的作业答题助手。请仔细分析题目和所有选项后作答。

【题型说明】
- 单选题：只有 1 个正确选项
- 多选题：有 2 个或以上正确选项
- 判断题：A 表示“对”，B 表示“错”

【输出要求——强制 JSON】
只输出一个 JSON 对象，不要输出任何其他文字、解释、代码块标记或多余符号：
{"answer":"A","reason":"不超过30字的简要解析"}

字段说明：
- answer：正确选项的字母。单选题/判断题只填一个字母（如 "A"）；多选题按顺序连写全部字母（如 "ABD"），不要加逗号、空格或顿号
- reason：一句话简要解析

严格要求：
- 必须输出合法 JSON，且必须包含 answer 字段
- answer 里的字母必须来自给定选项
- 多选题务必选出全部正确项，不要遗漏
- 严禁输出 JSON 以外的任何内容`;

/**
 * 安全发送 port 消息（port 断开时不抛异常）
 */
function safePost(port, msg) {
  try { port.postMessage(msg); } catch(e) {}
}

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
  // 提供 KaTeX CSS（备选：XHR 被拦截时使用；字体已 Base64 内嵌）
  if (msg.type === 'get-katex-css') {
    fetch(chrome.runtime.getURL('lib/katex-embedded.css'))
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
    answerSingleQuestion(msg.question, msg.options, msg.qtype).then(sendResponse);
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

  // 注入后台保活脚本（MAIN world，绕过页面 CSP，覆盖所有 frame）
  if (msg.type === 'inject-visibility') {
    (async () => {
      try {
        var tabId = _sender && _sender.tab ? _sender.tab.id : null;
        if (tabId == null) { sendResponse({ ok: false, error: 'no tabId' }); return; }
        await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          world: 'MAIN',
          files: ['lib/visibility-fix.js']
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  // WE Learn：在 MAIN world（所有 frame）执行填答 / 启动 / 提交
  if (msg.type === 'welearn-main') {
    (async () => {
      try {
        var tabId = (_sender && _sender.tab) ? _sender.tab.id : null;
        if (tabId == null) { sendResponse({ ok: false, error: 'no tabId' }); return; }
        var results = await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          world: 'MAIN',
          func: welearnMainFunc,
          args: [msg.op || 'fill', msg.sco || '']
        });
        sendResponse({ ok: true, results: results.map(function(r) { return r ? r.result : null; }) });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
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

// ---- WE Learn：在页面 MAIN world 执行的函数（由 executeScript 注入） ----
// op = 'start' | 'fill' | 'submit'
// 说明：WE Learn 课件里每个填空/选项都带 data-solution（官方答案），
//       且答题状态由课件自带的 jQuery 插件 .values() 维护。
function welearnMainFunc(op, sco) {
  var host = location.hostname;

  // ---------- 在 WE Learn 任务页启动某个 SCO ----------
  if (op === 'start') {
    if (!/(^|\.)welearn\.sflep\.com$/i.test(host)) return null;
    try {
      if (typeof window.StartSCO === 'function') {
        window.StartSCO(sco, 'true', '', '');
        return { started: sco };
      }
    } catch (e) {}
    var links = Array.prototype.slice.call(
      document.querySelectorAll('a[href*="StartSCO"], a[onclick*="StartSCO"]')
    );
    for (var i = 0; i < links.length; i++) {
      var raw = (links[i].getAttribute('href') || '') + (links[i].getAttribute('onclick') || '');
      if (raw.indexOf("'" + sco + "'") >= 0) { links[i].click(); return { started: sco }; }
    }
    return { error: 'no-start-sco' };
  }

  // ---------- 以下只在课件 iframe 内执行 ----------
  if (!/(^|\.)centercourseware\.sflep\.com$/i.test(host)) return null;

  var $ = window.jQuery;
  var out = {
    url: location.href,
    filled: 0, choices: 0, items: 0,
    preFilled: 0, preChoices: 0, choiceTotal: 0,
    noJq: !$
  };

  // ---- 视听说课件：从 data/<unit>/<page>.html 读取答案并回填 ----
  // 题型：et-blank（填空，文本即答案）/ et-tof（正误，key=t|f）/ et-choice（单选，key=a|b|c|d）
  async function fillEtCourse() {
    var r = {
      kind: 'et',
      url: location.href,
      filled: 0, choices: 0, items: 0,
      preFilled: 0, preChoices: 0, choiceTotal: 0,
      blanks: 0, tofs: 0, choiceN: 0, picks: 0
    };

    var m = location.hash.match(/#\/([^\/]+)\/([^?\/]+)/);
    if (!m) { r.error = 'no-route'; return r; }

    var base = location.pathname.replace(/[^\/]*$/, '');
    var url = location.origin + base + 'data/' + m[1] + '/' + m[2] + '.html';

    var txt;
    try {
      var resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) { r.error = 'data-' + resp.status; return r; }
      txt = await resp.text();
    } catch (e) { r.error = 'fetch-fail'; return r; }

    var doc = new DOMParser().parseFromString(txt, 'text/html');
    // 源文件里一个空可能有多个可接受答案，用 " | " 分隔；取第一个与课件 key 一致
    var srcBlanks = Array.prototype.map.call(doc.querySelectorAll('et-blank'), function(e) {
      var s = (e.textContent || '').trim();
      return s.split('|')[0].trim();
    });
    var srcTofs = Array.prototype.map.call(doc.querySelectorAll('et-tof'), function(e) {
      return (e.getAttribute('key') || '').toLowerCase();
    });
    var srcChoices = Array.prototype.map.call(doc.querySelectorAll('et-choice'), function(e) {
      return (e.getAttribute('key') || '').toLowerCase();
    });

    // 1) 填空（普通输入 / 词库点选两种）
    function sleep(ms) { return new Promise(function(rr) { setTimeout(rr, ms); }); }

    // 在（优先同一 tab 的）选项库里找未被占用的同名选项
    function findOptionFor(blank, ans) {
      var scopes = [];
      try {
        var pane = blank.closest('tab');
        if (pane) scopes.push(pane);
      } catch (e) {}
      scopes.push(document);
      var fallback = null;
      for (var s = 0; s < scopes.length; s++) {
        var boxes = scopes[s].querySelectorAll('et-options');
        for (var i = 0; i < boxes.length; i++) {
          var lis = boxes[i].querySelectorAll('li');
          for (var k = 0; k < lis.length; k++) {
            if ((lis[k].textContent || '').trim() !== ans) continue;
            if ((lis[k].className || '').indexOf('used') < 0) return lis[k];
            if (!fallback) fallback = lis[k];
          }
        }
        if (scopes[s] !== document && fallback) return fallback;
      }
      return fallback;
    }

    var liveBlanks = Array.prototype.slice.call(document.querySelectorAll('et-blank'));
    for (var bi = 0; bi < liveBlanks.length; bi++) {
      var b = liveBlanks[bi];
      var ans = srcBlanks[bi];
      if (ans == null || ans === '') continue;
      r.items++;

      var isNoInput = !!(b.hasAttribute && b.hasAttribute('noinput'));
      var holder = b.querySelector(isNoInput ? '.blank' : '[contenteditable]');
      if (!holder) continue;
      if ((holder.textContent || '').trim() !== '') { r.preFilled++; continue; }  // 已有答案不覆盖

      if (isNoInput) {
        // 词库型：先切到该空所在的 tab（隐藏 tab 无法 focus），focus 后再点选项
        try {
          var pane = b.closest('tab');
          if (pane && /ng-hide/.test(pane.className || '')) {
            var tabs = pane.parentElement ? Array.prototype.filter.call(pane.parentElement.children, function(c) {
              return c.tagName === 'TAB';
            }) : [];
            var paneIdx = tabs.indexOf(pane);
            var tabEl = pane.closest('et-tab');
            var heads = tabEl ? tabEl.querySelectorAll('[header] li') : [];
            if (paneIdx >= 0 && heads[paneIdx]) { heads[paneIdx].click(); await sleep(200); }
          }
        } catch (e0) {}

        try { holder.dispatchEvent(new FocusEvent('focus', { bubbles: true })); } catch (e1) {}

        var optEl = findOptionFor(b, ans);
        if (optEl) {
          try {
            optEl.click();
            r.filled++; r.picks = (r.picks || 0) + 1;
          } catch (e2) {}
        }
        continue;
      }

      try {
        holder.focus();
        holder.textContent = ans;
        holder.dispatchEvent(new Event('input', { bubbles: true }));
        r.filled++; r.blanks++;
      } catch (e) {}
    }

    // 2) 正误判断
    Array.prototype.forEach.call(document.querySelectorAll('et-tof'), function(t, i) {
      var key = srcTofs[i];
      if (!key) return;
      r.choiceTotal++;
      if (t.querySelector('.chosen')) { r.preChoices++; return; }
      var spans = t.querySelectorAll('.controls span');
      var idx = key === 't' ? 0 : 1;
      var sp = spans[idx];
      if (!sp) return;
      try { sp.click(); r.choices++; r.tofs++; } catch (e) {}
    });

    // 3) 单选
    Array.prototype.forEach.call(document.querySelectorAll('et-choice'), function(c, i) {
      var key = srcChoices[i];
      if (!key) return;
      r.choiceTotal++;
      if (c.querySelector('.chosen')) { r.preChoices++; return; }
      var lis = c.querySelectorAll('li');
      var idx = key.charCodeAt(0) - 97;
      var li = lis[idx];
      if (!li) return;
      try { li.click(); r.choices++; r.choiceN++; } catch (e) {}
    });

    return r;
  }

  // ---- 视听说课件：提交（切到最后 tab → 调 etButton 控制器） ----
  async function submitEtCourse() {
    function sleep(ms) { return new Promise(function(rr) { setTimeout(rr, ms); }); }

    // 提交按钮只在最后一个 tab 出现/生效
    var heads = document.querySelectorAll('et-tab [header] li');
    if (heads.length) {
      try { heads[heads.length - 1].click(); } catch (e) {}
      await sleep(700);
    }

    var btn = null;
    var all = document.querySelectorAll('et-button');
    for (var i = 0; i < all.length; i++) {
      if ((all[i].getAttribute('action') || '').indexOf('item.submit') >= 0) { btn = all[i]; break; }
    }
    if (!btn) return { error: 'vc-no-submit-btn' };

    var el = btn.querySelector('button') || btn;

    // 优先走 Angular 控制器（脚本点击对 et-button 无效）
    try {
      var ng = window.angular;
      if (ng) {
        var ctrl = ng.element(el).controller('etButton');
        if (ctrl && typeof ctrl.doAction === 'function') {
          ctrl.doAction();
          var confirmed = await confirmDialog();
          return { ok: true, via: 'controller', confirmed: confirmed };
        }
      }
    } catch (e) {}

    try {
      el.click();
      var c2 = await confirmDialog();
      return { ok: true, via: 'click', confirmed: c2 };
    }
    catch (e2) { return { error: 'vc-submit-fail' }; }
  }

  // ---- 通用：等待并点击确认弹窗（继续提交 / 是 / 确定） ----
  async function confirmDialog() {
    function sleep(ms) { return new Promise(function(rr) { setTimeout(rr, ms); }); }
    var yesRe = /继续提交|确定|确认提交|提交|是|OK|Yes/i;
    for (var t = 0; t < 10; t++) {
      await sleep(350);

      // 1) 视听说：angular-confirm
      var box = document.querySelector('.ng-confirm-box');
      if (box && box.offsetParent !== null) {
        var bs = box.querySelectorAll('.ng-confirm-buttons button');
        var target = null;
        for (var i = 0; i < bs.length; i++) {
          if (yesRe.test((bs[i].textContent || '').trim())) { target = bs[i]; break; }
        }
        if (!target) target = box.querySelector('.btn-primary');
        if (target) { target.click(); await sleep(600); return true; }
      }

      // 2) 综合英语：layui 层里的「是」
      var links = document.querySelectorAll('a, button');
      for (var k = 0; k < links.length; k++) {
        var el = links[k];
        if (el.offsetParent === null) continue;
        var txt = (el.textContent || '').trim();
        if (txt === '是' || txt === '确定' || txt === '继续提交') { el.click(); return true; }
      }
    }
    return false;
  }

  if (op === 'fill') {
    // 视听说课件（AngularJS + et-* 指令）：答案在 data/<unit>/<page>.html 源文件里
    if (document.querySelector('et-item') && !document.querySelector('[data-controltype="filling"]')) {
      return fillEtCourse();
    }

    // 填空 / 选词：写入官方答案
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-controltype^="filling"]'),
      function(el) {
        out.items++;

        // 先看是否已经填过（用于「已填好 → 直接跳过、不等待」）
        try {
          if ($ && typeof $(el).values === 'function') {
            var prev = $(el).values();
            if (prev && prev.length && String(prev[0]).trim() !== '') out.preFilled++;
          } else {
            var pin = el.querySelector('input, textarea');
            if (pin && pin.value && String(pin.value).trim() !== '') out.preFilled++;
          }
        } catch (e0) {}

        var holder = el.querySelector('[data-solution]');
        var sol = holder && holder.getAttribute('data-solution');
        if (!sol) return;
        var ok = false;
        try {
          if ($ && typeof $(el).values === 'function') { $(el).values(sol); ok = true; }
        } catch (e) {}
        if (!ok) {
          try {
            var inp = el.querySelector('input, textarea');
            if (inp) {
              inp.value = sol;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              ok = true;
            }
          } catch (e2) {}
        }
        if (ok) out.filled++;
        try {
          var t = el.querySelector('[data-itemtype="input"]');
          if (t && $) $(t).trigger('change');
        } catch (e3) {}
      }
    );

    // 选择题：点击正确选项
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-controltype="choice"]'),
      function(g) {
        out.choiceTotal++;
        try {
          if ($ && typeof $(g).values === 'function') {
            var pv = $(g).values();
            if (pv && pv.length && pv[0] !== '' && pv[0] != null) out.preChoices++;
          }
        } catch (e0) {}

        var li = g.querySelector('li[data-solution]');
        if (!li) return;
        try {
          if ($) $(li).trigger('click'); else li.click();
          out.choices++;
        } catch (e) {}
      }
    );

    // 多选（点选词/名词等）：逐个点选正确项，已选中的跳过以免点掉
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-controltype="multichoice"]'),
      function(g) {
        out.choiceTotal++;
        var sols = g.querySelectorAll('li[data-solution]');
        var chosen = g.querySelectorAll('li[data-choiced]').length;
        if (sols.length > 0 && chosen >= sols.length) out.preChoices++;

        Array.prototype.forEach.call(sols, function(li) {
          if (li.hasAttribute && li.hasAttribute('data-choiced')) return;
          try {
            if ($) $(li).trigger('click'); else li.click();
            out.choices++;
            out.multiClicks = (out.multiClicks || 0) + 1;
          } catch (e) {}
        });
      }
    );
    return out;
  }

  // ---------- 提交（可选）：点「提交」→ 确认「是」 ----------
  if (op === 'submit') {
    // 视听说课件：提交按钮只在最后一个 tab 生效，走 Angular 控制器调用
    if (document.querySelector('et-item')) return submitEtCourse();

    function findSubmit() {
      var all = document.querySelectorAll('a, button, span, div');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.children.length > 0) continue;
        if ((el.textContent || '').replace(/\s+/g, '') === '提交') return el;
      }
      return null;
    }
    var btn = findSubmit();
    if (!btn) return { error: 'no-submit-button' };
    btn.click();
    return confirmDialog().then(function(c) { return { ok: true, confirmed: c }; });
  }

  return null;
}

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
  var tabId = port.sender && port.sender.tab ? port.sender.tab.id : null;

  // async 消息分发：返回 Promise 确保 MV3 在 await 期间保持 port 活跃
  port.onMessage.addListener((msg) => {
    if (msg.type === 'init') {
      return handleInit(port, msg, tabId);
    } else if (msg.type === 'agent-init') {
      return handleAgentInit(port, msg, tabId);
    }
  });
});

// ---- 独立的异步处理函数（通过 return Promise 保持 port 存活） ----

async function handleInit(port, msg, tabId) {
  console.log('[BG:handleInit] visionMode:', msg.visionMode, 'history:', (msg.history || []).length, '条');
  try {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS)))
    };
    console.log('[BG:handleInit] 模型:', settings.model, '端点:', settings.apiEndpoint);

    if (!settings.apiKey) {
      safePost(port, { type: 'error', content: '请先在设置中配置 API Key' });
      safePost(port, { type: 'done' });
      return;
    }

    settings.apiEndpoint = normalizeEndpoint(settings.apiEndpoint);
    const visionMode = msg.visionMode || 'none';
    const visionSettings = visionMode === 'vision' ? await loadVisionSettings() : null;

    const messages = [];
    if (settings.systemPrompt) {
      messages.push({ role: 'system', content: settings.systemPrompt });
    }

    let hasMultimodal = false;
    for (const m of msg.history) {
      const hasImgs = !!(m._images && m._images.length > 0);
      const storageKey = m._images?.[0]?.storageKey;
      const stored = storageKey ? await chrome.storage.local.get(storageKey) : {};
      const dataUrls = (stored[storageKey] || []).filter(Boolean);
      const hasValidImgs = hasImgs && dataUrls.length > 0;

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
        const desc = await describeImages(visionSettings, dataUrls, fullMsgText);
        messages.push({ role: m.role, content: desc });
        if (storageKey) chrome.storage.local.remove(storageKey);
      } else {
        messages.push({ role: m.role, content: fullMsgText });
      }
    }

    if (hasMultimodal) {
      console.log('[BG:handleInit] → chatCompletion (非流式)');
      await chatCompletion(settings, messages, port, tabId);
    } else {
      console.log('[BG:handleInit] → streamChat (流式)');
      await streamChat(settings, messages, port, tabId);
    }
    console.log('[BG:handleInit] ✓ 完成');
  } catch (err) {
    safePost(port, { type: 'error', content: err.message || '发生未知错误' });
    safePost(port, { type: 'done' });
  }
}

async function handleAgentInit(port, msg) {
  try {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS)))
    };

    if (!settings.apiKey) {
      safePost(port, { type: 'error', content: '请先在设置中配置 API Key' });
      safePost(port, { type: 'done' });
      return;
    }

    settings.apiEndpoint = normalizeEndpoint(settings.apiEndpoint);
    const convId = msg.convId || ('conv_' + Date.now());

    const agentData = await chrome.storage.local.get([
      'agentMaxSteps', 'agentSearchProvider', 'agentRequireConfirm'
    ]);
    const maxSteps = msg.maxSteps != null ? msg.maxSteps : (agentData.agentMaxSteps != null ? agentData.agentMaxSteps : 5);

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

    agentSession = {
      convId, controller: null, running: true,
      chatHistory, settings, maxSteps
    };
    await chrome.storage.local.set({
      _agentSync: { counter: Date.now(), convId, running: true, updatedAt: Date.now() },
      currentConvId: convId
    });

    await runAgentLoop(settings, messages, maxSteps, port);
  } catch (err) {
    safePost(port, { type: 'error', content: err.message || 'Agent 发生未知错误' });
    safePost(port, { type: 'done' });
  }
}

// ---- 流式调用 OpenAI 兼容 API ----
async function streamChat(settings, messages, port, tabId) {
  const controller = new AbortController();

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
    safePost(port, { type: 'error', content: `API 错误 (${response.status}): ${text || response.statusText}` });
    safePost(port, { type: 'done' });
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
          safePost(port, { type: 'done' });
          doneSent = true;
          return;
        }

        try {
          const json = JSON.parse(data);
          // 检测 SSE 流内错误 (如 OpenAI 返回的 error)
          if (json.error) {
            safePost(port, { type: 'error', content: json.error.message || JSON.stringify(json.error) });
            safePost(port, { type: 'done' });
            doneSent = true;
            return;
          }
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            chunkSent = true;
            safePost(port, { type: 'chunk', content });
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      safePost(port, { type: 'error', content: err.message });
    }
  } finally {
    // 流结束但未发送任何 chunk 也没有错误 → API 返回了空内容
    if (!doneSent && !chunkSent) {
      safePost(port, { type: 'error', content: 'API 返回了空响应，请检查模型是否支持多模态输入（如 gpt-4o）' });
    }
    if (!doneSent) {
      safePost(port, { type: 'done' });
    }
  }
}

// ---- 非流式调用 (用于多模态，避免 Qwen 等兼容性问题) ----
async function chatCompletion(settings, messages, port, tabId) {
  const controller = new AbortController();

  // 发送函数：三通道确保回复送达 (storage + tabs.sendMessage + port)
  let _msgSeq = 0;
  async function send(msg) {
    msg._seq = ++_msgSeq;
    let ok = 0;
    try { await chrome.storage.local.set({ _chatResponse: msg }); ok++; } catch (e) {}
    try { if (tabId) { await chrome.tabs.sendMessage(tabId, msg); ok++; } } catch (e) {}
    try { port.postMessage(msg); ok++; } catch (e) {}
    if (ok === 0) console.error('[ChatCompletion] 所有通道均失效！');
    else console.log('[ChatCompletion] 发送', msg.type, '(' + ok + '/3 通道 OK)');
  }

  // 180 秒超时
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort();
      // IIFE 确保 async send 完成写入
      (async () => {
        await send({ type: 'error', content: '请求超时（300秒），图片可能过大或网络不稳定' });
        await send({ type: 'done' });
      })();
    }
  }, 3000000);

  try {
    const body = JSON.stringify({ model: settings.model, messages, stream: false, max_tokens: 4096 });
    console.log('[ChatCompletion] >>> fetch, 请求体:', Math.round(body.length / 1024), 'KB');

    const response = await fetch(settings.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
      },
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('[ChatCompletion] HTTP', response.status);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[ChatCompletion] API 错误:', text.slice(0, 200));
      if (!controller.signal.aborted) {
        await send({ type: 'error', content: 'API 错误 (' + response.status + '): ' + (text || response.statusText) });
        await send({ type: 'done' });
      }
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    console.log('[ChatCompletion] 响应:', content ? content.length : 0, '字符');

    if (controller.signal.aborted) return;
    if (content) {
      await send({ type: 'chunk', content });
    } else {
      const reason = data.choices?.[0]?.finish_reason || '未知';
      await send({ type: 'error', content: 'API 返回空内容 (finish_reason: ' + reason + ')，请检查模型是否支持视觉输入' });
    }
    await send({ type: 'done' });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return;
    if (!controller.signal.aborted) {
      await send({ type: 'error', content: err.message });
      await send({ type: 'done' });
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

// ---- 从 AI 自由文本中解析选项字母（尽量容错） ----
function parseAnswerLetters(content, opts, qtype) {
  var allowed = {};   // letter -> text
  (opts || []).forEach(function(o) {
    if (o && o.letter) allowed[String(o.letter).toUpperCase()] = o.text || '';
  });
  var letters = [];
  function add(L) {
    if (!L) return;
    L = String(L).toUpperCase();
    if (allowed[L] && letters.indexOf(L) < 0) letters.push(L);
  }

  // 全角字母 → 半角
  var text = String(content || '').replace(/[Ａ-Ｚａ-ｚ]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  });
  var up = text.toUpperCase();

  // 0) JSON 结构化输出 {"answer":"ABD","reason":"..."}
  try {
    var mJson = text.match(/\{[\s\S]*\}/);
    if (mJson) {
      var obj = JSON.parse(mJson[0]);
      var ans = obj.answer != null ? obj.answer
              : (obj.answers != null ? obj.answers
              : (obj.letters != null ? obj.letters
              : (obj.result != null ? obj.result : '')));
      if (Array.isArray(ans)) ans = ans.join('');
      (String(ans).toUpperCase().match(/[A-H]/g) || []).forEach(add);
      if (letters.length) { if (qtype !== 'multi') letters = letters.slice(0, 1); letters.sort(); return letters; }
    }
  } catch (e) { /* 非 JSON，继续走文本解析 */ }

  // 1) “答案：X” / “正确答案为 X” 等
  var mAns = text.match(/(?:答案|正确答案|应选|选择|正确选项|正确的是|答案为|选项)\s*[是为：:、]?\s*([A-H]{1,8})/i);
  if (mAns) (mAns[1].toUpperCase().match(/[A-H]/g) || []).forEach(add);

  // 2) 带分隔符的字母组 “A、B、D” “A/B/D” “A和B”
  if (!letters.length) {
    var mGroup = text.match(/([A-H](?:\s*[、,，.．\/和及与]\s*[A-H]){1,7})/i);
    if (mGroup) (mGroup[1].toUpperCase().match(/[A-H]/g) || []).forEach(add);
  }

  // 3) 首行字母（可能连写 ABD）
  if (!letters.length) {
    var first = ((text.split('\n')[0]) || '').trim();
    var mFirst = first.match(/^[（(\[【\s]*([A-H]{1,8})/i);
    if (mFirst) (mFirst[1].toUpperCase().match(/[A-H]/g) || []).forEach(add);
  }

  // 4) 判断题文字
  if (!letters.length && qtype === 'judge') {
    if (/(正确|对的|说法正确|√|true)/i.test(text)) add('A');
    if (!letters.length && /(错误|不对|说法错误|×|false)/i.test(text)) add('B');
  }

  // 5) 文字匹配：AI 直接给出了选项内容
  if (!letters.length) {
    var plain = text.replace(/\s+/g, '');
    (opts || []).forEach(function(o) {
      if (!o || !o.text) return;
      var t = String(o.text).replace(/\s+/g, '');
      if (t.length >= 4 && plain.indexOf(t) >= 0) add(o.letter);
    });
  }

  // 6) 最后兜底：全文出现的合法字母
  if (!letters.length) {
    var mAny = up.match(/[A-H]/g) || [];
    if (qtype === 'multi') {
      mAny.forEach(add);
    } else {
      for (var i = 0; i < mAny.length; i++) {
        if (allowed[mAny[i]]) { add(mAny[i]); break; }
      }
    }
  }

  // 单选/判断只保留一个
  if (qtype !== 'multi') letters = letters.slice(0, 1);
  letters.sort();
  return letters;
}

// ---- 单题解答（非流式，用于自动答题，支持单选/多选/判断） ----
async function answerSingleQuestion(question, options, qtype) {
  try {
    const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
    const settings = { ...DEFAULT_SETTINGS, ...stored };

    if (!settings.apiKey) {
      return { error: '请先在设置中配置 API Key' };
    }

    const endpoint = normalizeEndpoint(settings.apiEndpoint);
    const opts = Array.isArray(options) ? options : [];

    // 构建选项文本
    const optionsText = opts
      .map(o => `${o.letter}. ${o.text}`)
      .join('\n');

    const typeHint = qtype === 'multi' ? '多选题' : (qtype === 'judge' ? '判断题' : '单选题');

    const messages = [
      { role: 'system', content: AUTO_ANSWER_PROMPT },
      { role: 'user', content: `【题型】${typeHint}\n\n题目：${question}\n\n选项：\n${optionsText}` }
    ];

    // 单次模型调用（可指定是否使用 json_object 结构化输出）
    async function callModel(useJson) {
      const body = {
        model: settings.model,
        messages: messages.slice(),
        max_tokens: 500,
        temperature: 0
      };
      if (useJson) body.response_format = { type: 'json_object' };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cleanStr(settings.apiKey)
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`API 错误 (${res.status}): ${text || res.statusText}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    // 1) 首选 JSON 结构化输出；端点不支持时自动回退到普通模式
    let useJson = true;
    let content = '';
    try {
      content = await callModel(true);
    } catch (e) {
      if (e.status === 400 || e.status === 404 || e.status === 422) {
        useJson = false;
        content = await callModel(false);
      } else {
        throw e;
      }
    }

    let letters = parseAnswerLetters(content, opts, qtype);

    // 1.5) 返回为空（部分端点对 json_object 支持不完整）→ 用普通模式重试一次
    if (!letters.length && !content.trim() && useJson) {
      try {
        useJson = false;
        content = await callModel(false);
        letters = parseAnswerLetters(content, opts, qtype);
      } catch (e) { /* 忽略，继续走修复 */ }
    }

    // 2) 解析失败 → 强制修复重试（校验 + 自我修正，主流 Agent 做法）
    if (!letters.length) {
      try {
        messages.push({ role: 'assistant', content: content || '(空)' });
        messages.push({
          role: 'user',
          content: '你上一次没有给出可解析的答案。现在只输出正确选项的字母，不要任何汉字、解释或标点：' +
            (qtype === 'multi' ? '多选题连写全部字母，例如 ABD' : '只输出单个字母，例如 A')
        });
        const repaired = await callModel(useJson);
        if (repaired) content = content + '\n---修复---\n' + repaired;
        letters = parseAnswerLetters(repaired, opts, qtype);
        if (!letters.length) letters = parseAnswerLetters(content, opts, qtype);
      } catch (e2) { /* 修复失败则忽略，返回空 */ }
    }

    // 3) 提取解析（优先取 JSON 的 reason 字段）
    let reason = '';
    try {
      const jm = content.match(/\{[\s\S]*\}/);
      if (jm) {
        const jo = JSON.parse(jm[0]);
        if (jo && jo.reason) reason = String(jo.reason);
      }
    } catch (e) { /* 非 JSON */ }
    if (!reason) {
      const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
      reason = lines.slice(1).join(' ').trim()
        || (lines[0] || '').replace(/^[\sA-Za-z.、，,。:：{"]+/, '').trim()
        || '';
    }

    return { letter: letters.join(''), letters: letters, reason: reason.slice(0, 120), raw: content.slice(0, 600) };
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
      safePost(port, { type: 'error', content: 'Agent 执行超时(5分钟)，任务可能过于复杂。' });
      safePost(port, { type: 'done' });
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
        if (port) safePost(port, { type: 'agent-thinking', step: stepCount, maxSteps: effectiveMax });
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
          if (port) safePost(port, {
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
          if (port) safePost(port, {
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
        if (port) safePost(port, { type: 'chunk', content: msg.content });
        if (port) safePost(port, { type: 'done' });
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
      if (port) safePost(port, { type: 'error', content: 'API 返回空结果，Agent 结束。' });
      if (port) safePost(port, { type: 'done' });
      if (agentSession) { agentSession.running = false; await agentPersistToStorage(); agentSession = null; }
      return;

    } catch (err) {
      if (err.name === 'AbortError') {
        if (port) safePost(port, { type: 'error', content: 'Agent 已被取消' });
      } else {
        if (port) safePost(port, { type: 'error', content: err.message || 'Agent 执行失败' });
      }
      if (port) safePost(port, { type: 'done' });
      if (agentSession) { agentSession.running = false; await agentPersistToStorage(); agentSession = null; }
      return;
    }
  }

  // 超步数
  if (port) safePost(port, {
    type: 'error',
    content: maxSteps > 0
      ? `Agent 达到最大步数(${maxSteps})，已执行${stepCount}步，请检查结果或增加步数限制。`
      : `Agent 已执行${stepCount}步并超时，任务可能过于复杂。`
  });
  if (port) safePost(port, { type: 'done' });
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
