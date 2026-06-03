// formatter/status.js — status badge + error panel helpers.

import { els } from '../shared/dom.js';
import { t } from '../shared/i18n.js';

export function setStatus(text, type) {
  const badge = els.statusBadge();
  if (!badge) return;
  badge.textContent = text;
  badge.className = 'status-badge' + (type ? ' ' + type : '');
}

export function showError(msg) {
  const panel = els.errorPanel();
  const target = els.errorMsg();
  if (!panel || !target) return;
  target.textContent = msg;
  panel.classList.remove('hidden');
}

export function hideError() {
  const panel = els.errorPanel();
  if (panel) panel.classList.add('hidden');
}

export function flashSuccess() {
  setStatus(t('status.done'), 'success');
}
