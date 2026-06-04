// diff/render.js — pure functions that turn diff data into HTML.
// Kept DOM-free so it can be unit-tested in isolation.

import { escapeHtml } from '../shared/dom.js';

const KIND_PREFIX = {
  added: '+',
  removed: '−',
  changed: '~',
  'type-changed': '⇄',
};

const KIND_LABEL = {
  added: '新增',
  removed: '删除',
  changed: '修改',
  'type-changed': '类型变',
};

function renderPrimitive(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function renderLineDiffPanel(lines) {
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

export function renderStructuralDiff(changes) {
  if (!changes.length) {
    return `<div class="diff-line equal"><span class="diff-line-content">— 无差异 —</span></div>`;
  }
  return changes.map((c) => {
    const cls = c.kind;
    const prefix = KIND_PREFIX[c.kind] || ' ';
    const label = KIND_LABEL[c.kind] || c.kind;
    let body;
    if (c.kind === 'added') {
      body = `${escapeHtml(c.path)} = ${escapeHtml(renderPrimitive(c.after))}`;
    } else if (c.kind === 'removed') {
      body = `${escapeHtml(c.path)} = ${escapeHtml(renderPrimitive(c.before))}`;
    } else if (c.kind === 'changed') {
      body = `${escapeHtml(c.path)}: ${escapeHtml(renderPrimitive(c.before))} → ${escapeHtml(renderPrimitive(c.after))}`;
    } else { // type-changed
      body = `${escapeHtml(c.path)}: ${escapeHtml(typeof c.before)} → ${escapeHtml(typeof c.after)} (${escapeHtml(renderPrimitive(c.before))} → ${escapeHtml(renderPrimitive(c.after))})`;
    }
    return `<div class="diff-line ${cls}"><span class="diff-line-num">${label}</span><span class="diff-line-content">${prefix} ${body}</span></div>`;
  }).join('');
}
