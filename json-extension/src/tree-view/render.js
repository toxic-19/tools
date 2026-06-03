// tree-view/render.js — pure DOM builder for the collapsible JSON tree view.
// Returns a DocumentFragment root. No global state.

export function buildTreeNode(data, isLast = true) {
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
        child.appendChild(buildTreeNode(data[k], idx === keys.length - 1));
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

  const span = document.createElement('span');
  span.className = `json-${type}`;
  if (type === 'string') {
    span.textContent = `"${data}"` + (isLast ? '' : ',');
  } else {
    span.textContent = String(data) + (isLast ? '' : ',');
  }
  return span;
}
