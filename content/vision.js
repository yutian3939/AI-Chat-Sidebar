// ============================================================
// content/vision.js — 视觉模块 (图片附件 + OCR识别 + 页面上下文)
// 通过 window.__CTX__ 获取共享状态
// ============================================================
'use strict';
(function() {
  var MD = window.AIChatMD;

  // ---- OCR 状态 ----
  var _ocrReady = false;       // Tesseract 库已加载
  var _ocrPending = [];        // 等待队列

  function getCtx() { return window.__CTX__; }

  // ======================== Script 注入工具 ========================

  function injectScript(src, id) {
    var existing = document.getElementById(id);
    if (existing) return;
    var s = document.createElement('script');
    s.src = src;
    s.id = id;
    (document.head || document.documentElement).appendChild(s);
  }

  // ======================== 工具函数 ========================

  function readFileAsDataURL(file) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.readAsText(file);
    });
  }

  function readBlobAsDataURL(blob) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  }

  // ======================== 附件管理 ========================

  async function addFiles(fileList) {
    var C = getCtx();
    for (var i = 0; i < fileList.length; i++) {
      var file = fileList[i];
      if (file.size > 20 * 1024 * 1024) continue;
      var isImage = file.type.startsWith('image/');
      var entry = { name: file.name, type: file.type, dataUrl: '', text: '' };
      if (isImage) {
        entry.dataUrl = await readFileAsDataURL(file);
      } else {
        entry.text = await readFileAsText(file);
      }
      C.attachedFiles.push(entry);
    }
    renderAttachments();
    if (C.autoResize) C.autoResize();
  }

  function removeAttachment(idx) {
    var C = getCtx();
    C.attachedFiles.splice(idx, 1);
    renderAttachments();
    if (C.autoResize) C.autoResize();
  }

  function renderAttachments() {
    var C = getCtx();
    if (!C || !C.$attachmentsList) return;
    if (!C.attachedFiles || C.attachedFiles.length === 0) {
      C.$attachmentsList.innerHTML = '';
      return;
    }
    var html = '';
    C.attachedFiles.forEach(function(f, i) {
      var isImg = (f.type || '').startsWith('image/');
      var displayName = (f.name || '').slice(0, 16);
      if (f.name && f.name.length > 16) displayName += '\u2026';
      html += '<div class="attach-chip">' +
        (isImg ? '<img src="' + (f.dataUrl || '').replace(/"/g, '&quot;') + '" class="attach-thumb">' : '<span class="attach-icon">\u{1F4C4}</span>') +
        '<span class="attach-name" title="' + MD.escapeHtml(f.name) + '">' + MD.escapeHtml(displayName) + '</span>' +
        '<button class="attach-remove" data-idx="' + i + '" title="移除">\u2715</button>' +
      '</div>';
    });
    C.$attachmentsList.innerHTML = html;
    C.$attachmentsList.querySelectorAll('.attach-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeAttachment(parseInt(btn.dataset.idx));
      });
    });
  }

  // ======================== OCR 识别 (Tesseract.js) ========================

  function showOCRStatus(msg, type) {
    var C = getCtx();
    if (!C) return;
    // 移除旧的状态条
    if (C._ocrStatusEl) {
      C._ocrStatusEl.remove();
      C._ocrStatusEl = null;
      clearTimeout(C._ocrStatusTimer);
    }
    var el = document.createElement('div');
    el.className = 'ocr-status-line';
    el.style.cssText = 'padding:5px 16px;font-size:12px;color:var(--md-on-surface-variant);text-align:center;';
    if (type === 'error') el.style.color = 'var(--md-error)';
    else if (type === 'done') el.style.color = '#4CAF50';
    el.textContent = msg;
    // 插到附件列表和输入框之间
    var inputArea = C.shadow.getElementById('input-area');
    if (inputArea && inputArea.parentNode) {
      inputArea.parentNode.insertBefore(el, inputArea);
    }
    C._ocrStatusEl = el;
    if (type === 'done' || type === 'error') {
      C._ocrStatusTimer = setTimeout(function() {
        if (el.parentNode) el.remove();
        if (C._ocrStatusEl === el) C._ocrStatusEl = null;
      }, 5000);
    }
  }

  // ======================== postMessage 桥接 ========================
  // Tesseract 运行在页面主世界，通过 window.postMessage 与 content script 通信

  function _initBridge() {
    // 全部从扩展本地加载（绕过页面 CSP）
    injectScript(chrome.runtime.getURL('lib/tesseract.min.js'), '__ts_tesseract_lib');
    injectScript(chrome.runtime.getURL('lib/ocr-bridge.js'), '__ts_ocr_bridge');

    // 等待页面端就绪（通过 postMessage）
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        window.removeEventListener('message', onMsg);
        reject(new Error('OCR引擎加载超时，请刷新页面重试'));
      }, 25000);

      function onMsg(e) {
        if (e.source !== window) return;
        if (!e.data || !e.data.__ts_type) return;
        if (e.data.__ts_type === 'ready') {
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          _ocrReady = true;
          resolve();
        } else if (e.data.__ts_type === 'error') {
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          reject(new Error(e.data.error));
        }
      }
      window.addEventListener('message', onMsg);
    });
  }

  function _ensureReady() {
    return new Promise(function(resolve, reject) {
      if (_ocrReady) { resolve(); return; }

      if (_ocrPending.length > 0) {
        _ocrPending.push({ resolve: resolve, reject: reject });
        return;
      }
      _ocrPending.push({ resolve: resolve, reject: reject });

      showOCRStatus('正在加载 OCR 引擎...');

      _initBridge().then(function() {
        var q = _ocrPending;
        _ocrPending = [];
        q.forEach(function(p) { p.resolve(); });
      }).catch(function(err) {
        var q = _ocrPending;
        _ocrPending = [];
        q.forEach(function(p) { p.reject(err); });
      });
    });
  }

  function _postToBridge(data) {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        window.removeEventListener('message', onResp);
        reject(new Error('OCR操作超时'));
      }, 120000);

      function onResp(e) {
        if (e.source !== window) return;
        if (!e.data || !e.data.__ts_type) return;
        if (e.data.__ts_type === 'result') {
          clearTimeout(timer);
          window.removeEventListener('message', onResp);
          resolve(e.data.text);
        } else if (e.data.__ts_type === 'error') {
          clearTimeout(timer);
          window.removeEventListener('message', onResp);
          var errMsg = e.data.error;
          if (e.data._log && e.data._log.length) {
            errMsg += ' | 日志: ' + e.data._log.join(', ');
          }
          reject(new Error(errMsg));
        }
      }
      window.addEventListener('message', onResp);
      window.postMessage(data, '*');
    });
  }

  // ======================== OCR 主流程 ========================

  async function runOCR(imageDataUrl) {
    var startTime = Date.now();
    try {
      // 1. 确保 Tesseract 库已加载
      await _ensureReady();

      // 2. 预处理图片
      var C = getCtx();
      var langs = (C.ocrLanguages || 'chi_sim+eng').replace(/\s/g, '');
      showOCRStatus('正在识别 (' + langs + ')...');
      var processed = await preprocessImage(imageDataUrl);

      // 3. 执行识别（一次性 API，内部管理 worker 生命周期）
      var text = await _postToBridge({
        __ts_action: 'recognize',
        id: 'req_' + Date.now(),
        image: processed,
        langs: langs,
        workerPath: chrome.runtime.getURL('lib/tesseract-worker.min.js'),
        corePath: chrome.runtime.getURL('lib/tesseract-core')
      });

      var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (text) {
        showOCRStatus('OCR \u2713 ' + text.length + ' 字符 / ' + elapsed + 's', 'done');
      } else {
        showOCRStatus('未识别到文字内容', 'error');
      }
      return text;

    } catch (err) {
      showOCRStatus('OCR 失败: ' + err.message, 'error');
      throw err;
    }
  }

  function preprocessImage(imageDataUrl) {
    // Canvas 图片预处理：缩放 + 可选对比度增强
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var ctx2d = canvas.getContext('2d');

        var w = img.width, h = img.height;
        // 超大图缩放到合理尺寸，加速识别
        var maxDim = 2500;
        if (w > maxDim || h > maxDim) {
          var scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        ctx2d.drawImage(img, 0, 0, w, h);

        var C = getCtx();
        if (C && C.ocrEnhance) {
          var imageData = ctx2d.getImageData(0, 0, w, h);
          var data = imageData.data;
          for (var i = 0; i < data.length; i += 4) {
            // 灰度化
            var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            // 对比度增强
            gray = Math.max(0, Math.min(255, (gray - 128) * 1.5 + 128));
            data[i] = data[i + 1] = data[i + 2] = gray;
          }
          ctx2d.putImageData(imageData, 0, 0);
        }

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = function() { resolve(imageDataUrl); }; // 降级
      img.src = imageDataUrl;
    });
  }

  async function runBatchOCR(imageDataUrls) {
    var results = [];
    for (var i = 0; i < imageDataUrls.length; i++) {
      showOCRStatus('识别中 (' + (i + 1) + '/' + imageDataUrls.length + ')...');
      try {
        var text = await runOCR(imageDataUrls[i]);
        if (text) results.push(text);
      } catch (err) {
        results.push('(识别失败: ' + err.message + ')');
      }
    }
    return results;
  }

  function destroyOCRWorker() {
    _ocrReady = false;
  }

  // ======================== 页面上下文 ========================

  function extractPageText() {
    try {
      var article = document.querySelector('article') || document.querySelector('main')
        || document.querySelector('[role="main"]') || document.body;
      var clone = article.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, iframe, nav, footer, header, .sidebar, .nav, .menu, .advertisement, [role="navigation"]').forEach(function(el) { el.remove(); });
      var text = (clone.innerText || clone.textContent || '');
      return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 30000);
    } catch(e) { return ''; }
  }

  function addCurrentPageContext() {
    var C = getCtx();
    var text = extractPageText();
    if (!text) return;
    var title = document.title || '当前页面';
    var name = title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '.txt';
    C.attachedFiles.push({
      name: name,
      type: 'text/plain',
      dataUrl: '',
      text: '【网页标题】' + title + '\n【网页地址】' + location.href + '\n\n' + text
    });
    C._autoContextAdded = true;
    renderAttachments();
    if (C.autoResize) C.autoResize();
    if (C.$autoStatus && !C.isHomework) {
      C.$autoStatus.textContent = '已感知当前页面';
      setTimeout(function() { if (C.$autoStatus) C.$autoStatus.textContent = ''; }, 3000);
    }
  }

  // ======================== 事件绑定 ========================

  function bindEvents() {
    var C = getCtx();
    if (!C) return;

    // 文件选择按钮
    if (C.$fileInput) {
      C.$fileInput.addEventListener('change', async function() {
        if (C.$fileInput.files && C.$fileInput.files.length > 0) {
          await addFiles(C.$fileInput.files);
        }
        C.$fileInput.value = '';
      });
    }

    // 拖拽文件到侧边栏
    var sidebar = C.sidebar;
    if (sidebar) {
      sidebar.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        sidebar.classList.add('drag-over');
      });
      sidebar.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!sidebar.contains(e.relatedTarget)) {
          sidebar.classList.remove('drag-over');
        }
      });
      sidebar.addEventListener('drop', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        sidebar.classList.remove('drag-over');
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          await addFiles(dt.files);
        }
      });
    }

    // Ctrl+V 粘贴图片
    if (C.$input) {
      C.$input.addEventListener('paste', async function(e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            var blob = item.getAsFile();
            if (blob) {
              var dataUrl = await readBlobAsDataURL(blob);
              C.attachedFiles.push({ name: '粘贴图片_' + Date.now() + '.png', type: blob.type, dataUrl: dataUrl, text: '' });
              renderAttachments();
              if (C.autoResize) C.autoResize();
            }
          }
        }
      });
    }
  }

  // ======================== 设置加载/保存 ========================

  async function loadPrefs() {
    var data = await chrome.storage.local.get(['ocrEnhance', 'ocrLanguages']);
    var C = getCtx();
    if (C) {
      C.ocrEnhance = data.ocrEnhance !== false; // 默认开启
      C.ocrLanguages = data.ocrLanguages || 'chi_sim+eng';
    }
  }

  async function saveOcrSettings() {
    var C = getCtx();
    if (!C) return;
    await chrome.storage.local.set({
      ocrEnhance: C.ocrEnhance,
      ocrLanguages: C.ocrLanguages
    });
  }

  // ======================== 导出 ========================

  window.AIChatVision = {
    bindEvents: bindEvents,
    loadPrefs: loadPrefs,
    addFiles: addFiles,
    renderAttachments: renderAttachments,
    runOCR: runOCR,
    runBatchOCR: runBatchOCR,
    destroyOCRWorker: destroyOCRWorker,
    readFileAsDataURL: readFileAsDataURL,
    readFileAsText: readFileAsText,
    readBlobAsDataURL: readBlobAsDataURL,
    addCurrentPageContext: addCurrentPageContext,
    extractPageText: extractPageText,
    saveOcrSettings: saveOcrSettings,
    showOCRStatus: showOCRStatus
  };

})();
