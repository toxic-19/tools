// tree-view/inline-edit.js — convert a leaf span into an editable input.
// Pure DOM helpers; they don't know about paths or roots.

/**
 * Replace `span` with a text input prefilled with the leaf's current
 * representation. On commit (Enter) or cancel (Escape) the input is removed
 * and the original span is restored (with updated text if committed).
 *
 * The `stringify`/`parse` callbacks let callers translate between the
 * display text and the underlying JS value (e.g. for numbers, booleans).
 *
 * @param {HTMLElement} span - the leaf span to replace
 * @param {object} opts
 * @param {string} opts.initial - the text shown in the input
 * @param {(s: string) => unknown} [opts.parse] - parse the input text on commit
 * @param {(v: unknown) => string} [opts.stringify] - render the new value
 * @param {(parsed: unknown) => void} opts.onCommit - called on Enter/blur with the parsed value
 * @param {() => void} [opts.onCancel] - called on Escape
 * @returns {{ cancel: () => void, commit: () => void }}
 */
export function makeInlineEditor(span, opts) {
  const { initial, onCommit } = opts;
  const parse = opts.parse || ((s) => s);
  const stringify = opts.stringify || String;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree-inline-editor';
  input.value = initial;
  input.spellcheck = false;

  span.style.display = 'none';
  span.parentNode.insertBefore(input, span.nextSibling);

  let done = false;
  function restore() {
    if (done) return;
    done = true;
    if (input.parentNode) input.parentNode.removeChild(input);
    span.style.display = '';
  }
  function commit() {
    if (done) return;
    const text = input.value;
    let parsed;
    try { parsed = parse(text); }
    catch (e) {
      // Invalid input — cancel so the original value stays.
      restore();
      opts.onCancel && opts.onCancel();
      return;
    }
    // Update the displayed span with the new value before restoring.
    span.textContent = stringify(parsed);
    restore();
    onCommit(parsed);
  }
  function cancel() {
    restore();
    opts.onCancel && opts.onCancel();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);

  // Focus + select all so the user can immediately overwrite.
  setTimeout(() => { input.focus(); input.select(); }, 0);

  return { cancel, commit };
}

/**
 * Wire up a leaf span as editable: click → editor; right-click → context menu.
 *
 * @param {HTMLElement} span
 * @param {object} opts
 * @param {string} opts.path - the JSONPath-like path (e.g. "$.user.name")
 * @param {string} opts.value - the current display text
 * @param {unknown} opts.rawValue - the raw JS value
 * @param {(raw: unknown) => void} opts.onCommit
 * @param {string} [opts.keyName] - the object key this value belongs to
 */
export function attachLeafInteractions(span, opts) {
  const { path, value, rawValue, onCommit, keyName } = opts;
  span.classList.add('tree-leaf-editable');
  span.title = `${path} — 单击编辑，右键复制`;
  span.setAttribute('tabindex', '0');
  span.setAttribute('role', 'button');
  span.setAttribute('aria-label', `${path}: ${value}`);

  span.addEventListener('click', (e) => {
    e.stopPropagation();
    makeInlineEditor(span, {
      initial: typeof rawValue === 'string' ? rawValue : String(rawValue),
      parse: (text) => parseLeafText(text, rawValue),
      stringify: stringifyLeafValue,
      onCommit: (newRaw) => {
        span.textContent = stringifyLeafValue(newRaw);
        onCommit(newRaw);
      },
    });
  });

  span.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      span.click();
    }
  });

  span.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, [
      { label: '复制值', action: () => copyToClipboard(value) },
      ...(keyName != null
        ? [{ label: '复制键名', action: () => copyToClipboard(keyName) }]
        : []),
      { label: '复制路径', action: () => copyToClipboard(path) },
    ]);
  });
}

// --- helpers ---

function parseLeafText(text, original) {
  if (typeof original === 'number') {
    const n = Number(text);
    if (Number.isNaN(n)) throw new Error('not a number');
    return n;
  }
  if (typeof original === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    throw new Error('not a boolean');
  }
  if (original === null) {
    return text === 'null' ? null : (() => { throw new Error('expected null'); })();
  }
  return text;
}

function stringifyLeafValue(v) {
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { /* clipboard blocked; ignore */ }
}

// --- lightweight context menu (no dependencies) ---

let activeMenu = null;
function showContextMenu(x, y, items) {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'tree-context-menu';
  menu.setAttribute('role', 'menu');
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'tree-context-item';
    btn.type = 'button';
    btn.textContent = item.label;
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', () => { item.action(); hideContextMenu(); });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  // Position; clamp inside viewport.
  menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - (items.length * 36 + 8)) + 'px';
  activeMenu = menu;
  // Defer the outside-click handler so the same contextmenu event that
  // opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  if (activeMenu && activeMenu.parentNode) activeMenu.parentNode.removeChild(activeMenu);
  activeMenu = null;
}
