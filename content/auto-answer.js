// ============================================================
// content/auto-answer.js — 超星学习通自动答题模块
// 通过 window.__CTX__ 获取共享状态和 DOM 引用
// ============================================================
'use strict';
(function() {
  var MD = window.AIChatMD;
  var I = window.AIChatICONS;
  if (!MD || !I) return;

  // ======================== 页面交互 (无需 context) ========================

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function clickSaveButton() {
    try {
      if (typeof window.saveWork === 'function') {
        window.saveWork();
        return true;
      }
      var saveLink = document.querySelector('a[tabindex="0"]');
      if (saveLink && saveLink.textContent.includes('暂时保存')) {
        saveLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      return false;
    } catch(e) { return false; }
  }

  function extractQuestions() {
    var questions = [];
    var qDivs = document.querySelectorAll('.questionLi[typename="单选题"]');
    qDivs.forEach(function(qDiv, idx) {
      var qid = qDiv.getAttribute('data');
      var answerInput = document.getElementById('answer' + qid);
      var answered = answerInput ? !!answerInput.value.trim() : false;

      var h3 = qDiv.querySelector('.mark_name');
      var questionText = '';
      if (h3) {
        questionText = h3.textContent
          .replace(/^\d+\.\s*/, '')
          .replace(/\(单选题\)/g, '')
          .trim();
      }

      var options = [];
      qDiv.querySelectorAll('.answerBg[role="radio"]').forEach(function(opt) {
        var letterEl = opt.querySelector('.num_option');
        var textEl = opt.querySelector('.answer_p');
        if (letterEl && textEl) {
          var letter = letterEl.getAttribute('data');
          var text = textEl.textContent.trim();
          if (letter && text) {
            options.push({ letter: letter, text: text });
          }
        }
      });

      if (questionText && options.length > 0) {
        questions.push({
          qnum: idx + 1,
          qid: qid,
          question: questionText,
          options: options,
          answered: answered
        });
      }
    });
    return questions;
  }

  function fillAnswer(qid, letter) {
    var choiceSpan = document.querySelector('.choice' + qid + '[data="' + letter + '"]');
    if (choiceSpan) {
      var answerBg = choiceSpan.closest('.answerBg');
      if (answerBg) { answerBg.click(); answerBg.focus(); return true; }
    }
    var answerBg2 = document.querySelector('.answerBg[qid="' + qid + '"] .num_option[data="' + letter + '"]');
    if (answerBg2) {
      var parent = answerBg2.closest('.answerBg');
      if (parent) { parent.click(); parent.focus(); return true; }
    }
    return false;
  }

  function scrollToQuestion(qid) {
    var qEl = document.getElementById('question' + qid);
    if (qEl) qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ======================== 需要 context 的函数 ========================

  function ensureAutoResults(forceNew) {
    var C = window.__CTX__;
    if (C.$autoResults && !forceNew) return C.$autoResults;
    if (C.$autoResults) { C.$autoResults.remove(); C.$autoResults = null; }

    var wel = C.shadow.getElementById('welcome');
    if (wel) wel.remove();

    C.$autoResults = document.createElement('div');
    C.$autoResults.className = 'auto-results';
    C.$autoResults.id = 'auto-results';
    C.$autoResults.innerHTML =
      '<div class="auto-results-head" id="auto-results-head">' +
        '<span class="arr" id="auto-arr">▶</span>' +
        '<span id="auto-results-title">答题结果</span>' +
        '<span style="flex:1"></span>' +
        '<span id="auto-results-summary" style="font-size:12px;color:var(--md-outline)"></span>' +
      '</div>' +
      '<div class="auto-results-body hidden" id="auto-results-body"></div>';
    C.$messages.appendChild(C.$autoResults);

    C.shadow.getElementById('auto-results-head').addEventListener('click', function() {
      var body = C.shadow.getElementById('auto-results-body');
      var arr = C.shadow.getElementById('auto-arr');
      var hidden = body.classList.toggle('hidden');
      arr.classList.toggle('fold', hidden);
    });

    return C.$autoResults;
  }

  function restoreAutoResultsPanel(data) {
    var C = window.__CTX__;
    if (!data || !data.results || data.results.length === 0) return;
    C.autoAnswerData = data;
    ensureAutoResults(true);
    var title = C.shadow.getElementById('auto-results-title');
    if (title) title.textContent = '答题结果 (共' + data.total + '题)';
    var summary = C.shadow.getElementById('auto-results-summary');
    var doneCount = data.results.filter(function(r) { return r.status === 'done'; }).length;
    if (summary) summary.textContent = doneCount + '/' + data.total + ' 题';

    data.results.forEach(function(r) { updateAutoItem(r.qnum, r.status, r); });

    var body = C.shadow.getElementById('auto-results-body');
    var arr = C.shadow.getElementById('auto-arr');
    if (body && body.classList.contains('hidden')) {
      body.classList.remove('hidden');
      if (arr) arr.classList.remove('fold');
    }
  }

  function updateAutoItem(qnum, status, data) {
    var C = window.__CTX__;
    var body = C.shadow.getElementById('auto-results-body');
    if (!body) return;

    var item = body.querySelector('[data-qnum="' + qnum + '"]');
    if (!item) {
      item = document.createElement('div');
      item.className = 'auto-item';
      item.setAttribute('data-qnum', qnum);
      item.innerHTML = '<div class="auto-item-num">第' + qnum + '题</div><div class="auto-item-body"></div>';
      body.appendChild(item);
    }

    var itemBody = item.querySelector('.auto-item-body');
    if (status === 'loading') {
      itemBody.innerHTML = '<div class="auto-item-loading">正在作答<div class="dots-sm"><span></span><span></span><span></span></div></div>';
    } else if (status === 'done') {
      itemBody.innerHTML =
        '<div class="auto-item-answer">' +
          '<span class="auto-item-letter">' + MD.escapeHtml(data.letter) + '</span>' +
          '<span class="auto-item-done">已填写 ✓</span>' +
        '</div>' +
        (data.reason ? '<div class="auto-item-reason">' + MD.escapeHtml(data.reason) + '</div>' : '');
    } else if (status === 'error') {
      itemBody.innerHTML = '<div class="auto-item-error">' + MD.escapeHtml(data.error || '请求失败') + '</div>';
    } else if (status === 'skipped') {
      itemBody.innerHTML = '<div class="auto-item-reason">已作答，跳过</div>';
    }
  }

  function updateButtonProgress(current, total) {
    var C = window.__CTX__;
    if (C.$autoBtnFill) {
      var pct = total > 0 ? Math.round((current / total) * 100) : 0;
      C.$autoBtnFill.style.width = pct + '%';
    }
  }

  function updateAutoStatus(current, total) {
    var C = window.__CTX__;

    if (C.isAutoAnswerPaused) {
      C.$autoBtnText.innerHTML = '▶ 继续答题';
      C.$autoStatus.innerHTML = '<span style="color:var(--md-outline)">已暂停 (' + current + '/' + total + ') — 点击继续</span>';
      return;
    }

    if (C.autoAnswerAbort) {
      C.$autoBtnText.innerHTML = I.AUTO + '自动答题';
      C.$autoStatus.innerHTML = '<span class="done">已结束 (' + current + '/' + total + ') ✓</span>';
      C.$autoBtn.disabled = false;
      C.isAutoAnswering = false;
      updateButtonProgress(current, total);
      return;
    }

    if (current >= total) {
      C.$autoBtnText.innerHTML = I.AUTO + '自动答题';
      C.$autoStatus.innerHTML = '<span class="done">全部完成 ✓ (' + total + '/' + total + ')</span>';
      C.$autoBtn.disabled = false;
      C.isAutoAnswering = false;
      updateButtonProgress(current, total);

      var summary = C.shadow.getElementById('auto-results-summary');
      if (summary) {
        var body = C.shadow.getElementById('auto-results-body');
        var doneCount = body ? body.querySelectorAll('.auto-item-letter').length : 0;
        summary.textContent = doneCount + '/' + total + ' 题';
      }
      var body = C.shadow.getElementById('auto-results-body');
      var arr = C.shadow.getElementById('auto-arr');
      if (body && body.classList.contains('hidden')) {
        body.classList.remove('hidden');
        if (arr) arr.classList.remove('fold');
      }
      clickSaveButton();
    } else {
      C.$autoBtnText.innerHTML = current + '/' + total;
      C.$autoStatus.textContent = '正在作答: ' + current + '/' + total;
      updateButtonProgress(current, total);
    }
  }

  function clearAllLoadingItems(statusText) {
    var C = window.__CTX__;
    var body = C.shadow.getElementById('auto-results-body');
    if (!body) return;
    body.querySelectorAll('.auto-item-loading').forEach(function(el) {
      var item = el.closest('.auto-item');
      if (item) {
        var itemBody = item.querySelector('.auto-item-body');
        if (itemBody) itemBody.innerHTML = '<div class="auto-item-reason">' + statusText + '</div>';
      }
    });
  }

  function stopAutoAnswer() {
    var C = window.__CTX__;
    if (!C.isAutoAnswering) return;
    C.autoAnswerAbort = true;
    C.isAutoAnswerPaused = false;
    clearAllLoadingItems('已取消');
    clickSaveButton();
  }

  async function startAutoAnswer() {
    var C = window.__CTX__;

    // === 暂停中 → 恢复 ===
    if (C.isAutoAnswerPaused) {
      C.isAutoAnswerPaused = false;
      var doneCount = C.autoAnswerQueue.filter(function(q) {
        var inp = document.getElementById('answer' + q.qid);
        return inp && inp.value.trim();
      }).length;
      updateAutoStatus(doneCount, C.autoAnswerQueue.length);
      return;
    }

    // === 进行中 → 暂停 ===
    if (C.isAutoAnswering && !C.isAutoAnswerPaused) {
      C.isAutoAnswerPaused = true;
      clearAllLoadingItems('等待继续');
      var doneCount2 = 0;
      if (C.autoAnswerQueue.length > 0) {
        doneCount2 = C.autoAnswerQueue.filter(function(q) {
          var inp = document.getElementById('answer' + q.qid);
          return inp && inp.value.trim();
        }).length;
      }
      C.$autoBtnText.innerHTML = '▶ 继续答题';
      C.$autoStatus.innerHTML = '<span style="color:var(--md-outline)">已暂停 (' + doneCount2 + '/' + C.autoAnswerQueue.length + ') — 点击继续</span>';
      updateButtonProgress(doneCount2, C.autoAnswerQueue.length);
      clickSaveButton();
      return;
    }

    // === 新开始 ===
    if (!C.isHomework) return;

    var allQuestions = extractQuestions();
    var unanswered = allQuestions.filter(function(q) { return !q.answered; });

    if (unanswered.length === 0) {
      C.$autoStatus.textContent = allQuestions.length > 0 ? '所有题目已作答完成' : '未检测到题目';
      return;
    }

    var settings;
    try {
      settings = await new Promise(function(resolve) {
        chrome.storage.sync.get(['apiKey'], resolve);
      });
    } catch(e) { settings = {}; }
    if (!settings.apiKey) {
      C.$autoStatus.textContent = '请先在设置中配置 API Key';
      return;
    }

    C.isAutoAnswering = true;
    C.isAutoAnswerPaused = false;
    C.autoAnswerAbort = false;
    C.$autoBtn.disabled = false;
    C.autoAnswerQueue = unanswered;

    // 初始化答题数据
    C.autoAnswerData = { total: allQuestions.length, results: [] };
    allQuestions.forEach(function(q) {
      if (q.answered) {
        C.autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '已作答，跳过', status: 'skipped' });
      }
    });

    ensureAutoResults();
    var totalAll = allQuestions.length;
    var title = C.shadow.getElementById('auto-results-title');
    if (title) title.textContent = '答题结果 (共' + totalAll + '题)';

    allQuestions.forEach(function(q) {
      if (q.answered) updateAutoItem(q.qnum, 'skipped');
    });

    var completedCount = allQuestions.filter(function(q) { return q.answered; }).length;

    for (var i = 0; i < unanswered.length; i++) {
      if (C.autoAnswerAbort) {
        if (C.saveConversation) C.saveConversation();
        updateAutoStatus(completedCount, totalAll);
        return;
      }

      while (C.isAutoAnswerPaused && !C.autoAnswerAbort) {
        await sleep(300);
      }
      if (C.autoAnswerAbort) {
        if (C.saveConversation) C.saveConversation();
        updateAutoStatus(completedCount, totalAll);
        return;
      }

      var q = unanswered[i];
      updateAutoItem(q.qnum, 'loading');
      updateAutoStatus(completedCount, totalAll);
      scrollToQuestion(q.qid);

      var optionsText = q.options.map(function(o) { return o.letter + '. ' + o.text; }).join('\n');
      var questionMsg = '[第' + q.qnum + '题] ' + q.question + '\n\n' + optionsText;
      C.chatHistory.push({ role: 'user', content: questionMsg, _auto: true });

      try {
        var result = await chrome.runtime.sendMessage({
          type: 'answer-question',
          question: q.question,
          options: q.options
        });

        if (C.autoAnswerAbort) {
          if (C.saveConversation) C.saveConversation();
          updateAutoStatus(completedCount, totalAll);
          return;
        }

        while (C.isAutoAnswerPaused && !C.autoAnswerAbort) {
          await sleep(200);
        }
        if (C.autoAnswerAbort) {
          if (C.saveConversation) C.saveConversation();
          updateAutoStatus(completedCount, totalAll);
          return;
        }

        if (result.letter) {
          var filled = fillAnswer(q.qid, result.letter);
          var reason = (filled ? '' : '⚠ 未找到选项 ') + (result.reason || '');
          updateAutoItem(q.qnum, 'done', { letter: result.letter, reason: reason });
          var answerMsg = '答案: ' + result.letter + (result.reason ? '\n\n' + result.reason : '');
          C.chatHistory.push({ role: 'assistant', content: answerMsg, _auto: true });
          C.autoAnswerData.results.push({ qnum: q.qnum, letter: result.letter, reason: reason, status: 'done' });
        } else if (result.error) {
          updateAutoItem(q.qnum, 'error', { error: result.error });
          C.chatHistory.push({ role: 'assistant', content: '❌ [第' + q.qnum + '题] 答题失败: ' + result.error, _auto: true });
          C.autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '', status: 'error' });
        } else {
          updateAutoItem(q.qnum, 'error', { error: 'AI 返回格式异常' });
          C.autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '', status: 'error' });
        }
      } catch (err) {
        updateAutoItem(q.qnum, 'error', { error: err.message });
        C.autoAnswerData.results.push({ qnum: q.qnum, letter: '', reason: '', status: 'error' });
      }

      completedCount++;
      if (completedCount % 3 === 0) clickSaveButton();
    }

    if (C.saveConversation) C.saveConversation();
    updateAutoStatus(totalAll, totalAll);
  }

  // ======================== 事件绑定 ========================

  function bindAutoAnswerEvents() {
    var C = window.__CTX__;

    C.$autoBtn.addEventListener('pointerdown', function(e) {
      C.longPressTriggered = false;
      C.longPressTimer = setTimeout(function() {
        C.longPressTriggered = true;
        stopAutoAnswer();
        C.$autoBtn.classList.add('paused');
        setTimeout(function() { C.$autoBtn.classList.remove('paused'); }, 600);
      }, 800);
    });
    C.$autoBtn.addEventListener('pointerup', function() {
      clearTimeout(C.longPressTimer);
      if (!C.longPressTriggered) {
        startAutoAnswer();
      }
    });
    C.$autoBtn.addEventListener('pointerleave', function() {
      clearTimeout(C.longPressTimer);
    });
  }

  // ======================== 导出 ========================

  window.AIChatAutoAnswer = {
    sleep: sleep,
    clickSaveButton: clickSaveButton,
    extractQuestions: extractQuestions,
    fillAnswer: fillAnswer,
    scrollToQuestion: scrollToQuestion,
    ensureAutoResults: ensureAutoResults,
    restoreAutoResultsPanel: restoreAutoResultsPanel,
    updateAutoItem: updateAutoItem,
    updateButtonProgress: updateButtonProgress,
    updateAutoStatus: updateAutoStatus,
    clearAllLoadingItems: clearAllLoadingItems,
    stopAutoAnswer: stopAutoAnswer,
    startAutoAnswer: startAutoAnswer,
    bindEvents: bindAutoAnswerEvents
  };

})();
