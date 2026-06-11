/**
 * OCR Bridge — 运行在页面主世界中
 * 使用 Tesseract.recognize() 一次性 API，避免 worker 生命周期问题
 */
(function() {
  if (window.__ts_ocr_bridge_rdy) return;

  var _rdyFired = false;
  var _log = [];

  function addLog(msg) {
    _log.push(Date.now() + ': ' + msg);
    if (_log.length > 20) _log.shift();
  }

  function fireReady() {
    if (_rdyFired) return;
    _rdyFired = true;
    window.__ts_ocr_bridge_rdy = true;
    addLog('Tesseract ready');
    window.postMessage({ __ts_type: 'ready' }, '*');
  }

  function waitForTesseract(retries) {
    retries = retries || 0;
    if (window.Tesseract) { fireReady(); return; }
    if (retries > 120) {
      window.postMessage({ __ts_type: 'error', error: 'Tesseract.js 未加载' }, '*');
      return;
    }
    setTimeout(function() { waitForTesseract(retries + 1); }, 250);
  }
  waitForTesseract();

  function sendError(msg) {
    addLog('ERROR: ' + msg);
    window.postMessage({ __ts_type: 'error', error: msg, _log: _log.slice(-8) }, '*');
  }

  window.addEventListener('message', function(e) {
    if (e.source !== window) return;
    if (!e.data || !e.data.__ts_action) return;
    if (!window.__ts_ocr_bridge_rdy) return;

    var action = e.data.__ts_action;
    addLog('action: ' + action);

    if (action === 'recognize') {
      var langs = e.data.langs || 'chi_sim+eng';
      var opts = {
        langPath: 'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0',
        logger: function(info) {
          addLog((info.status || '') + ' ' + (info.progress || ''));
        }
      };
      if (e.data.workerPath) opts.workerPath = e.data.workerPath;
      if (e.data.corePath) opts.corePath = e.data.corePath;

      addLog('Tesseract.recognize ' + langs);

      Tesseract.recognize(e.data.image, langs, opts).then(function(result) {
        var text = (result.data.text || '').trim();
        addLog('done, chars=' + text.length);
        window.postMessage({ __ts_type: 'result', id: e.data.id, text: text }, '*');
      }).catch(function(err) {
        sendError('识别失败: ' + (err.message || err));
      });
    }
  });

})();
