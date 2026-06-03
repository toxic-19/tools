// shared/dom.js — central DOM references + small helpers
// One place to look up elements; modules import what they need.

export const $ = (id) => document.getElementById(id);

export const els = {
  tabs: () => document.querySelectorAll('.tab'),
  contents: () => document.querySelectorAll('.tab-content'),
  viewToggles: () => document.querySelectorAll('.view-toggle'),

  jsonInput: () => $('json-input'),
  lineNums: () => $('line-numbers'),
  statusBadge: () => $('status-badge'),
  errorPanel: () => $('error-panel'),
  errorMsg: () => $('error-msg'),
  charCount: () => $('char-count'),
  sizeInfo: () => $('size-info'),
  typeInfo: () => $('type-info'),
  jsonTreeView: () => $('json-tree-view'),

  btnFormat: () => $('btn-format'),
  btnCompact: () => $('btn-compact'),
  btnRepair: () => $('btn-repair'),
  btnEscape: () => $('btn-escape'),
  btnUnescape: () => $('btn-unescape'),
  btnCopy: () => $('btn-copy'),
  btnClear: () => $('btn-clear'),
  btnSampleFormat: () => $('btn-sample-format'),
  btnExpand: () => $('btn-expand'),
  btnTheme: () => $('btn-theme'),

  diffLeft: () => $('diff-left'),
  diffRight: () => $('diff-right'),
  btnCompare: () => $('btn-compare'),
  btnSampleDiff: () => $('btn-sample-diff'),
  btnSwap: () => $('btn-swap'),
  btnClearDiff: () => $('btn-clear-diff'),
  diffResult: () => $('diff-result'),
  diffPanelL: () => $('diff-left-result'),
  diffPanelR: () => $('diff-right-result'),
  diffStats: () => $('diff-stats'),
  badgeA: () => $('badge-a'),
  badgeB: () => $('badge-b'),

  btnStringLoad: () => $('btn-string-load'),
  btnStringApply: () => $('btn-string-apply'),
  btnSampleString: () => $('btn-sample-string'),
  stringPathSelect: () => $('string-path-select'),
  stringJsonInput: () => $('string-json-input'),
  stringEditor: () => $('string-editor'),
  stringStatus: () => $('string-status'),
  stringMeta: () => $('string-meta'),
  stringQuickGuide: () => $('string-quick-guide'),
};

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}
