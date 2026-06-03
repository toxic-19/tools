// diff/render.js — pure function to turn annotated lines into HTML.
// Kept DOM-free so it can be unit-tested.

import { escapeHtml } from '../shared/dom.js';

export function renderDiffPanel(lines) {
  return lines
    .filter((l) => l.type !== 'changed-phantom')
    .map((item) => {
      if (item.type === 'empty') {
        return `<div class="diff-line" style="opacity:0.15"><span class="diff-line-num"></span><span class="diff-line-content"> </span></div>`;
      }
      const cls = item.type;
      const prefix =
        item.type === 'added' ? '+' :
        item.type === 'removed' ? '−' :
        item.type === 'changed' ? '~' : ' ';
      const num = item.lineNum !== null ? item.lineNum : '';
      const text = escapeHtml(item.text);
      return `<div class="diff-line ${cls}"><span class="diff-line-num">${num}</span><span class="diff-line-content">${prefix} ${text}</span></div>`;
    })
    .join('');
}
