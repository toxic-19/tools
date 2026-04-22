/* ============================================================
   JSON Toolkit Pro — popup.js
   ============================================================ */

/* ── DOM refs ──────────────────────────────────────────────── */
const tabs        = document.querySelectorAll('.tab');
const contents    = document.querySelectorAll('.tab-content');
const jsonInput   = document.getElementById('json-input');
const lineNums    = document.getElementById('line-numbers');
const statusBadge = document.getElementById('status-badge');
const errorPanel  = document.getElementById('error-panel');
const errorMsg    = document.getElementById('error-msg');
const charCount   = document.getElementById('char-count');
const sizeInfo    = document.getElementById('size-info');
const typeInfo    = document.getElementById('type-info');

// Tree view
const viewToggles  = document.querySelectorAll('.view-toggle');
const jsonTreeView = document.getElementById('json-tree-view');

// Toolbar buttons
const btnFormat   = document.getElementById('btn-format');
const btnCompact  = document.getElementById('btn-compact');
const btnRepair   = document.getElementById('btn-repair');
const btnEscape   = document.getElementById('btn-escape');
const btnUnescape = document.getElementById('btn-unescape');
const btnCopy     = document.getElementById('btn-copy');
const btnClear    = document.getElementById('btn-clear');
const btnSampleFormat = document.getElementById('btn-sample-format');
const btnStringLoad  = document.getElementById('btn-string-load');
const btnStringApply = document.getElementById('btn-string-apply');
const btnSampleString = document.getElementById('btn-sample-string');
const stringPathSelect = document.getElementById('string-path-select');
const stringJsonInput = document.getElementById('string-json-input');
const stringEditor = document.getElementById('string-editor');
const stringStatus = document.getElementById('string-status');
const stringMeta = document.getElementById('string-meta');

// Diff
const diffLeft    = document.getElementById('diff-left');
const diffRight   = document.getElementById('diff-right');
const btnCompare  = document.getElementById('btn-compare');
const btnSampleDiff = document.getElementById('btn-sample-diff');
const btnSwap     = document.getElementById('btn-swap');
const btnClearDiff= document.getElementById('btn-clear-diff');
const diffResult  = document.getElementById('diff-result');
const diffPanelL  = document.getElementById('diff-left-result');
const diffPanelR  = document.getElementById('diff-right-result');
const diffStats   = document.getElementById('diff-stats');
const badgeA      = document.getElementById('badge-a');
const badgeB      = document.getElementById('badge-b');
const stringQuickGuide = document.getElementById('string-quick-guide');
let stringEntries = [];

const FORMAT_SAMPLE = {
  user: {
    id: 1024,
    name: "Alice",
    roles: ["admin", "auditor"],
    active: true
  },
  profile: {
    city: "Shanghai",
    tags: ["json", "toolkit", "demo"]
  },
  metrics: {
    loginCount: 18,
    lastLoginAt: "2026-04-20T09:30:00Z"
  }
};

const DIFF_SAMPLE_LEFT = {
  app: "JSON Toolkit Pro",
  version: "1.0.0",
  features: ["format", "repair", "diff"],
  settings: {
    theme: "light",
    compactByDefault: false
  }
};

const DIFF_SAMPLE_RIGHT = {
  app: "JSON Toolkit Pro",
  version: "1.1.0",
  features: ["format", "repair", "diff", "string-edit"],
  settings: {
    theme: "dark",
    compactByDefault: true
  },
  release: {
    date: "2026-04-20",
    notes: "Add string value editor"
  }
};

const STRING_SAMPLE = {
  title: "发布公告",
  content: "第一行：欢迎使用\n第二行：支持多行编辑\n第三行：写回后自动恢复为 \\n",
  meta: {
    owner: "Team A",
    prompt: "步骤1：粘贴 JSON\n步骤2：选择路径\n步骤3：写回"
  }
};

/* ── Tab switching ─────────────────────────────────────────── */
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('content-' + tab.dataset.tab).classList.add('active');
  });
});

