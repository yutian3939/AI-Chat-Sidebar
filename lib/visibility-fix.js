// 后台标签页保活：伪造“页面始终可见”，拦截失焦/可见性事件，避免播放器暂停
// 由 content script 注入到页面主世界（top + 各同源 iframe）
(function () {
  // 每个 frame/window 只执行一次（避免重复注入叠加多个 interval）
  if (window.__CX_VIS_FIX__) return;
  window.__CX_VIS_FIX__ = true;

  try {
    Object.defineProperty(document, 'hidden', { get: function () { return false; }, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
    try { Object.defineProperty(document, 'webkitHidden', { get: function () { return false; }, configurable: true }); } catch (e) {}
    try { Object.defineProperty(document, 'webkitVisibilityState', { get: function () { return 'visible'; }, configurable: true }); } catch (e) {}
    document.hasFocus = function () { return true; };
  } catch (e) {}

  // 拦截可见性/失焦事件，阻止播放器的“切走即暂停”逻辑
  ['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange', 'blur', 'pagehide', 'freeze']
    .forEach(function (t) {
      try {
        window.addEventListener(t, function (e) { try { e.stopImmediatePropagation(); } catch (_) {} }, true);
      } catch (e) {}
    });

  // 兜底：持续保活本页视频/音频（后台计时器会被节流，但仍在运行）
  setInterval(function () {
    try {
      var vs = document.querySelectorAll('video, audio');
      for (var i = 0; i < vs.length; i++) {
        var v = vs[i];
        if (v.paused && !v.ended && v.readyState >= 2) {
          try { v.muted = true; } catch (e) {}
          try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        }
      }
    } catch (e) {}
  }, 1500);
})();
