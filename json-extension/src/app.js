// app.js — single entry point loaded as an ES module from popup.html / fullpage.html.
// Initializes theme, tabs, and each feature module in order.

import { initTheme } from './shared/theme.js';
import { initTabs } from './shared/tabs.js';
import { initFormatter } from './formatter/index.js';
import { initDiff } from './diff/index.js';
import { initStringEdit } from './string-edit/index.js';
import { initTreeView } from './tree-view/index.js';
import { els } from './shared/dom.js';
import { installSync } from './shared/sync.js';

initTheme();
initTabs();

document.addEventListener('DOMContentLoaded', () => {
  initFormatter();
  initTreeView();
  initDiff();
  initStringEdit();

  // Two-way sync between popup and fullpage so opening one in a new tab
  // doesn't drop the textarea content. Installed last so initial state
  // is read after all modules have attached their input listeners.
  installSync({
    jsonInput: els.jsonInput(),
    diffLeft: els.diffLeft(),
    diffRight: els.diffRight(),
  });

  // Expand-to-fullscreen button (popup only — fullpage.js hides it there)
  const expand = els.btnExpand();
  if (expand) {
    expand.addEventListener('click', () => {
      const url = chrome.runtime.getURL('fullpage.html');
      chrome.tabs.create({ url });
    });
  }
});
