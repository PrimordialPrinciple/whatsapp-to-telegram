/*!
 * app.js — UI, state, persistence, effects. Depends on converter.js (window.WA2TG).
 * Everything lives inside this IIFE; nothing is added to the global scope.
 */
(function () {
  'use strict';
  const W = window.WA2TG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? '⌘' : 'Ctrl';
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqLight = matchMedia('(prefers-color-scheme: light)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => mqReduce.matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ===================== Persistence ===================== */
  const KEY = 'wa2tg.settings';
  const DEFAULTS = { format: 'telegram', theme: 'system', effects: true, trail: true, sound: false, tab: 'raw' };
  const settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  /* ===================== Elements & state ===================== */
  const ta = $('#input'), mirror = $('#mirror'), editor = $('#editor');
  const outRaw = $('#out-raw'), outPreview = $('#out-preview');
  const state = { result: null, history: [], programmatic: false, prevMarks: new Map(), fileName: '' };
  const LARGE = 200000;

  /* ===================== Live region ===================== */
  const live = $('#live');
  let liveT;
  function announce(msg) { clearTimeout(liveT); live.textContent = ''; liveT = setTimeout(() => { live.textContent = msg; }, 50); }

  /* ===================== Sound (Web Audio, synthesized) ===================== */
  const Sound = {
    ctx: null,
    tone(freq, start, dur, type = 'sine', gain = 0.12, to) {
      if (!settings.sound) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const c = this.ctx, t = c.currentTime + start, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
      } catch (e) { /* audio unavailable */ }
    },
    pop() { this.tone(620, 0, 0.1, 'sine', 0.14, 240); },
    chime() { [880, 1318.5, 1760].forEach((f, i) => this.tone(f, 0.06 + i * 0.07, 0.5, 'triangle', 0.07)); },
  };

  /* ===================== Toasts ===================== */
  function toast(msg, { type = 'success', action, duration = 3600 } = {}) {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const icon = document.createElement('span');
    icon.className = 'toast__icon'; icon.textContent = type === 'error' ? '!' : type === 'info' ? 'i' : '✓';
    const text = document.createElement('span'); text.textContent = msg;
    el.append(icon, text);
    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      if (reduced()) return el.remove();
      el.classList.add('is-out'); el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast__action'; b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); dismiss(); });
      el.append(b);
    }
    root.append(el);
    while (root.children.length > 4) root.firstElementChild.remove();
    const arm = () => { timer = setTimeout(dismiss, duration); };
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', arm);
    arm();
    announce(msg);
  }

  /* ===================== Conversion & rendering ===================== */
  let raf = 0, bigTimer = 0;
  function schedule() {
    if (ta.value.length > LARGE) { clearTimeout(bigTimer); bigTimer = setTimeout(convertNow, 120); return; }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; convertNow(); });
  }

  function convertNow() {
    const src = ta.value;
    const res = W.convert(src, { format: settings.format });
    state.result = res;
    // input mirror
    const plain = src.length > LARGE;
    editor.classList.toggle('is-plain', plain);
    if (!plain) { mirror.innerHTML = W.mirrorHtml(src, res.marks) + '\u200b'; syncMirror(); }
    // outputs (all HTML is pre-escaped by the converter)
    outRaw.innerHTML = res.view + '\u200b';
    outPreview.innerHTML = res.html;
    flashNewMarks();
    // stats
    tick($('#st-chars'), src.length);
    tick($('#st-words'), (src.match(/\S+/g) || []).length);
    tick($('#st-lines'), src ? src.split('\n').length : 0);
    tick($('#st-total'), res.stats.total);
    $$('#kinds .kind').forEach((li) => { const v = res.stats[li.dataset.k]; li.hidden = !v; tick($('.num', li), v); });
    $('#empty-in').classList.toggle('is-hidden', !!src);
    $('#empty-out').classList.toggle('is-hidden', !!res.output);
    clearTimeout(state.annT);
    state.annT = setTimeout(() => src && announce(`${res.stats.total} conversion${res.stats.total === 1 ? '' : 's'}`), 1200);
  }

  function flashNewMarks() {
    const marks = $$('.mk', outRaw);
    if (marks.length > 600) return;
    const seen = new Map();
    let n = 0;
    marks.forEach((el) => {
      const base = el.className.replace(' is-new', '') + '|' + (el.nextSibling ? el.nextSibling.textContent.slice(0, 24) : '');
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      const key = base + '#' + count;
      seen.set(key, true);
      if (!state.prevMarks.has(key)) { el.classList.add('is-new'); el.style.setProperty('--d', Math.min(n++, 14) * 40 + 'ms'); }
    });
    state.prevMarks = seen;
  }

  function syncMirror() {
    mirror.style.width = ta.clientWidth + 'px';
    mirror.style.height = ta.clientHeight + 'px';
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  }

  function tick(el, to) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (from === to) return;
    cancelAnimationFrame(el._raf);
    if (reduced()) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 480), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString();
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  ta.addEventListener('input', () => { state.programmatic = false; schedule(); });
  ta.addEventListener('scroll', syncMirror, { passive: true });
  new ResizeObserver(syncMirror).observe(ta);

  function setInput(text, { record = true } = {}) {
    if (record) { state.history.push(ta.value); if (state.history.length > 30) state.history.shift(); }
    ta.value = text;
    ta.scrollTop = 0;
    state.programmatic = true;
    $('#btn-undo').disabled = !state.history.length;
    convertNow();
  }
  function undo() {
    if (!state.history.length) return;
    setInput(state.history.pop(), { record: false });
    $('#btn-undo').disabled = !state.history.length;
    toast('Restored previous text', { type: 'info' });
  }

  /* ===================== Tabs ===================== */
  const tabs = $$('.tab');
  const pill = $('.tabs__pill');
  function placePill() {
    const t = tabs.find((x) => x.getAttribute('aria-selected') === 'true');
    if (!t) return;
    pill.style.setProperty('--px', t.offsetLeft - 4 + 'px');
    pill.style.setProperty('--pw', t.offsetWidth + 'px');
  }
  function selectTab(name, focus) {
    settings.tab = name; save();
    tabs.forEach((t) => {
      const on = t.id === 'tab-' + name;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      const panel = $('#' + t.getAttribute('aria-controls'));
      const wasHidden = panel.hidden;
      panel.hidden = !on;
      if (on && wasHidden) { panel.classList.remove('is-entering'); void panel.offsetWidth; panel.classList.add('is-entering'); }
      if (on && focus) t.focus();
    });
    placePill();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.id.slice(4)));
    t.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length].id.slice(4), true); }
    });
  });
  addEventListener('resize', placePill);

  /* ===================== Settings & theme ===================== */
  function applySettingsUI() {
    $$('[data-setting]').forEach((el) => {
      const v = settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!v; else el.checked = el.value === v;
    });
    const md = settings.format === 'markdown';
    $('#raw-label').textContent = md ? 'Markdown' : 'Telegram';
    $('.empty--out .empty__hint').textContent = md ? 'Your Markdown appears here ✨' : 'Your Telegram-ready text appears here ✨';
    document.body.classList.toggle('no-fx', !settings.effects);
    requestAnimationFrame(placePill);
  }
  $$('[data-setting]').forEach((el) => el.addEventListener('change', () => {
    const key = el.dataset.setting;
    if (el.type === 'radio' && !el.checked) return;
    settings[key] = el.type === 'checkbox' ? el.checked : el.value;
    save(); applySettingsUI();
    if (key === 'format') { state.prevMarks = new Map(); convertNow(); toast(`Output format: ${settings.format === 'markdown' ? 'Markdown' : 'Telegram'}`, { type: 'info', duration: 1800 }); }
    if (key === 'theme') applyTheme();
    if (key === 'effects') Stars.refresh();
  }));
  $('#btn-reset').addEventListener('click', () => {
    Object.assign(settings, DEFAULTS); save(); applySettingsUI(); applyTheme(); Stars.refresh(); convertNow();
    toast('Settings reset', { type: 'info' });
  });

  const currentTheme = () => (settings.theme === 'dark' || settings.theme === 'light') ? settings.theme : (mqLight.matches ? 'light' : 'dark');
  function applyTheme() {
    document.documentElement.dataset.theme = currentTheme();
    Stars.refresh();
  }
  mqLight.addEventListener('change', () => settings.theme === 'system' && applyTheme());

  function toggleTheme() {
    const btn = $('#btn-theme');
    settings.theme = currentTheme() === 'dark' ? 'light' : 'dark';
    save(); applySettingsUI();
    if (!document.startViewTransition || reduced()) {
      const root = document.documentElement;
      root.classList.add('theme-fade'); applyTheme();
      setTimeout(() => root.classList.remove('theme-fade'), 500);
      return;
    }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(applyTheme);
    vt.ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  }

  /* ===================== Dialogs ===================== */
  function openDialog(d) { if (!d.open) { d.classList.remove('is-closing'); d.showModal(); } }
  function closeDialog(d) {
    if (!d.open || d.classList.contains('is-closing')) return;
    if (reduced()) return d.close();
    d.classList.add('is-closing');
    const done = () => { d.classList.remove('is-closing'); d.close(); };
    const t = setTimeout(done, 400);
    d.addEventListener('animationend', (e) => { if (e.target === d) { clearTimeout(t); done(); } }, { once: true });
  }
  $$('dialog').forEach((d) => {
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(d); });
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) closeDialog(d); });
  });

  /* ===================== Clipboard & file actions ===================== */
  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.append(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
      t.remove(); return ok;
    }
  }

  async function copyOutput() {
    const btn = $('#btn-copy');
    const text = state.result && state.result.output;
    if (!text) return toast('Nothing to copy yet. Type or paste something first.', { type: 'info' });
    Sound.pop();
    if (!(await writeClipboard(text))) return toast('Copy failed. Your browser blocked clipboard access.', { type: 'error' });
    btn.classList.add('is-done'); $('.btn__label', btn).textContent = 'Copied!';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('is-done'); $('.btn__label', btn).textContent = 'Copy'; }, 1800);
    const r = btn.getBoundingClientRect();
    FX.confetti(r.left + r.width / 2, r.top + r.height / 2);
    Sound.chime();
    toast(`${settings.format === 'markdown' ? 'Markdown' : 'Telegram text'} copied to clipboard`);
  }

  async function copyRich() {
    const html = outPreview.innerHTML;
    if (!html) return toast('Nothing to copy yet.', { type: 'info' });
    const wrapped = `<div style="white-space:pre-wrap">${html}</div>`;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([wrapped], { type: 'text/html' }),
        'text/plain': new Blob([outPreview.textContent], { type: 'text/plain' }),
      })]);
    } catch (e) {
      // Fallback: select a temporary rendered copy and use execCommand
      const tmp = document.createElement('div');
      tmp.innerHTML = wrapped; tmp.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(tmp);
      const range = document.createRange(); range.selectNodeContents(tmp);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { /* ignore */ }
      sel.removeAllRanges(); tmp.remove();
      if (!ok) return toast('Rich copy is not supported in this browser.', { type: 'error' });
    }
    Sound.chime();
    toast('Preview copied as rich text');
  }

  function download() {
    const text = state.result && state.result.output;
    if (!text) return toast('Nothing to download yet.', { type: 'info' });
    const md = settings.format === 'markdown';
    const blob = new Blob([text], { type: md ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.fileName || 'converted'}-${md ? 'markdown.md' : 'telegram.txt'}`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    Sound.chime();
    toast(`Downloaded ${a.download}`);
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return toast('Clipboard is empty.', { type: 'info' });
      setInput(text); toast('Pasted from clipboard', { action: { label: 'Undo', run: undo } });
    } catch (e) {
      toast(`Clipboard access blocked. Press ${MOD}+V in the editor instead.`, { type: 'error' });
      ta.focus();
    }
  }

  function clearInput() {
    if (!ta.value) return;
    setInput('');
    toast('Input cleared', { type: 'info', action: { label: 'Undo', run: undo } });
    ta.focus();
  }

  function loadFile(file) {
    if (!file) return;
    if (/\.zip$/i.test(file.name)) return toast('That is a .zip file. Unzip it and drop the .txt inside.', { type: 'error' });
    if (file.size > 15 * 1024 * 1024) return toast('File is too large (max 15 MB).', { type: 'error' });
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result || '').replace(/^\ufeff/, ''));
      state.fileName = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
      Sound.chime();
      toast(`Loaded “${file.name}”`, { action: { label: 'Undo', run: undo } });
    };
    reader.onerror = () => toast('Could not read that file.', { type: 'error' });
    reader.readAsText(file);
  }

  $('#btn-copy').addEventListener('click', copyOutput);
  $('#btn-rich').addEventListener('click', copyRich);
  $('#btn-download').addEventListener('click', download);
  $('#btn-paste').addEventListener('click', paste);
  $('#btn-clear').addEventListener('click', clearInput);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-open').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-settings').addEventListener('click', () => openDialog($('#settings')));
  $('#btn-shortcuts').addEventListener('click', () => openDialog($('#shortcuts')));
  $('#btn-tests').addEventListener('click', runTests);

  /* ===================== Drag & drop ===================== */
  const drop = $('#drop');
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('is-on'); });
  addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('is-on'); });
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; drop.classList.remove('is-on');
    loadFile(e.dataTransfer.files[0]);
  });

  /* ===================== Samples ===================== */
  const SAMPLES = {
    murli: [
      '   💞🥀🕉❤️💗✴️🌹🌻☺️',
      '',
      '            *हिन्दी अव्यक्त मुरली*',
      '        𝘚𝘶𝘯𝘥𝘢𝘺 𝘈𝘔 𝘙𝘦𝘷𝘪𝘴𝘪𝘰𝘯',
      '               _(25.10.2026)_',
      '   ══════◄••❀••►══════',
      "   **''घर का गेट खोलने के लिए ...''**",
      '   🏚 _Meditation Hall,_',
      '           ~Pandav~ *Pandav Bhavan*',
      '',
      '   > *ओम शान्ति* 🙏',
    ].join('\n'),
    features: [
      '*Weekend plan* 🏕️',
      '_Saturday_ we hike, ~Sunday~ we rest. *_Bring snacks_*, obviously.',
      '',
      'Packing list:',
      '* Water bottle',
      '- Sunscreen _(SPF 50)_',
      '1. Meet at *7:30*',
      '',
      '> Remember: *leave no trace*',
      '',
      'Run `npm run *hike*` and see https://example.com/trail_maps/north_ridge',
      '```',
      'code blocks stay *exactly* _as is_',
      '```',
    ].join('\n'),
    edge: [
      '* not bold *  (spaces inside markers)',
      'snake_case_word, file_name_v2.txt, 2*3*4, a * b * c',
      'first_last@mail.com and https://x.com/a_b_c',
      '**already bold** and __already italic__ stay untouched',
      '*multi',
      'line* never spans lines',
      '(*wrapped*) and _italic_. and ~*nested*~ and _*both*_',
      '\tTab-indented *bold*      with trailing spaces   ',
    ].join('\n'),
  };
  $$('[data-sample]').forEach((b) => b.addEventListener('click', () => {
    setInput(SAMPLES[b.dataset.sample]);
    toast('Sample loaded', { action: { label: 'Undo', run: undo } });
  }));

  /* ===================== Keyboard shortcuts ===================== */
  const isEditable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  $$('[data-tip]').forEach((el) => { el.dataset.tip = el.dataset.tip.replace('Mod', MOD); });
  $$('kbd[data-mod]').forEach((k) => { k.textContent = MOD; });
  let typed = '', konami = [];
  const KONAMI = 'arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a';
  document.addEventListener('keydown', (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (k === 'enter' || (e.shiftKey && k === 'c')) { e.preventDefault(); return copyOutput(); }
      if (!e.shiftKey && k === 'k') { e.preventDefault(); return clearInput(); }
      if (!e.shiftKey && k === 's') { e.preventDefault(); return download(); }
      if (k === ',') { e.preventDefault(); return openDialog($('#settings')); }
      if (!e.shiftKey && k === 'd') { e.preventDefault(); return toggleTheme(); }
      if (!e.shiftKey && k === 'z' && e.target === ta && state.programmatic && state.history.length) { e.preventDefault(); return undo(); }
    }
    if (isEditable(e.target)) return;
    if (e.key === '?' && !document.querySelector('dialog[open]')) { e.preventDefault(); openDialog($('#shortcuts')); return; }
    // easter eggs
    if (k.length === 1) typed = (typed + k).slice(-7);
    konami = konami.concat(k).slice(-10);
    if (typed === 'sparkle' || konami.join(',') === KONAMI) { typed = ''; konami = []; FX.shower(); }
  });

  /* ===================== Effects: starfield ===================== */
  const Stars = (() => {
    const c = $('#stars'), ctx = c.getContext('2d');
    let stars = [], w = 0, h = 0, dpr = 1, id = 0, px = 0, py = 0, tx = 0, ty = 0, shoot = null;
    const COLORS = { dark: ['255,255,255', '165,243,252', '196,181,253', '134,239,172'], light: ['139,92,246', '236,72,153', '14,165,233', '22,163,74'] };
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight;
      c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(220, Math.round((w * h) / 7500));
      stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, z: rand(0.25, 1), r: rand(0.4, 1.5), ph: rand(0, 6.28), sp: rand(0.6, 2), ci: Math.random() < 0.7 ? 0 : 1 + (Math.random() * 3 | 0) }));
    }
    function draw(t) {
      const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const pal = COLORS[theme];
      px += (tx - px) * 0.05; py += (ty - py) * 0.05;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        let x = (s.x + px * s.z * 26) % w, y = (s.y + py * s.z * 26) % h;
        if (x < 0) x += w; if (y < 0) y += h;
        const a = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.sp + s.ph))) * s.z * (theme === 'light' ? 0.55 : 1);
        ctx.fillStyle = `rgba(${pal[s.ci]},${a.toFixed(3)})`;
        const r = s.r * s.z;
        if (r > 1.05) { // four-point glint for the brightest stars
          ctx.beginPath(); ctx.moveTo(x, y - r * 3); ctx.quadraticCurveTo(x, y, x + r * 3, y); ctx.quadraticCurveTo(x, y, x, y + r * 3); ctx.quadraticCurveTo(x, y, x - r * 3, y); ctx.quadraticCurveTo(x, y, x, y - r * 3); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
      }
      // occasional shooting star
      if (!shoot && Math.random() < 0.002) shoot = { x: rand(0, w), y: rand(0, h * 0.4), l: 0 };
      if (shoot) {
        shoot.l += 0.02; const sx = shoot.x + shoot.l * 500, sy = shoot.y + shoot.l * 220;
        const g = ctx.createLinearGradient(sx - 90, sy - 40, sx, sy);
        g.addColorStop(0, `rgba(${pal[1]},0)`); g.addColorStop(1, `rgba(${pal[1]},${(1 - shoot.l).toFixed(2)})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 90, sy - 40); ctx.lineTo(sx, sy); ctx.stroke();
        if (shoot.l >= 1) shoot = null;
      }
    }
    const loop = (t) => { draw(t); id = requestAnimationFrame(loop); };
    function refresh() {
      cancelAnimationFrame(id); id = 0;
      c.style.display = settings.effects ? '' : 'none';
      if (!settings.effects) return;
      if (reduced() || document.hidden) { draw(0); return; }
      id = requestAnimationFrame(loop);
    }
    addEventListener('resize', () => { resize(); refresh(); });
    document.addEventListener('visibilitychange', refresh);
    mqReduce.addEventListener('change', refresh);
    addEventListener('pointermove', (e) => { tx = (e.clientX / w - 0.5) * -2; ty = (e.clientY / h - 0.5) * -2; }, { passive: true });
    addEventListener('deviceorientation', (e) => { if (e.gamma != null) { tx = e.gamma / -30; ty = (e.beta - 45) / -30; } }, { passive: true });
    resize();
    return { refresh };
  })();

  /* ===================== Effects: particles (trail, confetti, shower) ===================== */
  const FX = (() => {
    const c = $('#fx'), ctx = c.getContext('2d');
    const P = [], MAX = 420;
    const PALETTE = ['#25D366', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#ffffff'];
    let id = 0, w = 0, h = 0, last = 0;
    function resize() { const dpr = Math.min(devicePixelRatio || 1, 2); w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function add(p) { if (P.length >= MAX) P.shift(); P.push(p); if (!id) { last = performance.now(); id = requestAnimationFrame(loop); } }
    function star(s) { ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s); ctx.fill(); }
    function loop(now) {
      const dt = Math.min(2, (now - last) / 16.67); last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.life -= dt * 16.67;
        if (p.life <= 0 || p.y > h + 40) { P.splice(i, 1); continue; }
        p.vx *= Math.pow(p.drag, dt); p.vy = p.vy * Math.pow(p.drag, dt) + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const k = p.life / p.max;
        ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        const s = p.size * (p.shrink ? k : 1);
        if (p.shape === 'star') star(s);
        else if (p.shape === 'rect') { ctx.scale(1, Math.cos(p.rot * 2)); ctx.fillRect(-s, -s / 2, s * 2, s); }
        else { ctx.beginPath(); ctx.arc(0, 0, s / 1.6, 0, 6.283); ctx.fill(); }
        ctx.restore();
      }
      id = P.length ? requestAnimationFrame(loop) : 0;
      if (!id) ctx.clearRect(0, 0, w, h);
    }
    const allowed = () => !reduced() && !document.hidden;
    function confetti(x, y) {
      if (!allowed()) return;
      for (let i = 0; i < 80; i++) {
        const a = -Math.PI / 2 + rand(-1.2, 1.2), v = rand(5, 13), shape = ['rect', 'star', 'circle'][i % 3];
        add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.32, drag: 0.975, rot: rand(0, 6), vr: rand(-0.3, 0.3), size: rand(3, 6), color: PALETTE[i % PALETTE.length], shape, life: rand(1300, 2100), max: 2100 });
      }
    }
    function trail(x, y) {
      if (!allowed() || !settings.trail || !settings.effects) return;
      add({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-0.6, 0.6), vy: rand(-1, 0.2), g: 0.02, drag: 0.96, rot: rand(0, 3), vr: rand(-0.1, 0.1), size: rand(2.5, 6), color: PALETTE[Math.random() * 5 | 0], shape: 'star', shrink: true, life: rand(600, 950), max: 950 });
    }
    function shower() {
      if (reduced()) { toast('✨ Sparkle mode! (calm version for reduced motion)', { type: 'info' }); return; }
      let n = 0;
      const burst = () => {
        for (let i = 0; i < 9; i++) add({ x: rand(0, w), y: -10, vx: rand(-1, 1), vy: rand(2, 5), g: 0.08, drag: 0.99, rot: rand(0, 6), vr: rand(-0.2, 0.2), size: rand(3, 7), color: PALETTE[Math.random() * 6 | 0], shape: Math.random() < 0.6 ? 'star' : 'rect', life: 4000, max: 4000 });
        if (++n < 45) setTimeout(burst, 55);
      };
      burst(); Sound.chime(); toast('✨ Sparkle shower!', { type: 'info', duration: 2400 });
    }
    resize(); addEventListener('resize', resize);
    return { confetti, trail, shower };
  })();

  /* ===================== Effects: pointer (spotlight, trail, magnetic, tilt, ripple) ===================== */
  const cards = $$('.glass');
  let pRaf = 0, pe = null, lastTrail = { x: 0, y: 0, t: 0 };
  addEventListener('pointermove', (e) => {
    pe = e;
    if (e.pointerType === 'mouse') {
      const now = performance.now(), dx = e.clientX - lastTrail.x, dy = e.clientY - lastTrail.y;
      if (now - lastTrail.t > 22 && dx * dx + dy * dy > 64) { FX.trail(e.clientX, e.clientY); lastTrail = { x: e.clientX, y: e.clientY, t: now }; }
    }
    if (!pRaf) pRaf = requestAnimationFrame(() => {
      pRaf = 0;
      for (const card of cards) {
        const r = card.getBoundingClientRect(), x = pe.clientX - r.left, y = pe.clientY - r.top;
        card.style.setProperty('--mx', x + 'px'); card.style.setProperty('--my', y + 'px');
        card.classList.toggle('is-lit', x > -60 && y > -60 && x < r.width + 60 && y < r.height + 60);
      }
    });
  }, { passive: true });

  function pointerFx() {
    if (!mqFine.matches) return;
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        if (reduced()) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px');
        el.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); });
    });
    $$('.tilt').forEach((el) => {
      const max = el.classList.contains('hero') ? 2.5 : 10;
      el.addEventListener('pointermove', (e) => {
        if (reduced()) return;
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--rx', (-y * max).toFixed(2) + 'deg'); el.style.setProperty('--ry', (x * max).toFixed(2) + 'deg');
        if (el.classList.contains('hero')) e.stopPropagation();
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn, .chip');
    if (!b || reduced()) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    if (getComputedStyle(b).overflow !== 'hidden') return; // keep tooltips unclipped on icon buttons
    b.append(span); span.addEventListener('animationend', () => span.remove());
  });

  /* ===================== Hero typewriter ===================== */
  async function typewriter() {
    const root = $('.typer'), from = $('.typer__from'), to = $('.typer__to'), caret = $('.typer__caret');
    const pairs = () => settings.format === 'markdown'
      ? [['*bold*', '**bold**'], ['_italic_', '*italic*'], ['~strike~', '~~strike~~'], ['*_both_*', '***both***'], ['* item', '- item']]
      : [['*bold*', '**bold**'], ['_italic_', '__italic__'], ['~strike~', '~~strike~~'], ['*_both_*', '**__both__**'], ['*हिन्दी*', '**हिन्दी**']];
    for (let i = 0; ; i++) {
      const list = pairs(), [a, b] = list[i % list.length];
      if (reduced()) { from.textContent = a; to.textContent = b; await sleep(3200); continue; }
      from.textContent = ''; to.textContent = ''; from.after(caret);
      for (const ch of a) { from.textContent += ch; await sleep(70); }
      await sleep(350); root.classList.add('is-morph'); to.after(caret);
      for (const ch of b) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; to.append(s); await sleep(45); }
      await sleep(250); root.classList.remove('is-morph');
      await sleep(1700);
    }
  }

  /* ===================== Self-tests ===================== */
  function runTests() {
    const results = W.runTests();
    const passed = results.filter((r) => r.pass).length, total = results.length;
    const list = $('#tests-list'), sum = $('#tests-summary');
    list.textContent = '';
    const C = 2 * Math.PI * 24, ok = passed === total;
    sum.innerHTML = `<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="24" stroke="var(--line-2)"/><circle cx="28" cy="28" r="24" stroke="${ok ? 'var(--green)' : 'var(--c-strike)'}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - passed / total)}"/></svg><span></span>`;
    $('span', sum).textContent = `${passed} / ${total} passed ${ok ? '🎉' : '⚠️'}`;
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'test' + (r.pass ? '' : ' is-fail');
      li.style.setProperty('--d', Math.min(i, 40) * 15 + 'ms');
      const mark = document.createElement('span'); mark.className = 'test__mark'; mark.textContent = r.pass ? '✓' : '✗';
      const name = document.createElement('span'); name.textContent = r.name;
      const group = document.createElement('span'); group.className = 'test__group'; group.textContent = r.group;
      li.append(mark, name, group);
      if (!r.pass) {
        const pre = document.createElement('pre');
        pre.textContent = `input:    ${JSON.stringify(r.input)}\nexpected: ${JSON.stringify(r.expected)}\nactual:   ${JSON.stringify(r.actual)}`;
        li.append(pre);
      }
      list.append(li);
    });
    document.documentElement.dataset.tests = `${passed}/${total}`;
    console.table(results.map(({ group, name, pass }) => ({ group, name, pass })));
    openDialog($('#tests'));
    if (ok) setTimeout(() => FX.confetti(innerWidth / 2, innerHeight / 3), 300);
  }

  /* ===================== Init ===================== */
  applySettingsUI();
  applyTheme();
  selectTab(settings.tab === 'preview' ? 'preview' : 'raw');
  convertNow();
  const qs = /[?&]sample=(\w+)/.exec(location.search);
  if (qs && SAMPLES[qs[1]]) setInput(SAMPLES[qs[1]], { record: false });
  pointerFx();
  typewriter();
  if (/[?&]test\b/.test(location.search)) runTests();
})();
