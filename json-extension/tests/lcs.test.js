// tests/lcs.test.js — coverage for diff/lcs.js (pure)

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiff } from '../src/diff/lcs.js';

test('identical input → all equal, no changes', () => {
  const lines = ['a', 'b', 'c'];
  const { leftAnnotated, rightAnnotated, stats } = computeDiff(lines, lines);
  assert.equal(stats.added, 0);
  assert.equal(stats.removed, 0);
  assert.equal(stats.changed, 0);
  assert.equal(leftAnnotated.length, 3);
  assert.equal(rightAnnotated.length, 3);
  for (const item of leftAnnotated) assert.equal(item.type, 'equal');
});

test('empty left, non-empty right → all added', () => {
  const { leftAnnotated, rightAnnotated, stats } = computeDiff([], ['a', 'b']);
  assert.equal(stats.added, 2);
  assert.equal(stats.removed, 0);
  assert.equal(leftAnnotated.filter((x) => x.type === 'empty').length, 2);
  for (const item of rightAnnotated) assert.equal(item.type, 'added');
});

test('non-empty left, empty right → all removed', () => {
  const { leftAnnotated, rightAnnotated, stats } = computeDiff(['a', 'b'], []);
  assert.equal(stats.added, 0);
  assert.equal(stats.removed, 2);
  for (const item of leftAnnotated) assert.equal(item.type, 'removed');
  assert.equal(rightAnnotated.filter((x) => x.type === 'empty').length, 2);
});

test('appended line is "added", not "changed"', () => {
  const left = ['a', 'b'];
  const right = ['a', 'b', 'c'];
  const { stats } = computeDiff(left, right);
  assert.equal(stats.added, 1);
  assert.equal(stats.removed, 0);
  assert.equal(stats.changed, 0);
});

test('adjacent removed then added → counts as "changed"', () => {
  const { leftAnnotated, rightAnnotated, stats } = computeDiff(['x'], ['y']);
  assert.equal(stats.changed, 1);
  assert.equal(stats.added, 0);
  assert.equal(stats.removed, 0);
  // The removed item is now marked changed; its phantom mirror exists internally
  const changedOnLeft = leftAnnotated.filter((x) => x.type === 'changed');
  const changedOnRight = rightAnnotated.filter((x) => x.type === 'changed');
  assert.equal(changedOnLeft.length, 1);
  assert.equal(changedOnRight.length, 1);
});

test('trailing whitespace is ignored for equality (trimEnd)', () => {
  const { stats } = computeDiff(['a  '], ['a']);
  assert.equal(stats.added + stats.removed + stats.changed, 0);
});

test('mixed insert / delete / change: a single replacement is one changed', () => {
  // One line replaced in place. No matter the algorithm tie-break, the
  // minimal diff is exactly 1 changed line.
  const { stats } = computeDiff(['a', 'X', 'b'], ['a', 'Y', 'b']);
  assert.equal(stats.changed, 1);
  assert.equal(stats.added, 0);
  assert.equal(stats.removed, 0);
});

test('insertion in the middle is one added (changed=0)', () => {
  const { stats } = computeDiff(['a', 'b'], ['a', 'INSERTED', 'b']);
  assert.equal(stats.added, 1);
  assert.equal(stats.removed, 0);
  assert.equal(stats.changed, 0);
});

test('deletion in the middle is one removed (changed=0)', () => {
  const { stats } = computeDiff(['a', 'b', 'c'], ['a', 'c']);
  assert.equal(stats.removed, 1);
  assert.equal(stats.added, 0);
  assert.equal(stats.changed, 0);
});

test('perf sanity: 200 lines, runs in well under a second', () => {
  const a = Array.from({ length: 200 }, (_, i) => 'line ' + i);
  const b = a.slice();
  b[50] = 'line 50 MODIFIED';
  b.splice(100, 0, 'inserted');
  const t0 = process.hrtime.bigint();
  const { stats } = computeDiff(a, b);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 200, `expected fast, got ${ms.toFixed(1)}ms`);
  assert.equal(stats.changed, 1);
  assert.equal(stats.added, 1);
  assert.equal(stats.removed, 0);
});
