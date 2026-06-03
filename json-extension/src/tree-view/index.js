// tree-view/index.js — manages view-mode toggle (raw / tree) + rendering.

import { els } from '../shared/dom.js';
import { buildTreeNode } from './render.js';

let currentMode = 'raw';

function renderTree() {
  const view = els.jsonTreeView();
  if (!view) return;
  view.innerHTML = '';
  const val = els.jsonInput().value.trim();
  if (!val) return;
  try {
    const parsed = JSON.parse(val);
    view.appendChild(buildTreeNode(parsed, true));
  } catch (e) {
    const errObj = { Error: 'Invalid JSON', Message: e.message };
    view.appendChild(buildTreeNode(errObj, true));
  }
}

export function refreshTreeViewIfNeeded() {
  if (currentMode === 'tree') renderTree();
}

export function initTreeView() {
  const toggles = els.viewToggles();
  if (!toggles.length) return;
  toggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      toggles.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      currentMode = btn.dataset.mode;

      const input = els.jsonInput();
      const lines = els.lineNums();
      const view = els.jsonTreeView();
      if (currentMode === 'tree') {
        if (input) input.style.display = 'none';
        if (lines) lines.style.display = 'none';
        if (view) view.classList.remove('hidden');
        renderTree();
      } else {
        if (input) input.style.display = '';
        if (lines) lines.style.display = '';
        if (view) view.classList.add('hidden');
      }
    });
  });
}
