// diff/index.js — wires up the Diff tab (badges, sample, compare, swap, clear).

import { els } from '../shared/dom.js';
import { t } from '../shared/i18n.js';
import { computeDiff } from './lcs.js';
import { renderDiffPanel } from './render.js';

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

  const lFormatted = JSON.stringify(lObj, null, 2);
  const rFormatted = JSON.stringify(rObj, null, 2);
  els.diffLeft().value = lFormatted;
  els.diffRight().value = rFormatted;
  updateBadge(els.diffLeft(), els.badgeA());
  updateBadge(els.diffRight(), els.badgeB());

  const lLines = lFormatted.split('\n');
  const rLines = rFormatted.split('\n');
  const { leftAnnotated, rightAnnotated, stats } = computeDiff(lLines, rLines);

  els.diffPanelL().innerHTML = renderDiffPanel(leftAnnotated);
  els.diffPanelR().innerHTML = renderDiffPanel(rightAnnotated);
  els.diffStats().textContent = `新增 ${stats.added} · 删除 ${stats.removed} · 修改 ${stats.changed}`;
  els.diffResult().classList.remove('hidden');

  syncScroll(els.diffPanelL(), els.diffPanelR());
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
}
