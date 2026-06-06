// ============================================================
// content/markdown.js — Markdown / KaTeX 渲染 (纯工具函数)
// ============================================================
'use strict';
(function() {

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitize(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript\s*:/gi, '');
  }

  function inline(text) {
    // 先转义 HTML 特殊字符，防止 <x,x> 这类数学符号被浏览器当成 HTML 标签
    text = escapeHtml(text);
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function renderMarkdown(text) {
    if (!text) return '';

    var codeBlocks = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code) {
      var idx = codeBlocks.length;
      var langLabel = lang
        ? '<span style="position:absolute;top:6px;left:12px;font-size:11px;color:var(--md-outline)">' + escapeHtml(lang) + '</span>'
        : '';
      codeBlocks.push(
        '<div class="cb-wrap">' + langLabel + '<button class="copy-btn">复制</button><pre><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre></div>'
      );
      return '\x00CB' + idx + '\x00';
    });

    // ---- KaTeX 数学公式渲染 ----
    var mathBlocks = [];
    if (typeof katex !== 'undefined') {
      // 块级公式 $$...$$ 或 \[...\]
      text = text.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, function(m, m1, m2) {
        var math = ((m1 || m2) || '').trim();
        if (!math) return m;
        var idx = mathBlocks.length;
        try {
          mathBlocks.push(katex.renderToString(math, { displayMode: true, throwOnError: false }));
        } catch(e) { mathBlocks.push('<code class="math-fallback">' + escapeHtml(math) + '</code>'); }
        return '\x00MB' + idx + '\x00';
      });
      // 行内公式 \(...\)
      text = text.replace(/\\\(([\s\S]*?)\\\)/g, function(_, math) {
        if (!math.trim()) return _;
        var idx = mathBlocks.length;
        try {
          mathBlocks.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }));
        } catch(e) { mathBlocks.push('<code class="math-fallback">' + escapeHtml(math.trim()) + '</code>'); }
        return '\x00MB' + idx + '\x00';
      });
      // 行内公式 $...$（最多匹配单行，避免跨行贪婪）
      text = text.replace(/\$([^$\n]+?)\$/g, function(_, math) {
        if (!math.trim()) return _;
        var idx = mathBlocks.length;
        try {
          mathBlocks.push(katex.renderToString(math.trim(), { displayMode: false, throwOnError: false }));
        } catch(e) { mathBlocks.push('<code class="math-fallback">' + escapeHtml(math.trim()) + '</code>'); }
        return '\x00MB' + idx + '\x00';
      });
    }

    var lines = text.split('\n');
    var html = '';
    var inUl = false, inOl = false;

    var closeLists = function() {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
    };

    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();

      var cbMatch = trimmed.match(/^\x00CB(\d+)\x00$/);
      if (cbMatch) {
        closeLists();
        html += codeBlocks[parseInt(cbMatch[1])];
        continue;
      }

      // 数学占位行
      var mbMatch = trimmed.match(/^\x00MB(\d+)\x00$/);
      if (mbMatch) {
        closeLists();
        html += mathBlocks[parseInt(mbMatch[1])];
        continue;
      }

      var hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        closeLists();
        var level = Math.min(hMatch[1].length, 4);
        html += '<h' + level + '>' + inline(hMatch[2]) + '</h' + level + '>';
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeLists();
        html += '<hr style="border:none;border-top:1px solid var(--md-outline-variant);margin:8px 0">';
        continue;
      }

      if (trimmed.startsWith('>')) {
        closeLists();
        html += '<blockquote>' + inline(trimmed.slice(1).trim()) + '</blockquote>';
        continue;
      }

      if (/^[-*+]\s+/.test(trimmed)) {
        if (!inUl) { if (inOl) { html += '</ol>'; inOl = false; } html += '<ul>'; inUl = true; }
        html += '<li>' + inline(trimmed.replace(/^[-*+]\s+/, '')) + '</li>';
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inOl) { if (inUl) { html += '</ul>'; inUl = false; } html += '<ol>'; inOl = true; }
        html += '<li>' + inline(trimmed.replace(/^\d+\.\s+/, '')) + '</li>';
        continue;
      }

      if (!trimmed) {
        closeLists();
        continue;
      }

      closeLists();
      html += '<p>' + inline(trimmed) + '</p>';
    }
    closeLists();

    html = html.replace(/\x00CB(\d+)\x00/g, function(_, i) { return codeBlocks[parseInt(i)]; });
    html = html.replace(/\x00MB(\d+)\x00/g, function(_, i) { return mathBlocks[parseInt(i) || 0] || ''; });
    return sanitize(html);
  }

  window.AIChatMD = {
    renderMarkdown: renderMarkdown,
    escapeHtml: escapeHtml,
    sanitize: sanitize
  };

})();
