<div align="center">

# 💬 WA → TG / Markdown Converter

**A fast, zero-dependency, whitespace-perfect formatter that converts WhatsApp markup into Telegram-ready syntax and standard Markdown.**

[![Pure JavaScript](https://img.shields.io/badge/JavaScript-100%25_Vanilla-f7df1e?style=for-the-badge&logo=javascript&logoColor=black)](converter.js)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=for-the-badge)](#)
[![100% Offline](https://img.shields.io/badge/Offline-100%25_Private-blue?style=for-the-badge)](#)
[![Tests Passing](https://img.shields.io/badge/Self--Tests-40%2B_Passing-green?style=for-the-badge)](#self-tests)

<p align="center">
  <em>Vibecoded with Claude Opus 5.5 ✨</em>
</p>

</div>

---

## 🌟 Overview

Moving curated announcements, formatted newsletters, daily study notes, or chat logs from WhatsApp to Telegram or Markdown usually breaks formatting completely. 

WhatsApp uses single asterisks `*bold*` and single underscores `_italic_`, while Telegram and CommonMark require `**bold**` and `__italic__` / `*italic*`. Pasting raw WhatsApp text breaks links (`https://.../a_b_c`), mangles code snippets, and distorts custom decorative spacing.

**WA → TG** solves this with an exact, whitespace-preserving recursive parser running entirely in your browser with zero external dependencies.

---

## ✨ Features

- **🎯 Whitespace-Perfect Conversion**: Preserves every single space, tab, line break (CRLF & LF), Devanagari matra, Hindi character, emoji, and Unicode decoration.
- **🛡️ Protected Intact Zones**:
  - **URLs & Links**: `https://example.com/a_b_c` is left untouched.
  - **Inline Code & Code Blocks**: `` `code` `` and ```` ```multi-line blocks``` ```` are never modified.
  - **Intraword Protection**: `snake_case_words`, `user_name@mail.com`, and math like `2*3*4` are preserved.
  - **Idempotent**: Pre-formatted double markers (`**already bold**`, `__already italic__`) remain untouched.
- **🔄 Dual Output Formats**:
  - **Telegram**: `*bold*` → `**bold**`, `_italic_` → `__italic__`, `~strike~` → `~~strike~~`
  - **Standard Markdown**: `*bold*` → `**bold**`, `_italic_` → `*italic*`, `* bullet` → `- bullet`
- **👁️ Dual Output Views**:
  - **Raw Syntax**: Tinted preview showing syntax markers highlighted.
  - **Rendered HTML Preview**: Live formatted rich text preview.
- **📋 Rich Text & Plain Copy**:
  - One-click copy raw converted text.
  - **Copy as Rich Text**: Paste directly into formatted editors, documents, or rich web clients.
  - **Export File**: Save output directly as `.txt` or `.md`.
- **📂 Drag & Drop / File Input**: Drop `.txt` or `.md` chat exports directly into the editor.
- **🧪 Built-In Self-Tests**: Interactive modal testing 40+ unit test scenarios (nested formats, edge cases, Unicode, code protections, preview renderers).
- **🎨 Glassmorphic Midnight Aurora UI**:
  - Dynamic starfield with interactive mouse parallax & shooting stars.
  - Cursor sparkle particle trail & confetti bursts on copy.
  - Synthesized Web Audio sound effects (pops & chimes).
  - Dark / Light / System theme with smooth CSS View Transitions.
  - Easter eggs: type `sparkle` or press the Konami code for a particle shower!

---

## 🔁 Formatting Reference

| Element | WhatsApp Input | Telegram Output | Markdown Output |
| :--- | :--- | :--- | :--- |
| **Bold** | `*text*` | `**text**` | `**text**` |
| **Italic** | `_text_` | `__text__` | `*text*` |
| **Strikethrough** | `~text~` | `~~text~~` | `~~text~~` |
| **Bold + Italic** | `*_text_*` | `**__text__**` | `***text***` |
| **Bullet Lists** | `* item` | `* item` | `- item` |
| **Quotes** | `> quote` | `> quote` | `> quote` |
| **Inline Code** | `` `code` `` | `` `code` `` *(Protected)* | `` `code` `` *(Protected)* |
| **Code Block** | ```` ```code``` ```` | ```` ```code``` ```` *(Protected)* | ```` ```code``` ```` *(Protected)* |
| **Links / URLs** | `https://x.com/a_b` | `https://x.com/a_b` *(Protected)* | `https://x.com/a_b` *(Protected)* |

---

## ⌨️ Keyboard Shortcuts

| Shortcut (Mac) | Shortcut (Windows/Linux) | Action |
| :--- | :--- | :--- |
| <kbd>⌘</kbd> + <kbd>Enter</kbd> | <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Copy output to clipboard |
| <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd> | Copy output to clipboard |
| <kbd>⌘</kbd> + <kbd>K</kbd> | <kbd>Ctrl</kbd> + <kbd>K</kbd> | Clear input (with undo support) |
| <kbd>⌘</kbd> + <kbd>S</kbd> | <kbd>Ctrl</kbd> + <kbd>S</kbd> | Download as `.txt` or `.md` |
| <kbd>⌘</kbd> + <kbd>D</kbd> | <kbd>Ctrl</kbd> + <kbd>D</kbd> | Toggle Dark / Light theme |
| <kbd>⌘</kbd> + <kbd>,</kbd> | <kbd>Ctrl</kbd> + <kbd>,</kbd> | Open Settings drawer |
| <kbd>?</kbd> | <kbd>?</kbd> | Open Shortcuts cheat sheet |

---

## 🚀 Quick Start

This project is 100% static client-side web software. No `npm install`, build steps, or backend servers required.

### Run Locally

1. Clone or download the repository:
   ```bash
   git clone https://github.com/your-username/whatsapp-to-markdown.git
   cd whatsapp-to-markdown
   ```

2. Open `index.html` directly in any modern browser:
   - Double click `index.html`, or
   - Serve using any static file server:
     ```bash
     # Python 3
     python -m http.server 8000

     # Node.js (npx)
     npx serve .
     ```

3. Open `http://localhost:8000` in your browser.

---

## 🏗️ Architecture & Codebase

The project is structured cleanly into modular, dependency-free vanilla web components:

```
whatsapp-to-markdown/
├── index.html        # Semantic HTML5 layout, accessible dialogs, and SVG icons
├── styles.css        # Cascade layers (@layer tokens, layout, effects, motion), glassmorphism
├── converter.js      # Pure conversion engine (WA2TG) + complete unit test suite
├── app.js            # Reactive UI controller, canvas fx (starfield/particles), audio, events
└── README.md         # Documentation
```

### Standalone Engine Usage (`converter.js`)

`converter.js` is completely decoupled from the UI. You can embed it into bots, Node.js scripts, or CLI tools:

```javascript
// window.WA2TG.convert(input, options)
const result = WA2TG.convert('*Hello* _world_!', { format: 'telegram' });

console.log(result.output);
// => "**Hello** __world__!"

console.log(result.stats);
// => { bold: 1, italic: 1, strike: 0, list: 0, kept: 0, code: 0, total: 2 }
```

---

## 🧪 Self-Tests

The engine includes 40+ built-in test assertions covering edge cases, intraword characters, nested tags, URL boundaries, and Unicode scripts (including Devanagari / Hindi matras).

Click **"Run self-tests"** in the footer or append `?test` to the URL:
```
http://localhost:8000/?test
```

---

## 🔒 Privacy

- Runs **100% client-side**.
- No telemetry, analytics, cookies, or remote tracking.
- Your pasted chats and exports never leave your device.
