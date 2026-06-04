// diff/index.js — wires up the Diff tab (badges, sample, compare, swap, clear).

import { els } from '../shared/dom.js';
import { t } from '../shared/i18n.js';
import { computeDiff } from './lcs.js';
import { renderLineDiffPanel, renderStructuralDiff } from './render.js';
import { structuralDiff, summarize } from './structural.js';

const SAMPLE_LEFT = {
  app: 'JSON Toolkit Pro',
  version: '1.0.0',
  features: ['format', 'repair', 'diff'],
  settings: { theme: 'light', compactByDefault: false },
};

const SAMPLE_RIGHT = {
  app: 'JSON Toolkit Pro',
  version: '1.1.0',
  features: ['format', 'repair', 'diff', 'string-edit'],
  settings: { theme: 'dark', compactByDefault: true },
  release: { date: '2026-04-20', notes: 'Add string value editor' },
};

let currentMode = 'line'; // 'line' | 'structural'

function updateBadge(el, badge) {
  const val = el.value.trim();
  if (!val) { badge.textContent = '-'; return; }
  try {
    const p = JSON.parse(val);
    const arr = Array.isArray(p);
    badge.textContent = arr ? t('diff.badge.array') : typeof p === 'object' ? t('diff.badge.object') : typeof p;
  } catch { badge.textContent = t('diff.badge.illegal'); }
}

function syncScroll(a, b) {
  let syncingA = false;
  let syncingB = false;
  a.addEventListener('scroll', () => {
    if (syncingB) return;
    syncingA = true;
    b.scrollTop = a.scrollTop;
    syncingA = false;
  });
  b.addEventListener('scroll', () => {
    if (syncingA) return;
    syncingB = true;
    a.scrollTop = b.scrollTop;
    syncingB = false;
  });
}

function renderLineMode(lObj, rObj) {
  const lFormatted = JSON.stringify(lObj, null, 2);
  const rFormatted = JSON.stringify(rObj, null, 2);
  const lLines = lFormatted.split('\n');
  const rLines = rFormatted.split('\n');
  const { leftAnnotated, rightAnnotated, stats } = computeDiff(lLines, rLines);
  els.diffPanelL().innerHTML = renderLineDiffPanel(leftAnnotated);
  els.diffPanelR().innerHTML = renderLineDiffPanel(rightAnnotated);
  els.diffStats().textContent = `新增 ${stats.added} · 删除 ${stats.removed} · 修改 ${stats.changed}`;
}

function renderStructuralMode(lObj, rObj) {
  const changes = structuralDiff(lObj, rObj);
  const stats = summarize(changes);
  els.diffPanelL().innerHTML = '';
  els.diffPanelR().innerHTML = renderStructuralDiff(changes);
  els.diffStats().textContent =
    `新增 ${stats.added} · 删除 ${stats.removed} · 修改 ${stats.changed} · 类型变 ${stats.typeChanged}`;
}

function compare() {
  const lVal = els.diffLeft().value.trim();
  const rVal = els.diffRight().value.trim();
  if (!lVal || !rVal) {
    alert(t('diff.needBothSides'));
    return;
  }
  let lObj;
  let rObj;
  try { lObj = JSON.parse(lVal); } catch (e) { alert(t('error.jsonAInvalid') + ': ' + e.message); return; }
  try { rObj = JSON.parse(rVal); } catch (e) { alert(t('error.jsonBInvalid') + ': ' + e.message); return; }

  // Auto-format both sides before compare (only meaningful for line mode).
  if (currentMode === 'line') {
    els.diffLeft().value = JSON.stringify(lObj, null, 2);
    els.diffRight().value = JSON.stringify(rObj, null, 2);
    updateBadge(els.diffLeft(), els.badgeA());
    updateBadge(els.diffRight(), els.badgeB());
  }

  if (currentMode === 'line') renderLineMode(lObj, rObj);
  else renderStructuralMode(lObj, rObj);

  els.diffResult().classList.remove('hidden');

  if (currentMode === 'line') {
    syncScroll(els.diffPanelL(), els.diffPanelR());
  }
}

function setMode(mode) {
  currentMode = mode;
  const toggles = document.querySelectorAll('.diff-mode-toggle');
  toggles.forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  // Hide the right panel in structural mode (single-column result).
  const right = els.diffPanelR();
  if (right) right.style.display = mode === 'structural' ? 'none' : '';
  const left = els.diffPanelL();
  if (left) left.style.gridColumn = mode === 'structural' ? '1 / -1' : '';
}

export function initDiff() {
  const left = els.diffLeft();
  const right = els.diffRight();
  const badgeA = els.badgeA();
  const badgeB = els.badgeB();
  if (!left || !right) return;

  left.addEventListener('input', () => updateBadge(left, badgeA));
  right.addEventListener('input', () => updateBadge(right, badgeB));

  els.btnCompare() && els.btnCompare().addEventListener('click', compare);

  els.btnSwap() && els.btnSwap().addEventListener('click', () => {
    const tmp = left.value;
    left.value = right.value;
    right.value = tmp;
    updateBadge(left, badgeA);
    updateBadge(right, badgeB);
    els.diffResult().classList.add('hidden');
  });

  els.btnClearDiff() && els.btnClearDiff().addEventListener('click', () => {
    left.value = '';
    right.value = '';
    els.diffResult().classList.add('hidden');
    badgeA.textContent = '-';
    badgeB.textContent = '-';
  });

  els.btnSampleDiff() && els.btnSampleDiff().addEventListener('click', () => {
    left.value = JSON.stringify(SAMPLE_LEFT, null, 2);
    right.value = JSON.stringify(SAMPLE_RIGHT, null, 2);
    updateBadge(left, badgeA);
    updateBadge(right, badgeB);
    els.diffResult().classList.add('hidden');
  });

  document.querySelectorAll('.diff-mode-toggle').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  setMode('line');
}
