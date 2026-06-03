// string-edit/paths.js — pure functions for walking JSON by path tokens.
// Exported so they can be unit-tested without DOM.

export function formatPathLabel(tokens) {
  if (!tokens.length) return '$';
  return '$' + tokens.map((token) => (
    typeof token === 'number'
      ? `[${token}]`
      : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token)
        ? `.${token}`
        : `[${JSON.stringify(token)}]`
  )).join('');
}

export function collectStringEntries(node, tokens = []) {
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

export function getByTokens(root, tokens) {
  return tokens.reduce((acc, token) => (acc == null ? undefined : acc[token]), root);
}

export function setByTokens(root, tokens, value) {
  if (!tokens.length) return false;
  let target = root;
  for (let i = 0; i < tokens.length - 1; i++) target = target[tokens[i]];
  target[tokens[tokens.length - 1]] = value;
  return true;
}
