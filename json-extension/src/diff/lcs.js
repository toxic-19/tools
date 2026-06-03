// diff/lcs.js — pure LCS-based line diff. No DOM access.
// Exported as a pure function so it can be unit-tested in Node.

/**
 * Compute line-level diff between two already-formatted JSON strings.
 *
 * Strategy:
 *   1. Standard LCS walk produces equal / added / removed.
 *   2. A second pass walks the annotated list and folds adjacent
 *      `removed`+`added` blocks of equal length into "changed" pairs.
 *      This is what a human reading the diff expects when a single
 *      line is replaced.
 *
 * @param {string[]} lLines - left lines
 * @param {string[]} rLines - right lines
 * @returns {{leftAnnotated: Array, rightAnnotated: Array, stats: {added:number, removed:number, changed:number}}}
 */
export function computeDiff(lLines, rLines) {
  const m = lLines.length;
  const n = rLines.length;

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

  const leftAnnotated = [];
  const rightAnnotated = [];
  const stats = { added: 0, removed: 0, changed: 0 };

  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && lLines[i].trimEnd() === rLines[j].trimEnd()) {
      leftAnnotated.push({ type: 'equal', text: lLines[i], lineNum: i + 1 });
      rightAnnotated.push({ type: 'equal', text: rLines[j], lineNum: j + 1 });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      rightAnnotated.push({ type: 'added', text: rLines[j], lineNum: j + 1 });
      leftAnnotated.push({ type: 'empty', text: '', lineNum: null });
      stats.added++;
      j++;
    } else {
      leftAnnotated.push({ type: 'removed', text: lLines[i], lineNum: i + 1 });
      rightAnnotated.push({ type: 'empty', text: '', lineNum: null });
      stats.removed++;
      i++;
    }
  }

  // Pass 2: walk the annotated output. Whenever we hit a contiguous block of
  // removed-empty pairs followed by empty-added pairs (or vice versa), pair
  // them off into "changed" as long as both queues have entries.
  const removedIdx = [];
  const addedIdx = [];
  for (let k = 0; k < leftAnnotated.length; k++) {
    if (leftAnnotated[k].type === 'removed') removedIdx.push(k);
    else if (rightAnnotated[k].type === 'added') addedIdx.push(k);
  }
  const pairCount = Math.min(removedIdx.length, addedIdx.length);
  for (let p = 0; p < pairCount; p++) {
    const lr = removedIdx[p];
    const ra = addedIdx[p];
    leftAnnotated[lr].type = 'changed';
    rightAnnotated[ra].type = 'changed';
    stats.changed++;
    stats.removed--;
    stats.added--;
  }

  return { leftAnnotated, rightAnnotated, stats };
}