/* ── Line numbers ──────────────────────────────────────────── */
function updateLineNumbers() {
  const lines = jsonInput.value.split('\n').length;
  lineNums.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  // sync scroll
  lineNums.scrollTop = jsonInput.scrollTop;
}

jsonInput.addEventListener('input', () => {
  updateLineNumbers();
  updateInfo();
  validateLive();
});

jsonInput.addEventListener('paste', () => {
  setTimeout(resetScroll, 0);
});

jsonInput.addEventListener('scroll', () => {
  lineNums.scrollTop = jsonInput.scrollTop;
});

// Tab key support
jsonInput.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = jsonInput.selectionStart, end = jsonInput.selectionEnd;
    jsonInput.value = jsonInput.value.substring(0, s) + '  ' + jsonInput.value.substring(end);
    jsonInput.selectionStart = jsonInput.selectionEnd = s + 2;
  }
});

/* ── Info bar ──────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function updateInfo() {
  const val = jsonInput.value;
  charCount.textContent = val.length + ' 字符';
  sizeInfo.textContent  = formatBytes(new Blob([val]).size);
  try {
    const parsed = JSON.parse(val);
    const t = Array.isArray(parsed) ? 'Array[' + parsed.length + ']'
              : (typeof parsed === 'object' && parsed !== null)
                ? 'Object{' + Object.keys(parsed).length + ' keys}'
                : typeof parsed;
    typeInfo.textContent = t;
  } catch { typeInfo.textContent = ''; }
}

/* ── Validation ────────────────────────────────────────────── */
function validateLive() {
  const val = jsonInput.value.trim();
  if (!val) {
    setStatus('就绪', '');
    hideError();
    return;
  }
  try {
    JSON.parse(val);
    setStatus('✓ 有效', 'success');
    hideError();
  } catch (e) {
    setStatus('✗ 无效', 'error');
    showError(e.message);
  }
}

function setStatus(text, type) {
  statusBadge.textContent = text;
  statusBadge.className = 'status-badge' + (type ? ' ' + type : '');
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorPanel.classList.remove('hidden');
}

function hideError() {
  errorPanel.classList.add('hidden');
}

/* ── Format ────────────────────────────────────────────────── */
btnFormat.addEventListener('click', () => {
  const val = jsonInput.value.trim();
  if (!val) return;
  try {
    const parsed = JSON.parse(val);
    jsonInput.value = JSON.stringify(parsed, null, 2);
    flashSuccess();
    resetScroll();
    refreshTreeViewIfNeeded();
  } catch (e) {
    setStatus('✗ 格式化失败', 'error');
    showError('请先修复 JSON 再格式化: ' + e.message);
  }
  updateLineNumbers();
  updateInfo();
  validateLive();
});

/* ── Compact ───────────────────────────────────────────────── */
btnCompact.addEventListener('click', () => {
  const val = jsonInput.value.trim();
  if (!val) return;
  try {
    const parsed = JSON.parse(val);
    jsonInput.value = JSON.stringify(parsed);
    flashSuccess();
    resetScroll();
    refreshTreeViewIfNeeded();
  } catch (e) {
    setStatus('✗ 压缩失败', 'error');
    showError('请先修复 JSON 再压缩: ' + e.message);
  }
  updateLineNumbers();
  updateInfo();
  validateLive();
});

/* ── Repair ────────────────────────────────────────────────── */
btnRepair.addEventListener('click', () => {
  const val = jsonInput.value.trim();
  if (!val) return;
  try {
    // First try native parse
    JSON.parse(val);
    setStatus('✓ 无需修复', 'success');
    return;
  } catch (_) {}
  try {
    const repaired = jsonRepair(val);
    // Validate repaired output
    JSON.parse(repaired);
    jsonInput.value = JSON.stringify(JSON.parse(repaired), null, 2);
    setStatus('✓ 修复成功', 'success');
    hideError();
    resetScroll();
    refreshTreeViewIfNeeded();
  } catch (e) {
    setStatus('✗ 修复失败', 'error');
    showError('无法自动修复: ' + e.message);
  }
  updateLineNumbers();
  updateInfo();
});

