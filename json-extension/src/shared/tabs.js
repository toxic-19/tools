// shared/tabs.js — tab switching between Formatter / Diff / String Edit.

import { els } from './dom.js';

export function initTabs(onSwitch) {
  const tabs = els.tabs();
  const contents = els.contents();
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      contents.forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const content = document.getElementById('content-' + tab.dataset.tab);
      if (content) content.classList.add('active');
      onSwitch && onSwitch(tab.dataset.tab);
    });
  });
}
