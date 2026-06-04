// diff/structural.js — pure structural diff of two parsed JSON values.
// Produces a flat list of path-level changes for rendering in a single column.

/**
 * @typedef {Object} Change
 * @property {'added'|'removed'|'changed'|'type-changed'} kind
 * @property {string} path - JSONPath-like, e.g. "$.user.name"
 * @property {unknown} [before]
 * @property {unknown} [after]
 */

/**
 * Compute structural diff between two JSON values.
 * Walks both trees in parallel; when types differ at the same path, emits a
 * single type-changed entry (rather than separate add+remove).
 *
 * @param {unknown} a
 * @param {unknown} b
 * @param {string[]} [tokens] - internal: path tokens from root
 * @returns {Change[]}
 */
export function structuralDiff(a, b, tokens = []) {
  const out = [];
  const path = formatPath(tokens);

  if (!sameType(a, b)) {
    out.push({ kind: 'type-changed', path, before: a, after: b });
    return out;
  }

  if (isContainer(a)) {
    const aKeys = a && typeof a === 'object' ? Object.keys(a) : [];
    const bKeys = b && typeof b === 'object' ? Object.keys(b) : [];
    const seen = new Set([...aKeys, ...bKeys]);
    const isArr = Array.isArray(a);
    for (const k of seen) {
      const aHas = Object.prototype.hasOwnProperty.call(a, k);
      const bHas = Object.prototype.hasOwnProperty.call(b, k);
      // Preserve the original key kind in the path: array indices stay as
      // numbers, object keys stay as strings. Object.keys() always returns
      // strings, so we have to convert numeric strings back to numbers when
      // the parent is an array.
      const key = isArr && /^\d+$/.test(k) ? Number(k) : k;
      const childTokens = [...tokens, key];
      if (aHas && !bHas) {
        out.push({ kind: 'removed', path: formatPath(childTokens), before: a[k] });
      } else if (!aHas && bHas) {
        out.push({ kind: 'added', path: formatPath(childTokens), after: b[k] });
      } else {
        out.push(...structuralDiff(a[k], b[k], childTokens));
      }
    }
    return out;
  }

  // Primitive leaf
  if (!Object.is(a, b)) {
    out.push({ kind: 'changed', path, before: a, after: b });
  }
  return out;
}

export function formatPath(tokens) {
  if (!tokens.length) return '$';
  return '$' + tokens.map((t) => (
    typeof t === 'number' ? `[${t}]`
    : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t) ? `.${t}`
    : `[${JSON.stringify(t)}]`
  )).join('');
}

export function summarize(changes) {
  const stats = { added: 0, removed: 0, changed: 0, typeChanged: 0 };
  for (const c of changes) {
    if (c.kind === 'added') stats.added++;
    else if (c.kind === 'removed') stats.removed++;
    else if (c.kind === 'changed') stats.changed++;
    else if (c.kind === 'type-changed') stats.typeChanged++;
  }
  return stats;
}

function sameType(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  return typeof a === typeof b;
}

function isContainer(v) {
  return v !== null && typeof v === 'object';
}
