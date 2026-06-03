// string-edit/index.js — String Edit tab (parse JSON → pick string field → edit → write back).

import { els } from '../shared/dom.js';
import { t } from '../shared/i18n.js';
import { collectStringEntries, getByTokens, setByTokens } from './paths.js';

const SAMPLE = {
  title: '发布公告',
  content: '第一行：欢迎使用\n第二行：支持多行编辑\n第三行：写回后自动恢复为 \\n',
  meta: { owner: 'Team A', prompt: '步骤1：粘贴 JSON\n步骤2：选择路径\n步骤3：写回' },
};

let entries = [];

function findEntryById(id) {
  return entries.find((entry) => entry.id === id);
}

function setStatus(text, type) {
  const s = els.stringStatus();
  if (!s) return;
  s.textContent = text;
  s.className = 'status-badge' + (type ? ' ' + type : '');
}

function setControlsEnabled(enabled) {
  const sel = els.stringPathSelect();
  const apply = els.btnStringApply();
  if (sel) sel.disabled = !enabled;
  if (apply) apply.disabled = !enabled;
}

function updateEditorFromSelection() {
  const sel = els.stringPathSelect();
  const editor = els.stringEditor();
  const meta = els.stringMeta();
  if (!sel || !editor || !meta) return;
  const id = sel.value;
  const found = findEntryById(id);
  if (!found) {
    editor.value = '';
    meta.textContent = '未选择字段';
    setStatus(t('string.choosePath'), 'warning');
    return;
  }
  editor.value = found.value;
  const lineCount = found.value.split('\n').length;
  meta.textContent = `${found.label} · ${found.value.length} 字符 · ${lineCount} 行`;
  setStatus(t('string.editable'), '');
  const guide = els.stringQuickGuide();
  if (guide) guide.textContent = '已进入编辑状态：支持直接输入多行，点击"写回 JSON"后会自动转成 JSON 转义字符串。';
}

function loadEntries() {
  const sel = els.stringPathSelect();
  const editor = els.stringEditor();
  const meta = els.stringMeta();
  const input = els.stringJsonInput();
  if (!sel || !editor || !meta || !input) return;

  const raw = input.value.trim();
  if (!raw) {
    setControlsEnabled(false);
    setStatus(t('string.waitInput'), 'warning');
    meta.textContent = '请先在左侧输入 JSON';
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    setControlsEnabled(false);
    setStatus(t('string.invalid'), 'error');
    const guide = els.stringQuickGuide();
    if (guide) guide.textContent = '检测到左侧 JSON 语法错误，请修复后再解析。';
    return;
  }
  entries = collectStringEntries(parsed);
  sel.innerHTML = '';
  if (!entries.length) {
    setControlsEnabled(false);
    sel.innerHTML = '<option value="">未发现字符串字段</option>';
    editor.value = '';
    meta.textContent = '当前 JSON 没有可编辑的字符串值';
    setStatus(t('string.noFields'), 'warning');
    return;
  }
  setControlsEnabled(true);
  const frag = document.createDocumentFragment();
  entries.forEach((entry, idx) => {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.label;
    if (idx === 0) opt.selected = true;
    frag.appendChild(opt);
  });
  sel.appendChild(frag);
  updateEditorFromSelection();
  setStatus(t('string.loaded', entries.length), 'success');
}

function applyEdit() {
  const sel = els.stringPathSelect();
  const editor = els.stringEditor();
  const input = els.stringJsonInput();
  if (!sel || !editor || !input) return;
  const id = sel.value;
  const selected = findEntryById(id);
  if (!selected) { setStatus(t('string.choosePath'), 'warning'); return; }
  let parsed;
  try {
    parsed = JSON.parse(input.value);
  } catch (e) {
    setStatus(t('string.invalid'), 'error');
    return;
  }
  if (typeof getByTokens(parsed, selected.tokens) !== 'string') {
    setStatus(t('string.pathInvalid'), 'warning');
    return;
  }
  setByTokens(parsed, selected.tokens, editor.value);
  input.value = JSON.stringify(parsed, null, 2);
  loadEntries();
  sel.value = id;
  updateEditorFromSelection();
  setStatus(t('string.written'), 'success');
}

export function initStringEdit() {
  const sel = els.stringPathSelect();
  const editor = els.stringEditor();
  const input = els.stringJsonInput();
  if (!sel || !editor || !input) return;

  setControlsEnabled(false);

  els.btnStringLoad() && els.btnStringLoad().addEventListener('click', loadEntries);
  els.btnStringApply() && els.btnStringApply().addEventListener('click', applyEdit);
  sel.addEventListener('change', updateEditorFromSelection);

  editor.addEventListener('input', () => {
    if (!entries.length) {
      setStatus(t('string.needLoadFirst'), 'warning');
      els.stringMeta().textContent = '当前输入不会自动关联到 JSON';
      return;
    }
    const lineCount = editor.value.split('\n').length;
    els.stringMeta().textContent = `当前编辑中 · ${editor.value.length} 字符 · ${lineCount} 行`;
    setStatus(t('string.editing'), '');
  });

  input.addEventListener('input', () => {
    setControlsEnabled(false);
    entries = [];
    sel.innerHTML = '<option value="">请重新解析 JSON</option>';
    setStatus(t('string.needReload'), 'warning');
    els.stringMeta().textContent = '左侧 JSON 已变化，请重新解析';
  });

  els.btnSampleString() && els.btnSampleString().addEventListener('click', () => {
    input.value = JSON.stringify(SAMPLE, null, 2);
    loadEntries();
    if (entries.length) {
      const preferred = entries.find((e) => e.label === '$.content');
      if (preferred) sel.value = preferred.id;
      updateEditorFromSelection();
    }
  });
}
