/*!
 * converter.js — WhatsApp → Telegram / Markdown engine (pure, dependency-free)
 * Exposes window.WA2TG = { convert, escapeHtml, runTests }.
 *
 * Design:
 *  - Single pass. ```blocks``` are found first, then every line is scanned once.
 *    Inline `code` and URLs are protected regions that are copied verbatim.
 *  - A recursive inline parser matches opener/closer pairs and builds three
 *    outputs at once: the converted text, a tinted view, and a safe preview.
 *  - Whitespace is never trimmed, collapsed or re-indented: every character that
 *    is not a converted marker is copied through exactly as it came in.
 */
(function (global) {
  'use strict';

  // ---------- helpers ----------
  const RE_WORD = /[\p{L}\p{N}\p{M}]/u; // letters, digits and combining marks (Devanagari matras)
  const RE_SPACE = /\s/u;
  const isWord = (c) => c !== undefined && RE_WORD.test(c);
  const isSpace = (c) => c === undefined || RE_SPACE.test(c);
  const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESC[c]);

  const FORMATS = {
    telegram: { '*': '**', '_': '__', '~': '~~' },
    markdown: { '*': '**', '_': '*', '~': '~~' },
  };
  const KIND = { '*': 'bold', '_': 'italic', '~': 'strike' };
  const TAG = { bold: 'strong', italic: 'em', strike: 'del' };

  // Inline code or URL (protected regions, copied verbatim)
  const RE_PROTECT = /`[^`\n]+`|(?:https?:\/\/|www\.)[^\s<>`]+/gu;

  function trimUrl(url, line, start) {
    for (;;) {
      const ch = url[url.length - 1];
      if (ch && '.,;:!?\'"'.includes(ch)) { url = url.slice(0, -1); continue; }
      // a trailing marker only belongs to formatting if the same marker opened earlier on the line
      if (ch && '*_~'.includes(ch) && line.lastIndexOf(ch, start - 1) !== -1) { url = url.slice(0, -1); continue; }
      if (ch === ')' && url.split(')').length > url.split('(').length) { url = url.slice(0, -1); continue; }
      return url;
    }
  }

  // ---------- core ----------
  function convert(input, options) {
    const opts = Object.assign({ format: 'telegram' }, options);
    const src = String(input == null ? '' : input);
    const fmt = FORMATS[opts.format] ? opts.format : 'telegram';
    const MAP = FORMATS[fmt];

    let text = '';     // converted output
    let view = '';     // tinted HTML of the output
    let html = '';     // preview HTML
    const marks = [];  // [start, end, cls] in source coordinates (for the input mirror)
    const stats = { bold: 0, italic: 0, strike: 0, list: 0, kept: 0, code: 0, total: 0 };

    const emitText = (s) => { if (!s) return; const e = escapeHtml(s); text += s; view += e; html += e; };
    const emitMark = (s, cls) => { text += s; view += `<span class="mk mk--${cls}">${escapeHtml(s)}</span>`; };

    // --- one line (no newlines inside) ---
    function doLine(line, off) {
      // Protected regions
      const prot = [];
      RE_PROTECT.lastIndex = 0;
      let m;
      while ((m = RE_PROTECT.exec(line))) {
        let v = m[0];
        if (v[0] !== '`') v = trimUrl(v, line, m.index);
        if (!v) { RE_PROTECT.lastIndex = m.index + 1; continue; }
        prot[m.index] = { e: m.index + v.length, code: v[0] === '`' };
        RE_PROTECT.lastIndex = m.index + v.length;
      }

      const runAt = (i) => line[i - 1] === line[i] || line[i + 1] === line[i];
      const isPair2 = (i) => line[i + 1] === line[i] && line[i - 1] !== line[i] && line[i + 2] !== line[i];

      function findCloser(i, hi, c, double) {
        const w = double ? 2 : 1;
        for (let j = i + w + 1; j <= hi - w; j++) {
          const p = prot[j];
          if (p) { j = p.e - 1; continue; }
          if (line[j] !== c || isSpace(line[j - 1])) continue;
          if (double) { if (isPair2(j)) return j; }
          else if (!runAt(j) && !isWord(line[j + 1])) return j;
        }
        return -1;
      }

      function parse(lo, hi) {
        let i = lo, t = lo;
        while (i < hi) {
          const p = prot[i];
          if (p) {
            emitText(line.slice(t, i));
            const v = line.slice(i, p.e);
            text += v;
            if (p.code) {
              view += `<span class="tk tk--code">${escapeHtml(v)}</span>`;
              html += `<code>${escapeHtml(v.slice(1, -1))}</code>`;
              stats.code++;
            } else {
              view += `<span class="tk tk--link">${escapeHtml(v)}</span>`;
              const href = /^www\./i.test(v) ? 'https://' + v : v;
              html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v)}</a>`;
            }
            marks.push([off + i, off + p.e, p.code ? 'code' : 'link']);
            i = t = p.e;
            continue;
          }
          const c = line[i];
          if (KIND[c]) {
            // Already-formatted doubled pair (**x**, __x__, ~~x~~): keep verbatim, still preview it.
            if (isPair2(i) && !isSpace(line[i + 2])) {
              const j = findCloser(i, hi, c, true);
              if (j !== -1) {
                emitText(line.slice(t, i));
                const kind = c === '_' && fmt === 'markdown' ? 'bold' : KIND[c];
                emitMark(c + c, 'keep');
                html += `<${TAG[kind]}>`;
                parse(i + 2, j);
                html += `</${TAG[kind]}>`;
                emitMark(c + c, 'keep');
                stats.kept++;
                i = t = j + 2;
                continue;
              }
            }
            // Single WhatsApp marker
            if (!runAt(i) && i + 1 < hi && !isSpace(line[i + 1]) && !isWord(line[i - 1])) {
              const j = findCloser(i, hi, c, false);
              if (j !== -1) {
                emitText(line.slice(t, i));
                const kind = KIND[c];
                emitMark(MAP[c], kind);
                html += `<${TAG[kind]}>`;
                parse(i + 1, j);
                html += `</${TAG[kind]}>`;
                emitMark(MAP[c], kind);
                marks.push([off + i, off + i + 1, kind], [off + j, off + j + 1, kind]);
                stats[kind]++;
                i = t = j + 1;
                continue;
              }
            }
          }
          i++;
        }
        emitText(line.slice(t, hi));
      }

      // Block prefixes: quote and list
      let start = 0;
      const q = /^([ \t]*)(>[ \t])/.exec(line);
      const li = /^([ \t]*)([*\-•]|\d{1,9}\.)([ \t]+)(?=\S)/.exec(line);
      let quoteOpen = false;
      if (q) {
        emitText(q[1]);
        text += q[2]; view += `<span class="mk mk--quote">${escapeHtml(q[2])}</span>`;
        html += `<span class="pv-quote">`; quoteOpen = true;
        marks.push([off + q[1].length, off + q[1].length + 1, 'quote']);
        start = q[0].length;
      } else if (li) {
        emitText(li[1]);
        const marker = fmt === 'markdown' && li[2] === '*' ? '-' : li[2];
        text += marker; view += `<span class="mk mk--list">${escapeHtml(marker)}</span>`;
        html += `<span class="pv-bullet">${escapeHtml(/\d/.test(marker) ? marker : '•')}</span>`;
        emitText(li[3]);
        marks.push([off + li[1].length, off + li[1].length + li[2].length, 'list']);
        stats.list++;
        start = li[0].length;
      }
      parse(start, line.length);
      if (quoteOpen) html += '</span>';
    }

    function doText(chunk, off) {
      let o = off;
      const lines = chunk.split('\n');
      lines.forEach((ln, k) => {
        if (k > 0) emitText('\n');
        doLine(ln, o);
        o += ln.length + 1;
      });
    }

    // --- ```blocks``` first (may span lines), everything inside is untouched ---
    const RE_BLOCK = /```([\s\S]*?[^\s][\s\S]*?)```/g;
    let pos = 0, b;
    while ((b = RE_BLOCK.exec(src))) {
      doText(src.slice(pos, b.index), pos);
      const v = b[0];
      text += v;
      view += `<span class="tk tk--code">${escapeHtml(v)}</span>`;
      html += `<span class="pv-pre">${escapeHtml(b[1].replace(/^\n/, '').replace(/\n$/, ''))}</span>`;
      marks.push([b.index, b.index + v.length, 'code']);
      stats.code++;
      pos = RE_BLOCK.lastIndex;
    }
    doText(src.slice(pos), pos);

    stats.total = stats.bold + stats.italic + stats.strike + (fmt === 'markdown' ? countStarBullets(src) : 0);
    return { output: text, view, html, marks, stats, format: fmt };
  }

  function countStarBullets(src) {
    // "* item" → "- item" counts as a conversion in Markdown mode (outside code blocks)
    return (src.replace(/```[\s\S]*?```/g, '').match(/^[ \t]*\*[ \t]+(?=\S)/gm) || []).length;
  }

  /** Build the highlighted mirror HTML for the input from non-overlapping marks. */
  function mirrorHtml(src, marks) {
    const sorted = marks.slice().sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [s, e, cls] of sorted) {
      if (s < pos) continue;
      out += escapeHtml(src.slice(pos, s)) + `<span class="mk mk--${cls}">${escapeHtml(src.slice(s, e))}</span>`;
      pos = e;
    }
    return out + escapeHtml(src.slice(pos));
  }

  // ---------- self-tests ----------
  function runTests() {
    const T = 'telegram', M = 'markdown';
    const same = (s, f = T) => [s, s, f];
    const cases = [
      // basic
      ['Bold', '*bold*', '**bold**'],
      ['Italic', '_italic_', '__italic__'],
      ['Strikethrough', '~strike~', '~~strike~~'],
      ['Mixed sentence', '*bold* and _italic_ and ~strike~', '**bold** and __italic__ and ~~strike~~'],
      // nesting
      ['Bold+italic *_x_*', '*_both_*', '**__both__**'],
      ['Italic+bold _*x*_', '_*both*_', '__**both**__'],
      ['Strike+bold', '~*x*~', '~~**x**~~'],
      ['Bold+strike', '*~x~*', '**~~x~~**'],
      ['Triple nesting', '*_~all~_*', '**__~~all~~__**'],
      ['Nested inside text', '*bold _it_ here*', '**bold __it__ here**'],
      // delimiter rules
      ['Spaces inside markers', ...same('* not bold *')],
      ['Lone stars', ...same('a * b * c')],
      ['Closer after space', ...same('*bold *')],
      ['snake_case', ...same('snake_case_word')],
      ['Math 2*3*4', ...same('2*3*4')],
      ['Intraword', ...same('foo*bar*baz')],
      ['Email', ...same('first_last@mail.com')],
      ['Punctuation around', '(*bold*)', '(**bold**)'],
      ['Punctuation after', '_italic_.', '__italic__.'],
      ['No multi-line spans', ...same('*start\nend*')],
      ['Empty pairs', ...same('** __ ~~')],
      // URLs & code
      ['URL untouched', ...same('https://x.com/a_b_c')],
      ['URL with markers inside', ...same('https://x.com/_a_')],
      ['URL trailing dot', ...same('see https://x.com/a_b.')],
      ['Bold URL', '*https://x.com*', '**https://x.com**'],
      ['Inline code protected', ...same('`*not bold*`')],
      ['Code inside bold', '*bold `co_de_` here*', '**bold `co_de_` here**'],
      ['Code block protected', ...same('```\n*no* _change_\n```')],
      ['Inline triple code', ...same('```*x*```')],
      ['Text around code block', 'a *b* ```*c*\n_d_``` *e*', 'a **b** ```*c*\n_d_``` **e**'],
      // already formatted
      ['Keep **x**', ...same('**already**')],
      ['Keep __x__', ...same('__already__')],
      ['Keep ~~x~~', ...same('~~already~~')],
      ['Keep doubled Hindi', ...same("**''घर का गेट खोलने के लिए ...''**")],
      ['Single inside doubled', '**a _b_ c**', '**a __b__ c**'],
      // whitespace is sacred
      ['Leading/trailing spaces', '   *x*   ', '   **x**   '],
      ['Tabs & blank lines', '\t_x_\n\n\n  ~y~  \n', '\t__x__\n\n\n  ~~y~~  \n'],
      ['CRLF kept', 'a\r\n*b*\r\n', 'a\r\n**b**\r\n'],
      ['Decorations', ...same('   ══════◄••❀••►══════')],
      ['Emoji line', ...same('   💞🥀🕉❤️💗✴️🌹🌻☺️')],
      ['Emoji around', '💞*x*🌹', '💞**x**🌹'],
      // Unicode
      ['Hindi bold', '*हिन्दी*', '**हिन्दी**'],
      ['Hindi intraword', ...same('क*ख*ग')],
      ['Hindi matra boundary', ...same('कि*x*')],
      ['Math italic letters', ...same('        𝘚𝘶𝘯𝘥𝘢𝘺 𝘈𝘔 (25.10.2026)')],
      // blocks
      ['Quote', '> quoted *bold*', '> quoted **bold**'],
      ['Lists unchanged (Telegram)', ...same('* item one\n- item two\n1. three')],
      ['Indented list', '   * *x*', '   * **x**'],
      // markdown format
      ['MD bold', '*bold*', '**bold**', M],
      ['MD italic', '_italic_', '*italic*', M],
      ['MD bold+italic', '*_both_*', '***both***', M],
      ['MD star bullet', '* item', '- item', M],
      ['MD indented bullet', '  * item', '  - item', M],
      ['MD dash bullet kept', ...same('- item', M)],
      ['MD keep __x__', ...same('__x__', M)],
    ].map(([name, input, expected, format = T]) => {
      const actual = convert(input, { format }).output;
      return { name, group: format === M ? 'Markdown' : 'Telegram', pass: actual === expected, input, expected, actual };
    });

    const pv = (name, input, check) => {
      const h = convert(input).html;
      cases.push({ name, group: 'Preview', pass: check(h), input, expected: '(check)', actual: h });
    };
    pv('Preview bold', '*b*', (h) => h === '<strong>b</strong>');
    pv('Preview escapes HTML', '<img src=x onerror=alert(1)>', (h) => !h.includes('<img') && h.includes('&lt;img'));
    pv('Preview doubled pair', '**x**', (h) => h === '<strong>x</strong>');
    pv('Preview keeps spaces', '  a\n   b', (h) => h === '  a\n   b');
    pv('Preview link', 'go https://x.com', (h) => h.includes('<a href="https://x.com"'));
    const st = convert('*a* _b_ ~c~ `d`').stats;
    cases.push({ name: 'Stats count', group: 'Stats', pass: st.bold === 1 && st.italic === 1 && st.strike === 1 && st.code === 1 && st.total === 3, input: '*a* _b_ ~c~ `d`', expected: 'b1 i1 s1 c1 t3', actual: JSON.stringify(st) });
    return cases;
  }

  global.WA2TG = Object.freeze({ convert, mirrorHtml, escapeHtml, runTests });
})(window);

