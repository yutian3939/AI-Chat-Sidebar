// ============================================================
// content/chaoxing.js — 超星学习通课程自动完成（视频/资源/随堂测验）
// 移植自 meto update.user.js 的 chaoxin_api 逻辑
// 通过 window.__CTX__ 获取共享状态和 DOM 引用
// ============================================================
'use strict';
(function() {
  var running = false;
  var abort = false;
  var speed = 1;

  function ctx() { return window.__CTX__; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ======================== 聊天日志面板 ========================
  var _logEl = null;

  function logScroll() {
    var C = ctx();
    if (C && C.$messages) C.$messages.scrollTop = C.$messages.scrollHeight;
  }

  function logReset() {
    var C = ctx();
    if (!C || !C.$messages) return;
    var wel = C.shadow.getElementById('welcome');
    if (wel) wel.remove();
    // 移除上一次运行的日志块
    if (_logEl && _logEl.parentNode) { try { _logEl.parentNode.remove(); } catch (e) {} }
    var wrap = document.createElement('div');
    wrap.className = 'msg ai';
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-all';
    bubble.style.fontFamily = "'Cascadia Code', Consolas, monospace";
    bubble.style.fontSize = '12px';
    bubble.style.lineHeight = '1.5';
    bubble.textContent = '▶ 自动刷课 · 详细动作日志\n';
    wrap.appendChild(bubble);
    C.$messages.appendChild(wrap);
    _logEl = bubble;
    logScroll();
  }

  function logLine(txt) {
    if (!_logEl) return;
    var t = new Date();
    var hh = String(t.getHours()).padStart(2, '0');
    var mm = String(t.getMinutes()).padStart(2, '0');
    var ss = String(t.getSeconds()).padStart(2, '0');
    _logEl.textContent += '[' + hh + ':' + mm + ':' + ss + '] ' + txt + '\n';
    logScroll();
  }

  // ======================== 字体加密解密 ========================
  var _fontTable = null;
  var _fontTablePromise = null;

  function base64ToUint8Array(b64) {
    var data = atob(b64);
    var buf = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i);
    return buf;
  }

  function loadFontTable() {
    if (_fontTable) return Promise.resolve(_fontTable);
    if (_fontTablePromise) return _fontTablePromise;
    _fontTablePromise = fetch(chrome.runtime.getURL('lib/chaoxing-font-table.json'))
      .then(function(r) { return r.json(); })
      .then(function(d) { _fontTable = d; return d; })
      .catch(function(e) { console.log('[CX] 字体表加载失败', e); return null; });
    return _fontTablePromise;
  }

  async function decodeFontSecrets() {
    if (typeof Typr === 'undefined' || typeof md5 === 'undefined') return false;
    var docs = allDocs(document);

    // 1) 找到含 font-cxsecret 的 @font-face base64 字体
    var font = null;
    for (var i = 0; i < docs.length && !font; i++) {
      var styles = docs[i].querySelectorAll ? docs[i].querySelectorAll('style') : [];
      for (var s = 0; s < styles.length; s++) {
        var css = styles[s].textContent || '';
        if (css.indexOf('font-cxsecret') < 0) continue;
        var m = css.match(/base64,([\w\W]+?)['"]/);
        if (!m) continue;
        try { font = Typr.parse(base64ToUint8Array(m[1].replace(/\s/g, '')))[0]; } catch (e) { font = null; }
        if (font) break;
      }
    }
    if (!font) return false;

    // 2) 收集所有 .font-cxsecret 元素
    var els = [];
    docs.forEach(function(d) {
      if (d.querySelectorAll) d.querySelectorAll('.font-cxsecret').forEach(function(el) { els.push(el); });
    });
    if (!els.length) return false;

    var table = await loadFontTable();
    if (!table) return false;

    // 3) 仅对页面实际出现的中文字符计算真实映射
    var cps = {};
    els.forEach(function(el) {
      var t = el.textContent || '';
      for (var k = 0; k < t.length; k++) {
        var cp = t.charCodeAt(k);
        if (cp >= 19968 && cp < 40870) cps[cp] = true;
      }
    });
    var map = {};
    Object.keys(cps).forEach(function(k) {
      var code = parseInt(k, 10);
      var g, path, hash;
      try { g = Typr.U.codeToGlyph(font, code); } catch (e) { return; }
      if (!g) return;
      try { path = Typr.U.glyphToPath(font, g); } catch (e) { return; }
      try { hash = md5(JSON.stringify(path)).slice(24); } catch (e) { return; }
      var real = table[hash];
      if (real) map[code] = real;
    });

    // 4) 替换（保留 HTML 结构，只替换映射到的字符）
    var changed = 0;
    els.forEach(function(el) {
      var html = el.innerHTML;
      if (!html) return;
      var out = '';
      var did = false;
      for (var k = 0; k < html.length; k++) {
        var cp = html.charCodeAt(k);
        if (map[cp]) { out += String.fromCharCode(map[cp]); did = true; }
        else out += html.charAt(k);
      }
      if (did) {
        el.innerHTML = out;
        el.classList.remove('font-cxsecret');
        changed++;
      }
    });
    if (changed > 0) logLine('🔓 已解密字体加密文本（' + changed + ' 处 / 映射 ' + Object.keys(map).length + ' 字符）');
    return changed > 0;
  }

  // ======================== 页面检测 ========================

  function isChaoxing() {
    return /chaoxing\.com/i.test(location.hostname);
  }

  function isCoursePage() {
    if (!isChaoxing()) return false;
    // 作业/测验页交给「自动答题」处理，不显示刷课按钮
    if (document.querySelector('.questionLi[typename], .singleQuesId')) return false;
    var p = location.pathname + location.search;
    return /studentstudy|mycourse|\/course\/|knowledge/.test(p)
      || !!document.querySelector('iframe');
  }

  // ======================== 递归遍历同源 iframe ========================

  function allDocs(root) {
    var out = [root];
    var frames;
    try { frames = root.querySelectorAll('iframe'); } catch (e) { frames = []; }
    for (var i = 0; i < frames.length; i++) {
      var d = null;
      try { d = frames[i].contentDocument; } catch (e) { d = null; }
      if (d && d.documentElement) {
        out = out.concat(allDocs(d));
      }
    }
    return out;
  }

  // ======================== 任务点完成判定 ========================

  // 学习通规则：视频所在 iframe 的 .ans-attach-ct 祖先带 .ans-job-finished 即「任务点已完成」
  function isVideoFinished(videoEl) {
    var win = videoEl.ownerDocument ? videoEl.ownerDocument.defaultView : null;
    var depth = 0;
    while (win && win !== window && depth < 10) {
      depth++;
      var fe = null;
      try { fe = win.frameElement; } catch (e) { fe = null; }
      if (!fe) break;
      // 在该 iframe 的父文档中向上找最近的 .ans-attach-ct
      var el = fe;
      while (el && el.nodeType === 1) {
        if (el.classList && el.classList.contains('ans-attach-ct')) {
          if (el.classList.contains('ans-job-finished')) return true;
          // 兼容：任务图标 aria-label 显示已完成
          var icon = el.querySelector('.ans-job-icon');
          if (icon && (icon.getAttribute('aria-label') || '').indexOf('已完成') >= 0) return true;
          return false;
        }
        el = el.parentElement;
      }
      // 本层没找到容器，继续往上一层 frame 找
      try { win = fe.ownerDocument.defaultView; } catch (e) { break; }
    }
    return false;
  }

  // ======================== 收集媒体 / 文档 ========================

  function collectMedia() {
    var docs = allDocs(document);
    var media = [];
    docs.forEach(function(d) {
      var els = d.querySelectorAll('video, audio');
      els.forEach(function(m) {
        var src = m.getAttribute('src') || '';
        if (!src) {
          var s = m.querySelector('source');
          if (s) src = s.getAttribute('src') || '';
        }
        if (!src) src = m.currentSrc || '';
        if (src && src.trim() !== '') media.push(m);
      });
      // 文档类资源（PPT/PDF）：滚到底部视为完成
      d.querySelectorAll('iframe').forEach(function(f) {
        var cd = null;
        try { cd = f.contentDocument; } catch (e) { cd = null; }
        if (cd && cd.documentElement) {
          try { cd.documentElement.scrollTop = cd.documentElement.scrollHeight; } catch (e) {}
          try { if (cd.body) cd.body.scrollTop = cd.body.scrollHeight; } catch (e) {}
        }
      });
    });
    return media;
  }

  function hasAttachContainer() {
    var docs = allDocs(document);
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].querySelector('.ans-attach-ct')) return true;
    }
    return false;
  }

  function hasAnyVideo() {
    var docs = allDocs(document);
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].querySelector('video')) return true;
    }
    return false;
  }

  // ======================== 播放全部媒体 ========================

  async function playMedia(media) {
    var played = 0;
    for (var i = 0; i < media.length && !abort; i++) {
      var v = media[i];
      var tag = v.tagName.toLowerCase();
      // 任务点已完成 → 跳过，不再播放
      if (isVideoFinished(v)) {
        status('任务点已完成，跳过 ' + (i + 1) + '/' + media.length);
        logLine('⏭ 资源' + (i + 1) + ' [' + tag + '] 任务点已完成，跳过');
        continue;
      }
      played++;
      try {
        v.muted = true;
        if (speed > 1) v.playbackRate = speed;
      } catch (e) {}
      var dur = isFinite(v.duration) ? Math.round(v.duration) : '?';
      logLine('▶ 播放资源' + (i + 1) + '/' + media.length + ' [' + tag + '] 时长 ' + dur + 's  起始位置 ' + Math.round(v.currentTime || 0) + 's');
      status('播放中 ' + (i + 1) + '/' + media.length);
      var guard = 0;
      while (!abort) {
        if (v.ended) break;
        try { v.play(); } catch (e) {}
        await sleep(1000);
        guard++;
        if (guard > 10800) break; // 3 小时安全上限
      }
      logLine('■ 资源' + (i + 1) + ' 播放结束 (ended=' + v.ended + ', 进度=' + Math.round(v.currentTime || 0) + 's/' + dur + 's)');
    }
    if (media.length > 0 && played === 0) {
      status('本节任务点均已完成，跳过');
      logLine('✅ 本节资源均已完成，无需播放');
    }
    return played;
  }

  // ======================== 切换到下一节 ========================

  function goNext() {
    // 依次尝试：下一节按钮（#prevNextFocusNext 为主）
    var selectors = ['#prevNextFocusNext', '.orientationright', '#prevNextFocus .next', '.jb_btn.nextChapter'];
    for (var s = 0; s < selectors.length; s++) {
      var el = document.querySelector(selectors[s]);
      if (el) { try { el.click(); return true; } catch (e) {} }
    }
    // 进入 iframe 查找
    var docs = allDocs(document);
    for (var d = 0; d < docs.length; d++) {
      for (var s2 = 0; s2 < selectors.length; s2++) {
        var el2 = docs[d].querySelector(selectors[s2]);
        if (el2) { try { el2.click(); return true; } catch (e) {} }
      }
    }
    return false;
  }

  // 处理「当前章节还有任务点未完成，是否去完成？」确认框：点可见的「下一节」
  function confirmNext() {
    var els = document.querySelectorAll('.nextChapter');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.offsetParent !== null) { // 可见
        try { el.click(); return true; } catch (e) {}
      }
    }
    return false;
  }

  // ======================== 随堂测验（.TiMu）自动作答 ========================

  // 从题目容器提取选项（返回 {text, el(点击目标), letter, data}）
  function extractTiMuOptions(block) {
    function toLetter(dataVal, letterEl) {
      if (dataVal) {
        if (dataVal === 'true' || dataVal === '1' || dataVal === '对') return 'A';
        if (dataVal === 'false' || dataVal === '0' || dataVal === '错') return 'B';
        return dataVal.toUpperCase();
      }
      if (letterEl) {
        var l = (letterEl.textContent || '').trim().replace(/[.、．].*$/, '').trim();
        if (/^[A-Za-z]$/.test(l)) return l.toUpperCase();
      }
      return '';
    }

    var opts = [];
    // 结构 B：ul.Zy_ulTop > li（作业/测验，点击 <li> 触发 addChoice）
    var liEls = block.querySelectorAll('ul.Zy_ulTop > li, .Zy_ulTop li');
    if (liEls.length) {
      liEls.forEach(function(li) {
        var letterEl = li.querySelector('.num_option_dx, .num_option');
        var textEl = li.querySelector('.after') || li.querySelector('.answer_p') || li.querySelector('p');
        var text = ((textEl ? textEl.textContent : li.textContent) || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        var dataVal = letterEl ? (letterEl.getAttribute('data') || '') : '';
        opts.push({ text: text, el: li, letter: toLetter(dataVal, letterEl), data: dataVal });
      });
    }
    // 结构 A：.answerBg（回顾/其他测验）
    if (!opts.length) {
      block.querySelectorAll('.answerBg').forEach(function(bg) {
        var letterEl = bg.querySelector('.num_option_dx, .num_option');
        var textEl = bg.querySelector('.answer_p');
        var text = ((textEl ? textEl.textContent : bg.textContent) || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        var dataVal = letterEl ? (letterEl.getAttribute('data') || '') : '';
        opts.push({ text: text, el: bg, letter: toLetter(dataVal, letterEl), data: dataVal });
      });
    }
    // 补全字母
    opts.forEach(function(o, i) { if (!o.letter) o.letter = String.fromCharCode(65 + i); });
    return opts;
  }

  // 点击「暂时保存」按钮（跨同源 iframe）
  function saveWorkBtn() {
    var docs = allDocs(document);
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      var span = d.getElementById ? d.getElementById('tempsave') : null;
      var btn = span ? (span.closest ? (span.closest('a') || span) : span) : null;
      if (!btn) btn = d.querySelector ? d.querySelector('a.btnSave') : null;
      if (!btn) {
        var links = d.querySelectorAll ? d.querySelectorAll('a, button') : [];
        for (var j = 0; j < links.length; j++) {
          var t = (links[j].textContent || '').replace(/\s+/g, '');
          if (t.indexOf('暂时保存') >= 0 || t.indexOf('正在暂存') >= 0) { btn = links[j]; break; }
        }
      }
      if (btn) { try { btn.click(); return true; } catch (e) {} }
    }
    return false;
  }

  // 是否已出现测验/作业容器（用于判断是否需要等待题目加载）
  function hasQuizContainer() {
    var docs = allDocs(document);
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d.querySelector) continue;
      if (d.querySelector('.ans-work-module, iframe[module="work"], .singleQuesId, .questionLi[typename], .Zy_TItle')) return true;
    }
    return false;
  }

  // 纯 .TiMu（不属于 .singleQuesId 的随堂测验，交给 auto-answer 之外的逻辑处理）
  function collectBareTiMu() {
    var out = [];
    allDocs(document).forEach(function(d) {
      if (!d.querySelectorAll) return;
      d.querySelectorAll('.TiMu').forEach(function(el) {
        if (el.closest && el.closest('.singleQuesId')) return;
        out.push(el);
      });
    });
    return out;
  }

  async function askAI(subject, opts, qtype) {
    try {
      return await chrome.runtime.sendMessage({
        type: 'answer-question',
        question: subject,
        options: opts.map(function(o) { return { letter: o.letter, text: o.text }; }),
        qtype: qtype
      }) || { error: '无返回' };
    } catch (e) { return { error: e.message }; }
  }

  async function answerEmbedded() {
    // 1) 解密字体加密文本
    try { await decodeFontSecrets(); } catch (e) {}

    var AA = window.AIChatAutoAnswer;

    // 2) 等待题目加载（章节测验/作业 iframe 异步加载，可能需数秒）
    function hasAnyQ() {
      if (AA && AA.extractQuestions) { try { if (AA.extractQuestions().length) return true; } catch (e) {} }
      return collectBareTiMu().length > 0;
    }
    if (!hasAnyQ()) {
      if (!hasQuizContainer()) return; // 本节没有测验/作业
      logLine('检测到测验容器，等待题目加载...');
      var loaded = false;
      for (var w = 0; w < 30 && !abort; w++) {
        await sleep(1000);
        if (hasAnyQ()) { loaded = true; break; }
      }
      if (!loaded) { logLine('本节测验未加载出题目，跳过'); return; }
    }
    if (abort) return;

    var okCount = 0, failCount = 0;

    // 3) 结构化题目（.questionLi / .singleQuesId）→ 复用 auto-answer 统一提取/填空
    if (AA && AA.extractQuestions) {
      var qs = AA.extractQuestions() || [];
      var todo = qs.filter(function(q) { return !q.answered; });
      if (qs.length && !todo.length) logLine('本节结构化题目均已作答，跳过');
      if (todo.length) {
        logLine('—— 本节含 ' + qs.length + ' 道题目（待作答 ' + todo.length + '） ——');
        for (var i = 0; i < todo.length && !abort; i++) {
          var q = todo[i];
          try {
            logLine('[' + (i + 1) + '/' + todo.length + '] 题型=' + q.type + ' 第' + q.qnum + '题');
            logLine('  题干: ' + String(q.question).slice(0, 100));
            logLine('  选项: ' + q.options.map(function(o) { return o.letter + '.' + String(o.text).slice(0, 16); }).join('  '));
            var res = await askAI(q.question, q.options, q.type);
            if (!res || res.error) { failCount++; logLine('  ✗ AI错误: ' + ((res && res.error) || '无返回')); continue; }
            if (res.raw) logLine('  AI原始: ' + String(res.raw).replace(/\s+/g, ' ').slice(0, 140));
            var letters = (res.letters && res.letters.length) ? res.letters : (res.letter ? String(res.letter).split('') : []);
            if (!letters.length) { failCount++; logLine('  ✗ 未解析出字母'); continue; }
            var dataVals = letters.map(function(L) {
              for (var k = 0; k < q.options.length; k++) { if (q.options[k].letter === L) return q.options[k].data; }
              return L;
            });
            var filled = AA.fillAnswer(q.qid, dataVals);
            if (filled) okCount++; else failCount++;
            logLine('  → 答案 ' + letters.join('') + '  ' + (filled ? '已点击 ✓' : '⚠ 点击失败'));
          } catch (e) { failCount++; logLine('[' + (i + 1) + '] ✗ 异常: ' + (e && e.message)); }
          await sleep(300);
        }
      }
    }

    // 4) 纯 .TiMu 随堂测验
    var blocks = collectBareTiMu();
    if (blocks.length) {
      logLine('—— 随堂测验 ' + blocks.length + ' 道 ——');
      for (var j = 0; j < blocks.length && !abort; j++) {
        var block = blocks[j];
        try {
          var titleEl = block.querySelector('.Zy_TItle') || block;
          var rawTitle = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
          var typeMatch = rawTitle.match(/[【\[]([^】\]]+)[】\]]/);
          var type = typeMatch ? typeMatch[1] : '';
          var subject = rawTitle.replace(/^[^】\]]*[】\]]/, '').replace(/^\s*\d+[.、]\s*/, '').trim();
          if (!subject) { logLine('[' + (j + 1) + '] ⚠ 题干为空，跳过'); continue; }
          var opts = extractTiMuOptions(block);
          if (!opts.length) { logLine('[' + (j + 1) + '] ⚠ 未识别到选项，跳过 | 题干: ' + subject.slice(0, 40)); continue; }
          var qtype = type.indexOf('多选') >= 0 ? 'multi' : (type.indexOf('判断') >= 0 ? 'judge' : 'single');
          status('随堂测验作答 ' + (j + 1) + '/' + blocks.length);
          logLine('[' + (j + 1) + '/' + blocks.length + '] 随堂 ' + (type || qtype) + ' (' + qtype + ')');
          logLine('  题干: ' + subject.slice(0, 100));
          logLine('  选项: ' + opts.map(function(o) { return o.letter + '.' + o.text.slice(0, 16); }).join('  '));
          var res2 = await askAI(subject, opts, qtype);
          if (!res2 || res2.error) { failCount++; logLine('  ✗ AI错误: ' + ((res2 && res2.error) || '无返回')); continue; }
          if (res2.raw) logLine('  AI原始: ' + String(res2.raw).replace(/\s+/g, ' ').slice(0, 140));
          var letters2 = (res2.letters && res2.letters.length) ? res2.letters : (res2.letter ? String(res2.letter).split('') : []);
          if (!letters2.length) { failCount++; logLine('  ✗ 未解析出字母'); continue; }
          var clicked = [];
          letters2.forEach(function(L) {
            var found = false;
            for (var k = 0; k < opts.length; k++) {
              if (opts[k].letter === L) { try { opts[k].el.click(); found = true; } catch (e) {} break; }
            }
            clicked.push(L + (found ? '✓' : '✗点击失败'));
          });
          if (clicked.some(function(c) { return c.indexOf('✓') >= 0; })) okCount++; else failCount++;
          logLine('  → 答案 ' + letters2.join('') + '  点击: ' + clicked.join(' '));
        } catch (e) { failCount++; logLine('[' + (j + 1) + '] ✗ 异常: ' + (e && e.message)); }
        await sleep(300);
      }
    }

    logLine('—— 本节作答结束: 成功 ' + okCount + ' / 失败 ' + failCount + ' ——');

    // 5) 保存
    await sleep(300);
    var saved = false;
    try { saved = (AA && AA.clickSaveButton) ? AA.clickSaveButton() : saveWorkBtn(); } catch (e) { saved = saveWorkBtn(); }
    if (saved) logLine('💾 已点击「暂时保存」');
  }

  // ======================== UI ========================

  function status(text) {
    var C = ctx();
    if (C && C.$courseStatus) C.$courseStatus.textContent = text || '';
  }

  function setRunningUI(on) {
    var C = ctx();
    if (!C) return;
    if (C.$courseBtnText) {
      C.$courseBtnText.innerHTML = on ? '⏹ 停止刷课' : (window.AIChatICONS ? window.AIChatICONS.AUTO + '自动刷课' : '▶ 自动刷课');
    }
    if (C.$courseBtnFill) C.$courseBtnFill.style.width = on ? '100%' : '0%';
    if (C.$btnCourse) C.$btnCourse.classList.toggle('paused', false);
  }

  // ======================== 停止 ========================

  function stop() {
    abort = true;
    running = false;
    status('已停止');
    logLine('⏹ 已手动停止');
    setRunningUI(false);
  }

  // ======================== 主循环 ========================

  async function start() {
    if (running) { stop(); return; }
    running = true;
    abort = false;
    setRunningUI(true);
    logReset();
    status('开始自动刷课...');

    var chapter = 0;
    while (!abort) {
      chapter++;
      status('检测资源... 第 ' + chapter + ' 节');
      logLine('═════ 第 ' + chapter + ' 节 ═════');
      var media = [];
      for (var t = 0; t < 15 && !abort; t++) {
        await sleep(1000);
        media = collectMedia();
        if (media.length) break;
        // 无视频且已出现资源容器 / 测验容器（纯文档/作业/测验）→ 提前进入答题流程
        if (t >= 3 && !hasAnyVideo() && (hasAttachContainer() || hasQuizContainer())) break;
      }
      if (abort) break;

      if (media.length) {
        logLine('检测到 ' + media.length + ' 个媒体资源');
        await playMedia(media);
      } else {
        logLine('未检测到视频资源（可能是文档/作业/已完成）');
      }
      if (abort) break;

      // 随堂测验
      try { await answerEmbedded(); } catch (e) { logLine('作答异常: ' + (e && e.message)); }
      if (abort) break;

      // 下一节
      var nexted = false;
      for (var n = 0; n < 5 && !abort; n++) {
        if (goNext()) {
          nexted = true;
          logLine('➡ 点击「下一节」');
          await sleep(800);
          // 若弹出「任务点未完成」确认框，点「下一节」继续
          for (var c = 0; c < 3 && !abort; c++) {
            if (!confirmNext()) break;
            logLine('⚠ 出现「任务点未完成」确认框，点「下一节」继续');
            await sleep(600);
          }
          break;
        }
        await sleep(1000);
      }
      if (abort) break;
      if (!nexted) {
        status('未找到下一节，自动刷课结束');
        logLine('未找到下一节按钮，刷课结束');
        break;
      }
      status('切换到下一节...');
      await sleep(3000);
    }

    running = false;
    setRunningUI(false);
    if (!abort) { status('全部完成 ✓'); logLine('✅ 自动刷课全部完成'); }
  }

  // ======================== 事件绑定 ========================

  function bindEvents() {
    var C = ctx();
    if (!C) return;
    if (C.$btnCourse) {
      C.$btnCourse.addEventListener('click', function() {
        if (running) { stop(); } else { start(); }
      });
    }
  }

  // 显示/隐藏按钮（由 index.js 在打开侧边栏时调用）
  function refreshVisibility() {
    var C = ctx();
    if (!C || !C.$courseRow) return;
    C.$courseRow.style.display = isCoursePage() ? 'flex' : 'none';
  }

  // ======================== 导出 ========================

  window.AIChatFontDecode = decodeFontSecrets; // 供自动答题等模块复用

  window.AIChatChaoxing = {
    bindEvents: bindEvents,
    refreshVisibility: refreshVisibility,
    isCoursePage: isCoursePage,
    isChaoxing: isChaoxing,
    decodeFontSecrets: decodeFontSecrets,
    start: start,
    stop: stop,
    isRunning: function() { return running; }
  };

})();