/* ── Escape (JSON.stringify) ─────────────────────────────────── */
btnEscape.addEventListener('click', () => {
  const val = jsonInput.value.trim();
  if (!val) return;
  try {
    // Attempt parsing first to ensure it's valid JSON
    let parsed = JSON.parse(val);
    // Double stringify creates the escaped string version
    jsonInput.value = JSON.stringify(JSON.stringify(parsed));
    flashSuccess();
    resetScroll();
    refreshTreeViewIfNeeded();
  } catch (e) {
    // If not JSON, just stringify the raw text to escape it
    jsonInput.value = JSON.stringify(val);
    flashSuccess();
    resetScroll();
    refreshTreeViewIfNeeded();
  }
  updateLineNumbers();
  updateInfo();
  validateLive();
});

/* ── Unescape ──────────────────────────────────────────────── */
btnUnescape.addEventListener('click', () => {
  const val = jsonInput.value.trim();
  if (!val) return;
  try {
    // Attempt to parse once to unescape the string
    let unescaped = JSON.parse(val);
    if (typeof unescaped === 'string') {
      jsonInput.value = unescaped;
      flashSuccess();
      resetScroll();
      refreshTreeViewIfNeeded();
    } else {
      setStatus('✓ 已经是 JSON', 'success');
    }
  } catch (e) {
    setStatus('✗ 反转义失败', 'error');
    showError('输入不是有效的转义字符串: ' + e.message);
  }
  updateLineNumbers();
  updateInfo();
  validateLive();
});

