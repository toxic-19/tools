// formatter/index.js — Formatter tab wiring.

import { els, formatBytes } from '../shared/dom.js';
import { setStatus, showError, hideError, flashSuccess } from './status.js';
import { tryFormat, tryCompact, tryRepair, tryStringify, tryUnescape } from './operations.js';
import { refreshTreeViewIfNeeded } from '../tree-view/index.js';
import { t } from '../shared/i18n.js';
import { safeJsonParse } from './json-errors.js';

const SAMPLE = {
  user: { id: 1024, name: 'Alice', roles: ['admin', 'auditor'], active: true },
  profile: { city: 'Shanghai', tags: ['json', 'toolkit', 'demo'] },
  metrics: { loginCount: 18, lastLoginAt: '2026-04-20T09:30:00Z' },
};

function updateLineNumbers() {
  const input = els.jsonInput();
  const lines = els.lineNums();
  if (!input || !lines) return;
  const count = input.value.split('\n').length;
  // Render each number as its own <span> so we can mark individual lines
  // (e.g. the error line) without losing the structure on re-render.
  lines.innerHTML = Array.from({ length: count }, (_, i) => {
    return `<span class="line-num">${i + 1}</span>${i < count - 1 ? '<br>' : ''}`;
  }).join('');
  lines.scrollTop = input.scrollTop;
}

// Toggle the error-line class on the gutter span for `line`.
// Idempotent: re-calling with the same line is a no-op visually.
function markErrorLine(line) {
  const lines = els.lineNums();
  if (!lines) return null;
  const previous = lines.querySelector('.error-line');
  if (previous) previous.classList.remove('error-line');
  if (!line || line < 1) return null;
  const spans = lines.querySelectorAll('.line-num');
  const target = spans[line - 1];
  if (target) target.classList.add('error-line');
  return line;
}

function validateLive() {
  const input = els.jsonInput();
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    setStatus(t('status.ready'), '');
    hideError();
    updateLineNumbers();
    return;
  }
  const result = safeJsonParse(val);
  if (result.ok) {
    setStatus(t('status.valid'), 'success');
    hideError();
    updateLineNumbers();
    return;
  }
  setStatus(t('status.invalid'), 'error');
  const { line, column, message } = result.error;
  const locTag = line ? ` (第 ${line} 行 第 ${column} 列)` : '';
  showError(message + locTag);
  markErrorLine(line);
}

function updateInfo() {
  const input = els.jsonInput();
  if (!input) return;
  const val = input.value;
  if (els.charCount()) els.charCount().textContent = val.length + ' 字符';
  if (els.sizeInfo()) els.sizeInfo().textContent = formatBytes(new Blob([val]).size);
  if (els.typeInfo()) {
    try {
      const parsed = JSON.parse(val);
      const t = Array.isArray(parsed) ? 'Array[' + parsed.length + ']'
        : (typeof parsed === 'object' && parsed !== null)
          ? 'Object{' + Object.keys(parsed).length + ' keys}'
          : typeof parsed;
      els.typeInfo().textContent = t;
    } catch { els.typeInfo().textContent = ''; }
  }
}

function apply(op) {
  const input = els.jsonInput();
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const result = op(val);
  if (!result.ok) {
    setStatus(t('status.repairFailed'), 'error');
    showError(result.error);
    return;
  }
  if (!result.unchanged) {
    input.value = result.value;
    flashSuccess();
  } else {
    setStatus(t('status.noRepairNeeded'), 'success');
  }
  refreshTreeViewIfNeeded();
  updateLineNumbers();
  updateInfo();
  validateLive();
}

export function initFormatter() {
  const input = els.jsonInput();
  if (!input) return;

  input.addEventListener('input', () => {
    updateLineNumbers();
    updateInfo();
    validateLive();
  });
  input.addEventListener('paste', () => {
    // Don't reset scroll on paste — the user just dropped content and may
    // want to keep their place. updateLineNumbers will re-render the gutter
    // when the input event fires after the paste commits.
  });
  input.addEventListener('scroll', () => { if (els.lineNums()) els.lineNums().scrollTop = input.scrollTop; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.substring(0, s) + '  ' + input.value.substring(end);
      input.selectionStart = input.selectionEnd = s + 2;
    }
  });

  els.btnFormat() && els.btnFormat().addEventListener('click', () => apply(tryFormat));
  els.btnCompact() && els.btnCompact().addEventListener('click', () => apply(tryCompact));
  els.btnRepair() && els.btnRepair().addEventListener('click', () => apply(tryRepair));
  els.btnStringify() && els.btnStringify().addEventListener('click', () => apply(tryStringify));
  els.btnUnescape() && els.btnUnescape().addEventListener('click', () => apply(tryUnescape));

  els.btnCopy() && els.btnCopy().addEventListener('click', async () => {
    if (!input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      const btn = els.btnCopy();
      btn.classList.add('copied');
      btn.textContent = t('button.copied');
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" 9="" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg> 复制`;
      }, 1800);
    } catch (e) {
      showError(t('error.clipboard'));
    }
  });

  els.btnClear() && els.btnClear().addEventListener('click', () => {
    input.value = '';
    updateLineNumbers();
    updateInfo();
    validateLive();
    refreshTreeViewIfNeeded();
  });

  els.btnSampleFormat() && els.btnSampleFormat().addEventListener('click', () => {
    input.value = JSON.stringify(SAMPLE, null, 2);
    updateLineNumbers();
    updateInfo();
    validateLive();
    refreshTreeViewIfNeeded();
    flashSuccess();
  });

  // Initial paint
  updateLineNumbers();
  updateInfo();
  validateLive();
}
