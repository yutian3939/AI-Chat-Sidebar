// ============================================================
// content/welearn.js — WE Learn（welearn.sflep.com）自主学习自动完成
//
// 原理：
//   WE Learn 的 SCO 课件（centercourseware.sflep.com）里，每个填空 / 选项
//   节点都带着 data-solution（官方答案）属性。课件本身用 jQuery 插件
//   .values() 维护答题状态：
//     · 填空：[data-controltype^="filling"] → $(el).values(答案)
//     · 选择：[data-controltype="choice"]   → 点击 li[data-solution]
//   由于课件在跨域 iframe 中且需要页面自身的 jQuery 插件，本模块通过
//   background 的 chrome.scripting.executeScript(world:'MAIN') 在所有 frame
//   中执行填答函数。
//
// 流程（状态机，靠 chrome.storage.local 跨页面续跑）：
//   任务列表页 → 选择起始练习 → StartSCO(第 N 个) → 课件页
//   → 判断是否已答完（是则跳过、不等待）→ 否则填答 → 随机停留 10~15 分钟
//   → 回任务列表页 → 下一个
// ============================================================
'use strict';
(function() {
  var STORE_KEY = 'welearnRun';
  var PREF_KEY = 'welearnPrefs';

  var running = false;
  var timer = null;
  var tickTimer = null;
  var pickerEl = null;
  var booted = false;

  function ctx() { return window.__CTX__; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ======================== 页面判断 ========================

  function isWeLearn() {
    return /(^|\.)welearn\.sflep\.com$/i.test(location.hostname);
  }
  function isTaskPage() {
    return isWeLearn() && /\/student\/tasksco\.aspx/i.test(location.pathname);
  }
  function isScoPage() {
    return isWeLearn() && /\/student\/StudyCourse\.aspx/i.test(location.pathname);
  }
  function isAnyWeLearnPage() {
    return isTaskPage() || isScoPage();
  }

  function currentScoId() {
    var m = location.search.match(/[?&]sco=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // ======================== 配置 ========================

  var prefs = { minMin: 10, maxMin: 15, submit: false, skipDone: true };

  function loadPrefs() {
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get([PREF_KEY], function(data) {
          var p = (data && data[PREF_KEY]) || {};
          if (p.minMin != null) prefs.minMin = Math.max(0, Number(p.minMin) || 0);
          if (p.maxMin != null) prefs.maxMin = Math.max(0, Number(p.maxMin) || 0);
          if (p.submit != null) prefs.submit = !!p.submit;
          if (p.skipDone != null) prefs.skipDone = !!p.skipDone;
          if (prefs.maxMin < prefs.minMin) prefs.maxMin = prefs.minMin;
          resolve(prefs);
        });
      } catch (e) { resolve(prefs); }
    });
  }

  // 停留时长（毫秒）：0 表示不停留
  function pickDwellMs(minMin, maxMin) {
    var lo = Math.max(0, Number(minMin) || 0) * 60000;
    var hi = Math.max(0, Number(maxMin) || 0) * 60000;
    if (hi < lo) hi = lo;
    if (hi === 0) return 0;
    return Math.round(lo + Math.random() * (hi - lo));
  }

  function savePrefs() {
    try { chrome.storage.local.set({ welearnPrefs: prefs }); } catch (e) {}
  }

  function bindPrefInputs() {
    var C = ctx();
    if (!C || !C.shadow) return;
    var $min = C.shadow.getElementById('settings-wl-min');
    var $max = C.shadow.getElementById('settings-wl-max');
    var $submit = C.shadow.getElementById('settings-wl-submit');
    var $skip = C.shadow.getElementById('settings-wl-skip-done');
    if ($min) $min.value = String(prefs.minMin);
    if ($max) $max.value = String(prefs.maxMin);
    if ($submit) $submit.checked = prefs.submit;
    if ($skip) $skip.checked = prefs.skipDone;

    function commit() {
      prefs.minMin = Math.max(0, parseInt(($min && $min.value) || '0', 10) || 0);
      prefs.maxMin = Math.max(prefs.minMin, parseInt(($max && $max.value) || '0', 10) || 0);
      prefs.submit = !!($submit && $submit.checked);
      prefs.skipDone = !!($skip && $skip.checked);
      savePrefs();
    }
    if ($min && $min.getAttribute('data-bound') !== '1') { $min.setAttribute('data-bound', '1'); $min.addEventListener('change', commit); }
    if ($max && $max.getAttribute('data-bound') !== '1') { $max.setAttribute('data-bound', '1'); $max.addEventListener('change', commit); }
    if ($submit && $submit.getAttribute('data-bound') !== '1') { $submit.setAttribute('data-bound', '1'); $submit.addEventListener('change', commit); }
    if ($skip && $skip.getAttribute('data-bound') !== '1') { $skip.setAttribute('data-bound', '1'); $skip.addEventListener('change', commit); }
  }

  // ======================== 聊天日志（持久化，不怕重绘） ========================

  var LOG_KEY = 'welearnLog';
  var LOG_MAX = 300;
  var _logLines = [];
  var _logEl = null;
  var _logSaving = null;
  var _logWatch = null;

  function logScroll() {
    var C = ctx();
    if (C && C.$messages) C.$messages.scrollTop = C.$messages.scrollHeight;
  }

  function buildLogText() {
    return '▶ WE Learn 自动练习\n' + _logLines.join('\n') + (_logLines.length ? '\n' : '');
  }

  // 保证日志气泡在 messages 里（侧边栏重绘 / 会话切换后会自动重建）
  function renderLog() {
    var C = ctx();
    if (!C || !C.$messages) return;
    if (_logLines.length === 0) return;

    if (_logEl && C.$messages.contains(_logEl)) {
      _logEl.textContent = buildLogText();
      logScroll();
      return;
    }

    // 旧气泡已被销毁，重建
    if (_logEl && _logEl.parentNode && _logEl.parentNode.parentNode) {
      try { _logEl.parentNode.parentNode.removeChild(_logEl.parentNode); } catch (e) {}
    }
    _logEl = null;

    var wrap = document.createElement('div');
    wrap.className = 'msg ai';
    wrap.setAttribute('data-log', 'welearn');
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-all';
    bubble.style.fontFamily = "'Cascadia Code', Consolas, monospace";
    bubble.style.fontSize = '12px';
    bubble.style.lineHeight = '1.5';
    bubble.textContent = buildLogText();
    wrap.appendChild(bubble);
    C.$messages.appendChild(wrap);
    _logEl = bubble;
    logScroll();
  }

  function persistLog() {
    if (_logSaving) return;
    _logSaving = setTimeout(function() {
      _logSaving = null;
      try {
        var o = {};
        o[LOG_KEY] = _logLines.slice(-LOG_MAX);
        chrome.storage.local.set(o);
      } catch (e) {}
    }, 400);
  }

  function logLine(txt) {
    var t = new Date();
    var hh = String(t.getHours()).padStart(2, '0');
    var mm = String(t.getMinutes()).padStart(2, '0');
    var ss = String(t.getSeconds()).padStart(2, '0');
    _logLines.push('[' + hh + ':' + mm + ':' + ss + '] ' + txt);
    if (_logLines.length > LOG_MAX) _logLines.splice(0, _logLines.length - LOG_MAX);
    persistLog();
    renderLog();
  }

  function logClear() {
    _logLines = [];
    if (_logEl && _logEl.parentNode && _logEl.parentNode.parentNode) {
      try { _logEl.parentNode.parentNode.removeChild(_logEl.parentNode); } catch (e) {}
    }
    _logEl = null;
    try { var o = {}; o[LOG_KEY] = []; chrome.storage.local.set(o); } catch (e) {}
  }

  function loadLog() {
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get(LOG_KEY, function(data) {
          var arr = (data && data[LOG_KEY]) || [];
          if (Array.isArray(arr)) _logLines = arr.slice(-LOG_MAX);
          resolve(_logLines);
        });
      } catch (e) { resolve(_logLines); }
    });
  }

  // 侧边栏重绘会把日志气泡冲掉 → 轻量看门狗负责补回来
  function startLogWatch() {
    if (_logWatch) return;
    _logWatch = setInterval(function() {
      if (_logLines.length) renderLog();
    }, 2500);
  }
  function stopLogWatch() {
    if (_logWatch) { clearInterval(_logWatch); _logWatch = null; }
  }

  // 保证侧边栏打开（用户要求：工作时保持打开）
  function ensureSidebarOpen() {
    var C = ctx();
    if (!C) return;
    if (C.sidebarOpen) return;
    try { if (typeof C.toggleSidebar === 'function') C.toggleSidebar(true); } catch (e) {}
  }

  // ======================== 运行状态存取 ========================

  function getRun() {
    return new Promise(function(resolve) {
      try {
        chrome.storage.local.get([STORE_KEY], function(data) {
          resolve((data && data[STORE_KEY]) || null);
        });
      } catch (e) { resolve(null); }
    });
  }
  function setRun(run) {
    return new Promise(function(resolve) {
      try { chrome.storage.local.set({ welearnRun: run }, function() { resolve(); }); }
      catch (e) { resolve(); }
    });
  }
  function clearRun() {
    return new Promise(function(resolve) {
      try { chrome.storage.local.remove(STORE_KEY, function() { resolve(); }); }
      catch (e) { resolve(); }
    });
  }

  // ======================== 与 background 通信（MAIN world） ========================

  function mainWorld(op, sco) {
    return new Promise(function(resolve) {
      try {
        chrome.runtime.sendMessage({ type: 'welearn-main', op: op, sco: sco || '' }, function(res) {
          if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
          resolve(res || { ok: false, error: '无返回' });
        });
      } catch (e) { resolve({ ok: false, error: e.message }); }
    });
  }

  // ======================== 解析任务列表 ========================

  function rowInfo(a) {
    var node = a;
    for (var d = 0; d < 6 && node; d++) {
      if (node.tagName === 'TR') {
        var label = '', status = '';
        var cells = node.querySelectorAll('td');
        for (var i = 0; i < cells.length; i++) {
          var t = (cells[i].textContent || '').replace(/\s+/g, ' ').trim();
          if (!t) continue;
          if (/^(\d+%|未完成)$/.test(t)) { status = t; continue; }
          if (t.length > label.length) label = t;
        }
        if (label || status) return { label: label, status: status };
      }
      node = node.parentElement;
    }
    node = a.parentElement;
    for (var k = 0; k < 4 && node; k++) {
      var txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
      var m = txt.match(/(未完成|\d+%)/);
      if (m) {
        return {
          label: txt.replace(/(未完成|\d+%)/g, '').replace(/\s*开始\s*/g, ' ').trim(),
          status: m[1]
        };
      }
      node = node.parentElement;
    }
    return { label: '', status: '' };
  }

  function parseTaskRows(doc) {
    doc = doc || document;
    var rows = [];
    var seen = {};
    var anchors = doc.querySelectorAll('a[href*="StartSCO"], a[onclick*="StartSCO"]');

    Array.prototype.forEach.call(anchors, function(a) {
      var raw = (a.getAttribute('href') || '') + ' ' + (a.getAttribute('onclick') || '');
      var m = raw.match(/StartSCO\(\s*'([^']+)'\s*,\s*'([^']*)'/);
      if (!m) return;
      var sco = m[1];
      if (m[2] !== 'true') return;

      var info = rowInfo(a);
      var label = info.label || (a.textContent || '').replace(/\s+/g, ' ').trim();

      if (!seen[sco]) {
        seen[sco] = true;
        rows.push({ sco: sco, label: label, status: info.status });
      } else if (info.status) {
        for (var k = 0; k < rows.length; k++) {
          if (rows[k].sco === sco && !rows[k].status) rows[k].status = info.status;
        }
      }
    });

    return rows;
  }

  // ======================== UI ========================

  function status(text) {
    var C = ctx();
    if (C && C.$welearnStatus) C.$welearnStatus.textContent = text || '';
  }

  function idleBtnLabel() {
    var icon = window.AIChatICONS ? window.AIChatICONS.AUTO : '▶';
    return icon + (isScoPage() ? '自动答题' : '自动练习');
  }

  function setBtnUI(on, progressPct) {
    var C = ctx();
    if (!C) return;
    if (C.$welearnBtnText) {
      C.$welearnBtnText.innerHTML = on
        ? (isScoPage() ? '⏹ 停止答题' : '⏹ 停止自动练习')
        : idleBtnLabel();
    }
    if (C.$welearnBtnFill) C.$welearnBtnFill.style.width = (on ? (progressPct || 0) : 0) + '%';
  }

  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function fmtSec(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ======================== 起始练习选择器 ========================

  function hidePicker() {
    if (pickerEl && pickerEl.parentNode) {
      try { pickerEl.parentNode.removeChild(pickerEl); } catch (e) {}
    }
    pickerEl = null;
  }

  function showPicker(rows) {
    var C = ctx();
    if (!C || !C.$messages) return;
    hidePicker();
    var wel = C.shadow.getElementById('welcome');
    if (wel) wel.remove();

    pickerEl = document.createElement('div');
    pickerEl.className = 'auto-results';

    var html = '<div class="auto-results-head">' +
      '<span class="arr">▶</span>' +
      '<span>选择起始练习（共 ' + rows.length + ' 个未完成）</span>' +
      '</div><div class="auto-results-body">';

    html += '<div class="auto-item" data-start="0" style="cursor:pointer">' +
      '<div class="auto-item-num">▶</div>' +
      '<div class="auto-item-body"><div><b>从第 1 个开始</b></div>' +
      '<div style="font-size:12px;color:var(--md-outline)">依次完成全部未完成练习</div></div></div>';

    rows.forEach(function(r, i) {
      html += '<div class="auto-item" data-start="' + i + '" style="cursor:pointer">' +
        '<div class="auto-item-num">' + (i + 1) + '</div>' +
        '<div class="auto-item-body">' +
        '<div>' + esc(r.label) + '</div>' +
        '<div style="font-size:12px;color:var(--md-outline)">' + esc(r.status || '未完成') + '</div>' +
        '</div></div>';
    });
    html += '</div>';

    pickerEl.innerHTML = html;
    C.$messages.appendChild(pickerEl);
    logScroll();

    pickerEl.addEventListener('click', function(e) {
      var t = e.target;
      while (t && t !== pickerEl && !t.getAttribute('data-start')) t = t.parentNode;
      if (!t || t === pickerEl) return;
      var idx = parseInt(t.getAttribute('data-start'), 10) || 0;
      hidePicker();
      startFrom(rows, idx);
    });
  }

  // ======================== 开始 / 停止 ========================

  function onButtonClick() {
    if (running) { stop(); return; }
    if (!isAnyWeLearnPage()) { status('请在 WE Learn 任务页使用'); return; }

    // 练习页：只完成当前这一个练习
    if (isScoPage()) { startSingle(); return; }

    if (!isTaskPage()) { status('请先回到「学习任务」列表页再启动'); return; }

    var rows = parseTaskRows();
    if (!rows.length) { status('未解析到练习列表，请刷新页面重试'); return; }

    var queue = rows.filter(function(r) {
      if (prefs.skipDone && /^\d+%$/.test(r.status)) return false;
      return true;
    });
    if (!queue.length) { status('没有需要完成的练习'); return; }

    showPicker(queue);
    status('请选择从哪个练习开始（共 ' + queue.length + ' 个）');
  }

  // 练习页：直接完成当前这一个练习（不排队、不停留、不跳转）
  async function startSingle() {
    await loadPrefs();
    var sco = currentScoId();

    running = true;
    setBtnUI(true, 0);
    logClear();
    logLine('开始时间 ' + new Date().toLocaleTimeString());
    logLine('自动答题：只处理当前这一个练习（' + (sco || '当前页') + '）');
    ensureSidebarOpen();
    renderLog();
    startLogWatch();

    status('正在读取题目…');
    var r = await fillUntilOk(60000);
    if (r.stopped) return;

    if (!r.ok) {
      status('未检测到题目');
      logLine('⚠ 未检测到题目' + (r.error ? '（' + r.error + '）' : '（可能是没有习题的页面，或页面还没加载完）'));
      running = false;
      setBtnUI(false);
      return;
    }

    if (isAlreadyAnswered(r)) {
      logLine('ℹ 打开时答案已填好（' + (r.items ? r.preFilled + '/' + r.items + ' 空' : '选择题已选') + '）');
      status('答案已填好');
    } else {
      logLine('✓ 已填入官方答案：' + describeFill(r) +
        (r.items ? '（共 ' + r.items + ' 空）' : ''));
      status('已填 ' + describeFill(r));
    }

    if (prefs.submit) {
      await sleep(800);
      await doSubmit();
      await sleep(2500);
    } else {
      logLine('未开启自动提交，答案已留在页面');
    }

    logLine('✅ 本练习处理完成');
    status('本练习完成 ✓');
    running = false;
    setBtnUI(false);
  }

  async function startFrom(queue, startIdx) {
    await loadPrefs();
    startIdx = Math.max(0, Math.min(startIdx || 0, queue.length - 1));

    var old = await getRun();
    var doneScos = (old && old.active && old.taskRunId === location.search && old.doneScos) ? old.doneScos.slice() : [];

    var rest = queue.slice(startIdx).filter(function(r) { return doneScos.indexOf(r.sco) < 0; });
    if (!rest.length) { status('所选范围已全部完成 ✓'); return; }

    running = true;
    setBtnUI(true, 0);
    logClear();
    logLine('开始时间 ' + new Date().toLocaleTimeString());
    ensureSidebarOpen();
    renderLog();
    startLogWatch();
    logLine('队列共 ' + rest.length + ' 个练习，从第 ' + (startIdx + 1) + ' 个开始');
    var dwellTxt = (prefs.minMin === 0 && prefs.maxMin === 0)
      ? '不停留'
      : (prefs.minMin + '~' + prefs.maxMin + ' 分钟随机');
    logLine('停留时间：' + dwellTxt + '；' +
      (prefs.submit ? '自动提交（停留结束后提交）' : '不提交（答案留在页面）') +
      '；跳过已完成：' + (prefs.skipDone ? '开' : '关'));

    var run = {
      active: true,
      taskUrl: location.pathname + location.search,
      taskRunId: location.search,
      queue: rest,
      index: 0,
      doneScos: doneScos,
      phase: 'next',
      currentSco: '',
      dwellMs: 0,
      dwellStart: 0,
      minMin: prefs.minMin,
      maxMin: prefs.maxMin,
      submit: !!prefs.submit,
      skipDone: !!prefs.skipDone,
      startedAt: Date.now()
    };
    await setRun(run);
    await advance(run);
  }

  async function stop(silent) {
    running = false;
    clearTimers();
    hidePicker();
    await clearRun();
    setBtnUI(false);
    if (!silent) { status('已停止'); logLine('⏹ 已手动停止'); }
    stopLogWatch();
  }

  // ======================== 推进：开始下一个练习 ========================

  async function advance(run) {
    if (!run || !run.active) return;
    if (run.index >= run.queue.length) {
      running = false;
      clearTimers();
      stopLogWatch();
      await clearRun();
      setBtnUI(false);
      status('全部练习已完成 ✓');
      logLine('✅ 全部练习已完成');
      return;
    }
    var item = run.queue[run.index];
    run.phase = 'fill';
    run.currentSco = item.sco;
    await setRun(run);

    var idxTxt = '[' + (run.index + 1) + '/' + run.queue.length + ']';
    status('打开练习 ' + (run.index + 1) + '/' + run.queue.length + '：' + shorten(item.label));
    setBtnUI(true, Math.round((run.index / run.queue.length) * 100));
    logLine(idxTxt + ' 打开：' + item.label + '  (' + item.sco + ')');

    var res = await mainWorld('start', item.sco);
    var startedOk = false;
    if (res && res.ok && res.results) {
      res.results.forEach(function(r) { if (r && r.started) startedOk = true; });
    }
    if (!startedOk) {
      run.phase = 'next';
      await setRun(run);
      running = false;
      setBtnUI(false);
      status('打开练习失败：' + ((res && res.error) || '未找到 StartSCO'));
      logLine('✗ 打开失败：' + ((res && res.error) || '未找到 StartSCO'));
      return;
    }
  }

  function shorten(s, n) {
    s = String(s || '');
    n = n || 34;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // ======================== 课件页：填答 + 停留 ========================

  async function fillUntilOk(maxWaitMs) {
    var deadline = Date.now() + (maxWaitMs || 45000);
    var last = null;
    while (Date.now() < deadline) {
      if (!running) return { ok: false, stopped: true };
      var res = await mainWorld('fill');
      if (res && res.ok) {
        var frames = (res.results || []).filter(Boolean);
        var agg = {
          filled: 0, choices: 0, items: 0, preFilled: 0, preChoices: 0,
          choiceTotal: 0, multiClicks: 0, blanks: 0, tofs: 0, choiceN: 0, kind: '', error: ''
        };
        frames.forEach(function(f) {
          if (typeof f.filled !== 'number') return;
          agg.filled += f.filled;
          agg.choices += f.choices || 0;
          agg.items += f.items || 0;
          agg.preFilled += f.preFilled || 0;
          agg.preChoices += f.preChoices || 0;
          agg.choiceTotal += f.choiceTotal || 0;
          agg.multiClicks += f.multiClicks || 0;
          agg.blanks += f.blanks || 0;
          agg.tofs += f.tofs || 0;
          agg.choiceN += f.choiceN || 0;
          if (f.kind) agg.kind = f.kind;
          if (f.error) agg.error = f.error;
        });
        last = agg;
        if (agg.filled + agg.choices + agg.items + agg.choiceTotal > 0) {
          agg.ok = true;
          return agg;
        }
      }
      await sleep(1500);
    }
    return { ok: false, timeout: true, last: last };
  }

  // 已答完判定：所有填空都有值，且所有选择题都已选
  function isAlreadyAnswered(r) {
    var noItems = !(r.items > 0) && !(r.choiceTotal > 0);
    if (noItems) return false;
    var blankOk = r.items > 0 ? r.preFilled >= r.items : true;
    var choiceOk = r.choiceTotal > 0 ? r.preChoices >= r.choiceTotal : true;
    return blankOk && choiceOk;
  }

  // 把统计数据说成人话
  function describeFill(r) {
    var parts = [];
    if (r.blanks) parts.push('填空 ' + r.blanks);
    if (r.tofs) parts.push('判断 ' + r.tofs);
    if (r.choiceN) parts.push('单选 ' + r.choiceN);
    if (r.multiClicks) parts.push('点选 ' + r.multiClicks);
    if (!parts.length && r.filled) parts.push(r.filled + ' 空');
    if (!parts.length && r.choices) parts.push(r.choices + ' 处');
    return parts.join(' · ');
  }

  async function resumeOnScoPage() {
    var run = await getRun();
    if (!run || !run.active) return;
    if (run.phase !== 'fill' && run.phase !== 'dwell') return;

    var sco = currentScoId();
    if (run.currentSco && sco && sco !== run.currentSco) {
      run.currentSco = sco;
      run.phase = 'fill';
    }

    running = true;
    setBtnUI(true, Math.round((run.index / run.queue.length) * 100));

    var idxTxt = '[' + (run.index + 1) + '/' + run.queue.length + ']';
    var item = run.queue[run.index] || {};

    if (run.phase === 'fill') {
      ensureSidebarOpen();
      renderLog();
      status(idxTxt + ' 正在读取题目…');
      logLine(idxTxt + ' 读取题目：' + (item.label || sco));

      var r = await fillUntilOk(60000);
      if (r.stopped) return;

      if (!r.ok) {
        status(idxTxt + ' 未检测到题目，跳过');
        logLine('⚠ 未检测到题目' + (r.error ? '（' + r.error + '）' : '（页面可能未加载完）') + '，跳过');
        await skipCurrent(run, 2500);
        return;
      }

      var skipByDone = (run.skipDone !== false) && isAlreadyAnswered(r);
      if (skipByDone) {
        logLine('⏭ 打开时答案已填好（' + (r.items ? r.preFilled + '/' + r.items + ' 空' : '选择题已选') +
          '），按设置直接跳过、不等待');
        status(idxTxt + ' 已答完，跳过');
        await skipCurrent(run, 1500);
        return;
      }

      logLine('✓ 已填入官方答案：' + describeFill(r) +
        (r.items ? '（共 ' + r.items + ' 空）' : ''));
      status(idxTxt + ' 已填 ' + describeFill(r));

      run.dwellMs = pickDwellMs(
        run.minMin != null ? run.minMin : prefs.minMin,
        run.maxMin != null ? run.maxMin : prefs.maxMin
      );
      run.dwellStart = Date.now();
      run.phase = 'dwell';
      await setRun(run);

      if (run.dwellMs <= 0) {
        logLine('⏱ 停留 0 秒（不停留）→ 直接下一个');
        await finishDwell(run);
        return;
      }
      logLine('⏱ 停留 ' + Math.round(run.dwellMs / 1000) + ' 秒后切换下一个');
    }

    var remain = (run.dwellStart + run.dwellMs) - Date.now();
    if (remain <= 0) { await finishDwell(run); return; }
    startDwellCountdown(run, remain, idxTxt);
  }

  function startDwellCountdown(run, remainMs, idxTxt) {
    clearTimers();
    var endAt = Date.now() + remainMs;
    var total = remainMs;
    var nextLog = Date.now() + 300000; // 每 5 分钟写一条日志

    function tick() {
      var left = endAt - Date.now();
      if (left <= 0) {
        clearTimers();
        finishDwell(run);
        return;
      }
      if (Date.now() >= nextLog && left > 60000) {
        nextLog = Date.now() + 300000;
        logLine('⏳ 停留中，剩余 ' + fmtSec(left / 1000));
      }
      var pct = Math.round(((total - left) / total) * 100);
      status(idxTxt + ' 停留中 ' + fmtSec(left / 1000) + ' 后切换（' +
        Math.round(run.dwellMs / 60000) + ' 分钟）');
      setBtnUI(true, pct);
    }
    tick();
    tickTimer = setInterval(tick, 1000);
  }

  // 直接跳过当前练习（不停留）
  async function skipCurrent(run, delayMs) {
    clearTimers();
    run.phase = 'next';
    run.doneScos = run.doneScos || [];
    if (run.currentSco && run.doneScos.indexOf(run.currentSco) < 0) run.doneScos.push(run.currentSco);
    run.index = (run.index || 0) + 1;
    await setRun(run);
    timer = setTimeout(function() { goTaskPage(run); }, delayMs || 1200);
  }

  // 提交：点「提交」并确认「是」
  async function doSubmit() {
    logLine('📤 提交答案…');
    var sr = await mainWorld('submit');
    var errMap = {
      'vc-no-submit-btn': '未找到视听说课件的提交按钮',
      'vc-submit-fail': '视听说课件提交调用失败',
      'no-submit-button': '未找到提交按钮'
    };
    var ok = !!(sr && sr.ok !== false && !sr.error);
    logLine(ok ? '✓ 已提交（记录为首次答题正确率）'
      : ('✗ 提交失败：' + (errMap[sr && sr.error] || (sr && sr.error) || '未知错误')));
    return ok;
  }

  async function finishDwell(run) {
    clearTimers();
    // 自动提交：等停留结束后再提交（不停留时即为填完即交）
    if (run.submit) {
      await sleep(500);
      await doSubmit();
      await sleep(2500);
    }
    run.phase = 'next';
    run.doneScos = run.doneScos || [];
    if (run.currentSco && run.doneScos.indexOf(run.currentSco) < 0) run.doneScos.push(run.currentSco);
    run.index = (run.index || 0) + 1;
    await setRun(run);
    logLine('➡ 本练习完成，返回任务列表');
    status('本练习完成，正在返回任务列表…');
    goTaskPage(run);
  }

  function goTaskPage(run) {
    var url = run.taskUrl || '/student/TaskSco.aspx';
    setTimeout(function() {
      location.href = url.indexOf('http') === 0
        ? url
        : (location.origin + (url.charAt(0) === '/' ? '' : '/') + url);
    }, 600);
  }

  // TaskSco 页：接续 next 阶段
  async function resumeOnTaskPage() {
    var run = await getRun();
    if (!run || !run.active) return;
    if (run.phase !== 'next') return;

    running = true;
    setBtnUI(true, Math.round((run.index / run.queue.length) * 100));
    setTimeout(function() { advance(run); }, 1500);
  }

  // ======================== 入口 ========================

  async function boot() {
    if (booted) return;
    booted = true;
    if (!isAnyWeLearnPage()) return;
    await loadPrefs();
    setTimeout(bindPrefInputs, 1200);

    // 有正在进行的任务：恢复日志 + 保持侧边栏打开
    try {
      var run0 = await getRun();
      if (run0 && run0.active) {
        await loadLog();
        ensureSidebarOpen();
        startLogWatch();
        setTimeout(renderLog, 900);
        setTimeout(renderLog, 2500);
      }
    } catch (e0) {}

    try {
      if (isScoPage()) await resumeOnScoPage();
      else if (isTaskPage()) await resumeOnTaskPage();
    } catch (e) { /* 静默 */ }
  }

  function bindEvents() {
    var C = ctx();
    if (!C || !C.$btnWelearn) return;
    if (C.$btnWelearn.getAttribute('data-bound') !== '1') {
      C.$btnWelearn.setAttribute('data-bound', '1');
      C.$btnWelearn.addEventListener('click', onButtonClick);
    }
    setTimeout(bindPrefInputs, 800);
    if (isAnyWeLearnPage()) {
      if (ctx() && ctx().$btnWelearn) {
        ctx().$btnWelearn.title = isScoPage()
          ? 'WE Learn：直接完成当前这一个练习（按官方答案填写）'
          : 'WE Learn：逐个完成任务列表里的练习（按官方答案填写，可设停留）';
      }
      setBtnUI(false);
    }
    boot();
  }

  function refreshVisibility() {
    var C = ctx();
    if (!C || !C.$welearnRow) return;
    var show = isAnyWeLearnPage();
    C.$welearnRow.style.display = show ? 'flex' : 'none';

    // 文案随页面切换：练习页 = 自动答题（单个），任务页 = 自动练习（批量）
    if (C.$btnWelearn) {
      C.$btnWelearn.title = isScoPage()
        ? 'WE Learn：直接完成当前这一个练习（按官方答案填写）'
        : 'WE Learn：逐个完成任务列表里的练习（按官方答案填写，可设停留）';
    }
    if (!running) setBtnUI(false);

    if (!show) hidePicker();
    if (show && !running) {
      getRun().then(function(run) {
        if (run && run.active) {
          running = true;
          setBtnUI(true, Math.round((run.index / Math.max(1, run.queue.length)) * 100));
        }
      });
    }
  }

  window.AIChatWeLearn = {
    bindEvents: bindEvents,
    refreshVisibility: refreshVisibility,
    isWeLearn: isWeLearn,
    isTaskPage: isTaskPage,
    isScoPage: isScoPage,
    isAnyWeLearnPage: isAnyWeLearnPage,
    parseTaskRows: parseTaskRows,
    isAlreadyAnswered: isAlreadyAnswered,
    pickDwellMs: pickDwellMs,
    startFrom: startFrom,
    stop: stop,
    isRunning: function() { return running; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(boot, 600); });
  } else {
    setTimeout(boot, 600);
  }
})();