/* ── Copy ──────────────────────────────────────────────────── */
btnCopy.addEventListener('click', async () => {
  const val = jsonInput.value;
  if (!val) return;
  try {
    await navigator.clipboard.writeText(val);
    btnCopy.classList.add('copied');
    btnCopy.textContent = '✓ 已复制';
    setTimeout(() => {
      btnCopy.classList.remove('copied');
      btnCopy.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> 复制`;
    }, 1800);
  } catch (e) {
    showError('剪贴板访问失败');
  }
});

/* ── Clear ─────────────────────────────────────────────────── */
btnClear.addEventListener('click', () => {
  jsonInput.value = '';
  updateLineNumbers();
  updateInfo();
  validateLive();
  refreshTreeViewIfNeeded();
});

if (btnSampleFormat) {
  btnSampleFormat.addEventListener('click', () => {
    jsonInput.value = JSON.stringify(FORMAT_SAMPLE, null, 2);
    updateLineNumbers();
    updateInfo();
    validateLive();
    resetScroll();
    refreshTreeViewIfNeeded();
    flashSuccess();
  });
}

function flashSuccess() {
  setStatus('✓ 完成', 'success');
}

/* ── Diff: badge update ────────────────────────────────────── */
diffLeft.addEventListener('input', () => updateDiffBadge(diffLeft, badgeA));
diffRight.addEventListener('input', () => updateDiffBadge(diffRight, badgeB));

function updateDiffBadge(el, badge) {
  const val = el.value.trim();
  if (!val) { badge.textContent = '-'; return; }
  try {
    const p = JSON.parse(val);
    badge.textContent = Array.isArray(p) ? 'Array' : typeof p === 'object' ? 'Object' : typeof p;
  } catch { badge.textContent = '非法'; }
}

/* ── Swap ──────────────────────────────────────────────────── */
btnSwap.addEventListener('click', () => {
  const tmp = diffLeft.value;
  diffLeft.value = diffRight.value;
  diffRight.value = tmp;
  updateDiffBadge(diffLeft, badgeA);
  updateDiffBadge(diffRight, badgeB);
  diffResult.classList.add('hidden');
});

/* ── Clear Diff ────────────────────────────────────────────── */
btnClearDiff.addEventListener('click', () => {
  diffLeft.value = '';
  diffRight.value = '';
  diffResult.classList.add('hidden');
  badgeA.textContent = '-';
  badgeB.textContent = '-';
});

if (btnSampleDiff) {
  btnSampleDiff.addEventListener('click', () => {
    diffLeft.value = JSON.stringify(DIFF_SAMPLE_LEFT, null, 2);
    diffRight.value = JSON.stringify(DIFF_SAMPLE_RIGHT, null, 2);
    updateDiffBadge(diffLeft, badgeA);
    updateDiffBadge(diffRight, badgeB);
    diffResult.classList.add('hidden');
  });
}

/* ── Compare ───────────────────────────────────────────────── */
btnCompare.addEventListener('click', () => {
  const lVal = diffLeft.value.trim();
  const rVal = diffRight.value.trim();
  if (!lVal || !rVal) {
    alert('请在两侧都输入 JSON');
    return;
  }

  let lObj, rObj;
  try { lObj = JSON.parse(lVal); } catch (e) { alert('JSON A 格式错误: ' + e.message); return; }
  try { rObj = JSON.parse(rVal); } catch (e) { alert('JSON B 格式错误: ' + e.message); return; }

  const lLines = JSON.stringify(lObj, null, 2).split('\n');
  const rLines = JSON.stringify(rObj, null, 2).split('\n');

  const { leftAnnotated, rightAnnotated, stats } = computeDiff(lLines, rLines);

  diffPanelL.innerHTML = renderDiffPanel(leftAnnotated);
  diffPanelR.innerHTML = renderDiffPanel(rightAnnotated);
  diffStats.textContent = `新增 ${stats.added} · 删除 ${stats.removed} · 修改 ${stats.changed}`;
  diffResult.classList.remove('hidden');

  // sync scroll
  syncScroll(diffPanelL, diffPanelR);
});

/* ── LCS-based diff algorithm ──────────────────────────────── */
function computeDiff(lLines, rLines) {
  // Build LCS table
  const m = lLines.length, n = rLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (lLines[i].trimEnd() === rLines[j].trimEnd()) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const leftAnnotated  = [];
  const rightAnnotated = [];
  let i = 0, j = 0;
  const stats = { added: 0, removed: 0, changed: 0 };

  while (i < m || j < n) {
    if (i < m && j < n && lLines[i].trimEnd() === rLines[j].trimEnd()) {
      leftAnnotated.push({ type: 'equal', text: lLines[i], lineNum: i + 1 });
      rightAnnotated.push({ type: 'equal', text: rLines[j], lineNum: j + 1 });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      // added in right
      rightAnnotated.push({ type: 'added', text: rLines[j], lineNum: j + 1 });
      leftAnnotated.push({ type: 'empty', text: '', lineNum: null });
      stats.added++;
      j++;
    } else {
      // removed from left
      leftAnnotated.push({ type: 'removed', text: lLines[i], lineNum: i + 1 });
      rightAnnotated.push({ type: 'empty', text: '', lineNum: null });
      stats.removed++;
      i++;
    }
  }

  // Second pass: pair up adjacent removed/added → changed
  for (let k = 0; k < leftAnnotated.length; k++) {
    const lItem = leftAnnotated[k];
    const rItem = rightAnnotated[k];
    if (lItem.type === 'removed' && rItem.type === 'empty') {
      // look forward for added on right
      if (k + 1 < rightAnnotated.length && rightAnnotated[k + 1].type === 'added' && leftAnnotated[k + 1].type === 'empty') {
        lItem.type = 'changed';
        rightAnnotated[k + 1].type = 'changed';
        leftAnnotated[k + 1].type = 'changed-phantom'; // placeholder consumed
        stats.changed++;
        stats.removed--;
        stats.added--;
      }
    }
  }

  return { leftAnnotated, rightAnnotated, stats };
}

/* ── Render diff panel ─────────────────────────────────────── */
function renderDiffPanel(lines) {
  return lines.filter(l => l.type !== 'changed-phantom').map(item => {
    if (item.type === 'empty') {
      return `<div class="diff-line" style="opacity:0.15"><span class="diff-line-num"></span><span class="diff-line-content"> </span></div>`;
    }
    const cls = item.type;
    const prefix = item.type === 'added' ? '+' : item.type === 'removed' ? '−' : item.type === 'changed' ? '~' : ' ';
    const num = item.lineNum !== null ? item.lineNum : '';
    const text = escapeHtml(item.text);
    return `<div class="diff-line ${cls}"><span class="diff-line-num">${num}</span><span class="diff-line-content">${prefix} ${text}</span></div>`;
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Sync scroll between panels ────────────────────────────── */
function syncScroll(a, b) {
  let syncingA = false, syncingB = false;
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

/* ── Init ──────────────────────────────────────────────────── */
updateLineNumbers();
updateInfo();

/* ── Open fullpage in new tab ──────────────────────────── */
const btnExpand = document.getElementById('btn-expand');
if (btnExpand) {
  btnExpand.addEventListener('click', () => {
    const url = chrome.runtime.getURL('fullpage.html');
    chrome.tabs.create({ url });
  });
}

/* ── Theme toggle ──────────────────────────────────────── */
const THEME_KEY = 'json-toolkit-theme';
const btnTheme  = document.getElementById('btn-theme');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // If light theme, show Moon (switch to dark). If dark, show Sun (switch to light).
  if (btnTheme) btnTheme.textContent = theme === 'light' ? '🌙' : '☀️';
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
}

function initTheme() {
  let saved = 'light';
  try { saved = localStorage.getItem(THEME_KEY) || 'light'; } catch (_) {}
  applyTheme(saved);
}

if (btnTheme) {
  btnTheme.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function resetScroll() {
  jsonInput.scrollLeft = 0;
  jsonInput.scrollTop = 0;
  if (lineNums) lineNums.scrollTop = 0;
}

/* ── String value edit helpers ────────────────────────────── */
function setStringStatus(text, type) {
  if (!stringStatus) return;
  stringStatus.textContent = text;
  stringStatus.className = 'status-badge' + (type ? ' ' + type : '');
}

function setStringControlsEnabled(enabled) {
  if (stringPathSelect) stringPathSelect.disabled = !enabled;
  if (btnStringApply) btnStringApply.disabled = !enabled;
}

function formatPathLabel(tokens) {
  if (!tokens.length) return '$';
  return '$' + tokens.map((token) => (
    typeof token === 'number'
      ? `[${token}]`
      : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token)
        ? `.${token}`
        : `[${JSON.stringify(token)}]`
  )).join('');
}

function collectStringEntries(node, tokens = []) {
  if (typeof node === 'string') {
    return [{ id: JSON.stringify(tokens), label: formatPathLabel(tokens), value: node, tokens }];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => collectStringEntries(item, [...tokens, i]));
  }
  if (node && typeof node === 'object') {
    return Object.keys(node).flatMap((k) => collectStringEntries(node[k], [...tokens, k]));
  }
  return [];
}

function findStringEntryById(id) {
  return stringEntries.find((entry) => entry.id === id);
}

function getByTokens(root, tokens) {
  return tokens.reduce((acc, token) => (acc == null ? undefined : acc[token]), root);
}

function setByTokens(root, tokens, value) {
  if (!tokens.length) return false;
  let target = root;
  for (let i = 0; i < tokens.length - 1; i++) target = target[tokens[i]];
  target[tokens[tokens.length - 1]] = value;
  return true;
}

function updateStringEditorFromSelection() {
  if (!stringPathSelect || !stringEditor || !stringMeta) return;
  const id = stringPathSelect.value;
  const found = findStringEntryById(id);
  if (!found) {
    stringEditor.value = '';
    stringMeta.textContent = '未选择字段';
    setStringStatus('请选择路径', 'warning');
    return;
  }
  stringEditor.value = found.value;
  const lineCount = found.value.split('\n').length;
  stringMeta.textContent = `${found.label} · ${found.value.length} 字符 · ${lineCount} 行`;
  setStringStatus('可编辑', '');
  if (stringQuickGuide) stringQuickGuide.textContent = '已进入编辑状态：支持直接输入多行，点击“写回 JSON”后会自动转成 JSON 转义字符串。';
}

function loadStringEntries() {
  if (!stringPathSelect || !stringEditor || !stringMeta || !stringJsonInput) return;
  const raw = stringJsonInput.value.trim();
  if (!raw) {
    setStringControlsEnabled(false);
    setStringStatus('请先输入 JSON', 'warning');
    stringMeta.textContent = '请先在左侧输入 JSON';
    if (stringQuickGuide) stringQuickGuide.textContent = '左侧为空：请先粘贴 JSON，再点击“解析左侧 JSON”。';
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    setStringControlsEnabled(false);
    setStringStatus('JSON 无效', 'error');
    showError('左侧 JSON 格式错误: ' + e.message);
    if (stringQuickGuide) stringQuickGuide.textContent = '检测到左侧 JSON 语法错误，请修复后再解析。';
    return;
  }
  stringEntries = collectStringEntries(parsed);
  stringPathSelect.innerHTML = '';
  if (!stringEntries.length) {
    setStringControlsEnabled(false);
    stringPathSelect.innerHTML = '<option value="">未发现字符串字段</option>';
    stringEditor.value = '';
    stringMeta.textContent = '当前 JSON 没有可编辑的字符串值';
    setStringStatus('没有字符串字段', 'warning');
    if (stringQuickGuide) stringQuickGuide.textContent = '该 JSON 中没有字符串类型 value，因此这里没有可编辑目标。';
    return;
  }
  setStringControlsEnabled(true);
  const frag = document.createDocumentFragment();
  stringEntries.forEach((entry, idx) => {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = entry.label;
    if (idx === 0) opt.selected = true;
    frag.appendChild(opt);
  });
  stringPathSelect.appendChild(frag);
  updateStringEditorFromSelection();
  setStringStatus(`已加载 ${stringEntries.length} 项`, 'success');
}

function applyStringEditToJson() {
  if (!stringPathSelect || !stringEditor || !stringJsonInput) return;
  const id = stringPathSelect.value;
  const selected = findStringEntryById(id);
  if (!selected) {
    setStringStatus('请先选择路径', 'warning');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(stringJsonInput.value);
  } catch (e) {
    setStringStatus('JSON 无效', 'error');
    showError('左侧 JSON 格式错误: ' + e.message);
    return;
  }
  if (typeof getByTokens(parsed, selected.tokens) !== 'string') {
    setStringStatus('路径已失效', 'warning');
    showError('路径对应的值不再是字符串，请重新加载字段');
    return;
  }
  setByTokens(parsed, selected.tokens, stringEditor.value);
  const formatted = JSON.stringify(parsed, null, 2);
  stringJsonInput.value = formatted;
  loadStringEntries();
  stringPathSelect.value = id;
  updateStringEditorFromSelection();
  setStringStatus('已写回 JSON', 'success');
  if (stringQuickGuide) stringQuickGuide.textContent = '写回完成：已更新当前页面左侧 JSON。';
}

initTheme();
if (btnStringLoad) btnStringLoad.addEventListener('click', loadStringEntries);
if (btnStringApply) btnStringApply.addEventListener('click', applyStringEditToJson);
if (stringPathSelect) stringPathSelect.addEventListener('change', updateStringEditorFromSelection);
if (stringEditor) {
  stringEditor.addEventListener('input', () => {
    if (!stringEntries.length) {
      setStringStatus('请先加载字段', 'warning');
      stringMeta.textContent = '当前输入不会自动关联到 JSON';
      if (stringQuickGuide) stringQuickGuide.textContent = '你正在编辑纯文本，但尚未绑定到 JSON 字段。请先点击“加载字符串字段”。';
      return;
    }
    const lineCount = stringEditor.value.split('\n').length;
    stringMeta.textContent = `当前编辑中 · ${stringEditor.value.length} 字符 · ${lineCount} 行`;
    setStringStatus('编辑中', '');
  });
}
if (stringJsonInput) {
  stringJsonInput.addEventListener('input', () => {
    setStringControlsEnabled(false);
    stringEntries = [];
    if (stringPathSelect) stringPathSelect.innerHTML = '<option value="">请重新解析 JSON</option>';
    setStringStatus('待解析', 'warning');
    stringMeta.textContent = '左侧 JSON 已变化，请重新解析';
  });
}
if (btnSampleString && stringJsonInput) {
  btnSampleString.addEventListener('click', () => {
    stringJsonInput.value = JSON.stringify(STRING_SAMPLE, null, 2);
    loadStringEntries();
    if (stringEntries.length) {
      const preferred = stringEntries.find((entry) => entry.label === '$.content');
      if (preferred && stringPathSelect) stringPathSelect.value = preferred.id;
      updateStringEditorFromSelection();
    }
    if (stringQuickGuide) stringQuickGuide.textContent = '已填充示例：你可以直接修改右侧内容并点击“写回 JSON”。';
  });
}
setStringControlsEnabled(false);

/* ── View Toggle & Tree Rendering ──────────────────────── */
let currentViewMode = 'raw';

viewToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    viewToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    currentViewMode = btn.dataset.mode;
    if (currentViewMode === 'tree') {
      jsonInput.style.display = 'none';
      lineNums.style.display = 'none';
      jsonTreeView.classList.remove('hidden');
      renderTreeView();
    } else {
      jsonInput.style.display = '';
      lineNums.style.display = '';
      jsonTreeView.classList.add('hidden');
    }
  });
});

function refreshTreeViewIfNeeded() {
  if (currentViewMode === 'tree') {
    renderTreeView();
  }
}

function renderTreeView() {
  jsonTreeView.innerHTML = '';
  const val = jsonInput.value.trim();
  if (!val) return;
  
  try {
    const parsed = JSON.parse(val);
    jsonTreeView.appendChild(buildTreeNode(parsed, true));
  } catch (e) {
    const errObj = { "Error": "Invalid JSON", "Message": e.message };
    jsonTreeView.appendChild(buildTreeNode(errObj, true));
  }
}

function buildTreeNode(data, isLast) {
  const type = Array.isArray(data) ? 'array' : (data === null ? 'null' : typeof data);
  
  if (type === 'object' || type === 'array') {
    const isObj = type === 'object';
    const keys = Object.keys(data);
    const isEmpty = keys.length === 0;
    
    const wrapper = document.createElement('div');
    wrapper.className = `json-node ${type}`;
    
    // Toggle
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = isEmpty ? '' : '▼';
    wrapper.appendChild(toggle);
    
    // Open Bracket
    const bracketL = document.createElement('span');
    bracketL.className = 'json-bracket';
    bracketL.textContent = isObj ? '{' : '[';
    wrapper.appendChild(bracketL);
    
    if (!isEmpty) {
      // Placeholder when collapsed
      const placeholder = document.createElement('span');
      placeholder.className = 'collapsed-placeholder hidden';
      placeholder.textContent = isObj ? `{ ${keys.length} }` : `[ ${keys.length} ]`;
      placeholder.style.display = 'none';
      wrapper.appendChild(placeholder);
      
      const children = document.createElement('div');
      children.className = 'json-children';
      
      keys.forEach((k, idx) => {
        const child = document.createElement('div');
        child.className = 'json-node-child';
        
        if (isObj) {
          const keySpan = document.createElement('span');
          keySpan.className = 'json-key';
          keySpan.textContent = `"${k}": `;
          child.appendChild(keySpan);
        }
        
        child.appendChild(buildTreeNode(data[k], idx === keys.length - 1));
        children.appendChild(child);
      });
      
      wrapper.appendChild(children);
      
      // Toggle logic
      const toggleCollapse = (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('collapsed');
        const isCollapsed = wrapper.classList.contains('collapsed');
        toggle.textContent = isCollapsed ? '▶' : '▼';
        placeholder.style.display = isCollapsed ? 'inline-block' : 'none';
      };
      
      toggle.addEventListener('click', toggleCollapse);
      placeholder.addEventListener('click', toggleCollapse);
      bracketL.addEventListener('dblclick', toggleCollapse);
    }
    
    // Close Bracket
    const foot = document.createElement('span');
    foot.className = 'json-bracket json-foot';
    foot.textContent = (isObj ? '}' : ']') + (isLast ? '' : ',');
    wrapper.appendChild(foot);
    
    return wrapper;
  } else {
    const span = document.createElement('span');
    span.className = `json-${type}`;
    if (type === 'string') {
      span.textContent = `"${data}"` + (isLast ? '' : ',');
    } else {
      span.textContent = String(data) + (isLast ? '' : ',');
    }
    return span;
  }
}
