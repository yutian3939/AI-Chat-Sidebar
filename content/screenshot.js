// ============================================================
// content/screenshot.js — 截图模块 (框选 + 自由调整 + 快速截图)
// 通过 window.__CTX__ 获取状态
// ============================================================
'use strict';
(function() {

  var overlay, selBox, confirmBtn;
  var handles = [];          // 8 个调节手柄
  var startX, startY, selX, selY, selW, selH;
  var isSelecting = false;
  var isDragging = false;    // 拖拽调整中
  var dragMode = '';         // 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  var dragOrig = {};         // 拖拽起点数据
  var hasSelection = false;
  var rafId = 0;
  var quickMode = false;

  function getCtx() { return window.__CTX__; }

  // ---- 手柄布局: [x%, y%, cursor] ----
  var HANDLE_DEFS = [
    [0,0,'nw-resize'], [50,0,'n-resize'], [100,0,'ne-resize'],
    [100,50,'e-resize'], [100,100,'se-resize'], [50,100,'s-resize'],
    [0,100,'sw-resize'], [0,50,'w-resize']
  ];

  // ---- 创建截图层 ----
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = '__ai_screenshot_overlay__';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;touch-action:none;';
    overlay.addEventListener('pointerdown', onDown);
    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    document.body.appendChild(overlay);

    selBox = document.createElement('div');
    selBox.id = '__ai_screenshot_sel__';
    selBox.style.cssText = 'position:fixed;display:none;border:2px solid #6750A4;z-index:2147483647;pointer-events:none;';
    selBox.addEventListener('pointerdown', function(e) {
      if (hasSelection && !quickMode) { e.stopPropagation(); startHandleDrag(e, 'move'); }
    });
    document.body.appendChild(selBox);

    // 8 个手柄
    HANDLE_DEFS.forEach(function(def) {
      var h = document.createElement('div');
      h.style.cssText = 'position:fixed;display:none;width:10px;height:10px;border-radius:50%;border:2px solid #6750A4;background:#fff;z-index:2147483648;cursor:' + def[2] + ';pointer-events:auto;';
      h.setAttribute('data-mode', def[2].replace('-resize',''));
      h.addEventListener('pointerdown', function(e) { onHandleDown(e, def[2].replace('-resize','')); });
      document.body.appendChild(h);
      handles.push({ el: h, px: def[0], py: def[1] });
    });

    confirmBtn = document.createElement('button');
    confirmBtn.id = '__ai_screenshot_confirm__';
    confirmBtn.innerHTML = '✓';
    confirmBtn.title = '确认截图';
    confirmBtn.style.cssText = 'position:fixed;display:none;z-index:2147483649;width:30px;height:30px;border-radius:50%;border:none;background:#6750A4;color:#fff;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3);line-height:30px;text-align:center;';
    confirmBtn.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    confirmBtn.addEventListener('click', function(e) { e.stopPropagation(); captureAndClose(); });
    document.body.appendChild(confirmBtn);
  }

  function removeOverlay() {
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown, true);
    [overlay, selBox, confirmBtn].forEach(function(el) { if (el) el.remove(); });
    handles.forEach(function(h) { if (h.el) h.el.remove(); });
    handles = [];
    overlay = selBox = confirmBtn = null;
    hasSelection = false;
    isSelecting = false;
    isDragging = false;
  }

  // ---- 更新选中框和手柄位置 ----
  function updateSelectionUI() {
    selBox.style.left = selX + 'px';
    selBox.style.top = selY + 'px';
    selBox.style.width = Math.max(0, selW) + 'px';
    selBox.style.height = Math.max(0, selH) + 'px';
    handles.forEach(function(h) {
      h.el.style.left = (selX + selW * h.px / 100 - 5) + 'px';
      h.el.style.top = (selY + selH * h.py / 100 - 5) + 'px';
    });
    confirmBtn.style.left = (selX + selW + 6) + 'px';
    confirmBtn.style.top = (selY + selH - 15) + 'px';
  }

  function showAdjustmentUI() {
    selBox.style.display = 'block';
    selBox.style.background = 'rgba(103,80,164,.06)';
    selBox.style.pointerEvents = 'auto';
    selBox.style.cursor = 'move';
    handles.forEach(function(h) { h.el.style.display = 'block'; });
    confirmBtn.style.display = 'block';
    updateSelectionUI();
  }

  function hideAdjustmentUI() {
    selBox.style.display = 'none';
    selBox.style.pointerEvents = 'none';
    selBox.style.cursor = '';
    handles.forEach(function(h) { h.el.style.display = 'none'; });
    confirmBtn.style.display = 'none';
  }

  // ---- 框选事件 ----
  function onDown(e) {
    // 开始新框选（移动拖拽由 selBox 直接处理）
    if (hasSelection) return;
    isSelecting = true;
    hasSelection = false;
    startX = e.clientX;
    startY = e.clientY;
    selW = selH = 0;
    overlay.setPointerCapture(e.pointerId);
    hideAdjustmentUI();
    overlay.style.cursor = 'crosshair';
    overlay.style.background = 'rgba(0,0,0,.25)';
    e.preventDefault();
  }

  function onMove(e) {
    if (isDragging) {
      handleDrag(e);
      return;
    }
    if (!isSelecting) return;
    selX = Math.min(startX, e.clientX);
    selY = Math.min(startY, e.clientY);
    selW = Math.abs(e.clientX - startX);
    selH = Math.abs(e.clientY - startY);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function() {
      selBox.style.left = selX + 'px';
      selBox.style.top = selY + 'px';
      selBox.style.width = Math.max(0, selW) + 'px';
      selBox.style.height = Math.max(0, selH) + 'px';
      selBox.style.display = (selW > 8 && selH > 8) ? 'block' : 'none';
      selBox.style.pointerEvents = 'none';
      selBox.style.background = 'rgba(103,80,164,.08)';
    });
  }

  function onUp(e) {
    if (isDragging) {
      endHandleDrag(e);
      return;
    }
    if (!isSelecting) return;
    isSelecting = false;
    cancelAnimationFrame(rafId);
    try { overlay.releasePointerCapture(e.pointerId); } catch(_) {}
    if (selW < 8 || selH < 8) {
      if (!hasSelection) { removeOverlay(); restoreSidebar(); return; }
      hideAdjustmentUI();
      return;
    }
    hasSelection = true;
    overlay.style.cursor = 'default';
    overlay.style.background = 'rgba(0,0,0,.15)';
    if (quickMode) {
      captureAndClose();
      return;
    }
    showAdjustmentUI();
  }

  // ---- 手柄拖拽 ----
  function onHandleDown(e, mode) {
    e.stopPropagation();
    startHandleDrag(e, mode);
  }

  function startHandleDrag(e, mode) {
    isDragging = true;
    dragMode = mode;
    dragOrig = { x: e.clientX, y: e.clientY, sx: selX, sy: selY, sw: selW, sh: selH };
    overlay.setPointerCapture(e.pointerId);
    overlay.style.cursor = mode === 'move' ? 'grabbing' : (mode + '-resize');
    e.preventDefault();
  }

  function handleDrag(e) {
    var dx = e.clientX - dragOrig.x;
    var dy = e.clientY - dragOrig.y;
    switch (dragMode) {
      case 'move':
        selX = dragOrig.sx + dx;
        selY = dragOrig.sy + dy;
        break;
      case 'nw': selX = dragOrig.sx + dx; selY = dragOrig.sy + dy; selW = dragOrig.sw - dx; selH = dragOrig.sh - dy; break;
      case 'n':  selY = dragOrig.sy + dy; selH = dragOrig.sh - dy; break;
      case 'ne': selY = dragOrig.sy + dy; selW = dragOrig.sw + dx; selH = dragOrig.sh - dy; break;
      case 'e':  selW = dragOrig.sw + dx; break;
      case 'se': selW = dragOrig.sw + dx; selH = dragOrig.sh + dy; break;
      case 's':  selH = dragOrig.sh + dy; break;
      case 'sw': selX = dragOrig.sx + dx; selW = dragOrig.sw - dx; selH = dragOrig.sh + dy; break;
      case 'w':  selX = dragOrig.sx + dx; selW = dragOrig.sw - dx; break;
    }
    selW = Math.max(20, selW);
    selH = Math.max(20, selH);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(updateSelectionUI);
  }

  function endHandleDrag(e) {
    isDragging = false;
    dragMode = '';
    cancelAnimationFrame(rafId);
    try { overlay.releasePointerCapture(e.pointerId); } catch(_) {}
    overlay.style.cursor = 'default';
    updateSelectionUI();
  }

  // ---- 截图 ----
  async function captureAndClose() {
    if (!hasSelection || selW < 1 || selH < 1) { restoreSidebar(); return; }
    var rect = { x: selX, y: selY, w: selW, h: selH, dpr: window.devicePixelRatio || 1 };
    var doSend = quickMode; // 在 removeOverlay 前保存
    removeOverlay();
    try {
      var dataUrl = await chrome.runtime.sendMessage({ type: 'capture-screenshot', rect: rect });
      if (dataUrl) {
        // 先恢复侧边栏，再发送消息（避免 toggleSidebar 内部的 syncFromStorage 清屏）
        restoreSidebar();
        var C = getCtx();
        if (C) {
          C.attachedFiles.push({ name: '截图_' + Date.now() + '.png', type: 'image/png', dataUrl: dataUrl, text: '' });
          if (C.renderAttachments) C.renderAttachments();
          if (C.autoResize) C.autoResize();
          // 快速截图模式：直接发送
          if (doSend && C.sendMessage) C.sendMessage();
          return;
        }
      }
    } catch (err) {
      console.error('[Screenshot] 截图失败:', err);
    }
    // 截图失败或 dataUrl 为空时恢复侧边栏
    restoreSidebar();
  }

  // ---- 打开/关闭 ----
  var _sidebarWasOpen = false;

  function saveSidebarState() {
    var C = getCtx();
    _sidebarWasOpen = !!(C && C.sidebarOpen);
    if (_sidebarWasOpen && C && C.toggleSidebar) {
      C.toggleSidebar(false);
    }
  }

  function restoreSidebar() {
    if (_sidebarWasOpen) {
      var C = getCtx();
      if (C && !C.sidebarOpen) {
        // 直接打开侧边栏，不触发 syncFromStorage（避免清屏覆盖刚发/刚渲染的消息）
        C.sidebarOpen = true;
        C.sidebar.classList.add('open');
        C.fab.classList.add('open');
        C.fab.style.right = (C.sidebarWidth + 12) + 'px';
      }
      _sidebarWasOpen = false;
    }
  }

  function startScreenshot() {
    saveSidebarState();
    ensureOverlay();
    hasSelection = false;
    selW = selH = 0;
    isDragging = false;
    hideAdjustmentUI();
    overlay.style.cursor = 'crosshair';
    overlay.style.background = 'rgba(0,0,0,.25)';
    document.addEventListener('keydown', onKeyDown, true);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKeyDown, true);
      removeOverlay();
      restoreSidebar();
    }
  }

  // ---- 绑定 ----
  function bindEvents() {
    var C = getCtx(); if (!C) return;
    var btn = C.shadow.getElementById('btn-screenshot');
    if (btn) btn.addEventListener('click', startScreenshot);
    var cb = C.shadow.getElementById('settings-quick-shot');
    if (cb) {
      cb.addEventListener('change', function() {
        quickMode = cb.checked;
        chrome.storage.local.set({ quickScreenshot: quickMode });
      });
    }
  }

  function loadPrefs() {
    chrome.storage.local.get('quickScreenshot', function(data) {
      quickMode = !!data.quickScreenshot;
      var C = getCtx();
      if (C && C.shadow) {
        var cb = C.shadow.getElementById('settings-quick-shot');
        if (cb) cb.checked = quickMode;
      }
    });
  }

  window.AIChatScreenshot = { bindEvents: bindEvents, loadPrefs: loadPrefs, start: startScreenshot };
})();
