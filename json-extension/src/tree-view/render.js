// tree-view/render.js — pure DOM builder for the collapsible JSON tree view.
// Returns a DocumentFragment root. No global state.

import { attachLeafInteractions } from './inline-edit.js';

/**
 * Build the tree DOM. Leaf nodes become editable + right-clickable.
 *
 * @param {*} data - parsed JSON value
 * @param {object} [opts]
 * @param {Array} [opts.tokens=[]] - JSONPath tokens from the root to this node
 * @param {string} [opts.keyName] - key name in the parent (for copying)
 * @param {(newRaw: unknown) => void} [opts.onCommit] - called when a leaf
 *        is edited with the new raw JS value
 * @param {boolean} [opts.isLast=true]
 */
export function buildTreeNode(data, opts = {}) {
  const isLast = opts.isLast !== false;
  const tokens = opts.tokens || [];
  const onCommit = opts.onCommit || (() => {});
  const type = Array.isArray(data) ? 'array' : (data === null ? 'null' : typeof data);

  if (type === 'object' || type === 'array') {
    const isObj = type === 'object';
    const keys = Object.keys(data);
    const isEmpty = keys.length === 0;

    const wrapper = document.createElement('div');
    wrapper.className = `json-node ${type}`;

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    toggle.textContent = isEmpty ? '' : '▼';
    wrapper.appendChild(toggle);

    const bracketL = document.createElement('span');
    bracketL.className = 'json-bracket';
    bracketL.textContent = isObj ? '{' : '[';
    wrapper.appendChild(bracketL);

    if (!isEmpty) {
      const placeholder = document.createElement('span');
      placeholder.className = 'collapsed-placeholder';
      placeholder.style.display = 'none';
      placeholder.textContent = isObj ? `{ ${keys.length} }` : `[ ${keys.length} ]`;
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
        child.appendChild(buildTreeNode(data[k], {
          isLast: idx === keys.length - 1,
          tokens: [...tokens, isObj ? k : Number(k)],
          keyName: isObj ? k : undefined,
          onCommit,
        }));
        children.appendChild(child);
      });

      wrapper.appendChild(children);

      const toggleCollapse = (e) => {
        e.stopPropagation();
        const collapsed = wrapper.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '▶' : '▼';
        placeholder.style.display = collapsed ? 'inline-block' : 'none';
      };
      toggle.addEventListener('click', toggleCollapse);
      placeholder.addEventListener('click', toggleCollapse);
      bracketL.addEventListener('dblclick', toggleCollapse);
    }

    const foot = document.createElement('span');
    foot.className = 'json-bracket json-foot';
    foot.textContent = (isObj ? '}' : ']') + (isLast ? '' : ',');
    wrapper.appendChild(foot);

    return wrapper;
  }

  // Leaf node: string / number / boolean / null
  const span = document.createElement('span');
  span.className = `json-${type} tree-leaf`;
  const display = leafDisplayText(data);
  span.textContent = display + (isLast ? '' : ',');

  if (onCommit) {
    const path = formatTokens(tokens);
    attachLeafInteractions(span, {
      path,
      value: display,
      rawValue: data,
      keyName: opts.keyName,
      onCommit: (newRaw) => onCommit(newRaw, tokens),
    });
  }

  return span;
}

function leafDisplayText(data) {
  if (typeof data === 'string') return `"${data}"`;
  if (data === null) return 'null';
  return String(data);
}

function formatTokens(tokens) {
  if (!tokens.length) return '$';
  return '$' + tokens.map((t) => (
    typeof t === 'number' ? `[${t}]`
    : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t) ? `.${t}`
    : `[${JSON.stringify(t)}]`
  )).join('');
}
