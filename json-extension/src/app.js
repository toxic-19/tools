// app.js — single entry point loaded as an ES module from popup.html / fullpage.html.
// Initializes theme, tabs, and each feature module in order.

import { initTheme } from './shared/theme.js';
import { initTabs } from './shared/tabs.js';
import { initFormatter } from './formatter/index.js';
import { initDiff } from './diff/index.js';
import { initStringEdit } from './string-edit/index.js';
import { initTreeView } from './tree-view/index.js';
import { els } from './shared/dom.js';

initTheme();
initTabs();

document.addEventListener('DOMContentLoaded', () => {
  initFormatter();
  initTreeView();
  initDiff();
  initStringEdit();

  // Expand-to-fullscreen button (popup only — fullpage.js hides it there)
  const expand = els.btnExpand();
  if (expand) {
    expand.addEventListener('click', () => {
      const url = chrome.runtime.getURL('fullpage.html');
      chrome.tabs.create({ url });
    });
  }
});
