// tests/paths.test.js — coverage for string-edit/paths.js (pure)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPathLabel,
  collectStringEntries,
  getByTokens,
  setByTokens,
} from '../src/string-edit/paths.js';

test('formatPathLabel: empty tokens returns $', () => {
  assert.equal(formatPathLabel([]), '$');
});

test('formatPathLabel: identifier vs bracket forms', () => {
  assert.equal(formatPathLabel(['user', 'name']), '$.user.name');
  assert.equal(formatPathLabel(['a', 'b c']), '$.a["b c"]');
  assert.equal(formatPathLabel(['list', 0, 'inner']), '$.list[0].inner');
});

test('collectStringEntries: finds nested strings', () => {
  const obj = {
    title: 'hi',
    nested: { k: 'v', deeper: { x: 'y' } },
    arr: ['a', { b: 'c' }],
  };
  const entries = collectStringEntries(obj);
  const labels = entries.map((e) => e.label).sort();
  assert.deepEqual(labels, [
    '$.arr[0]', '$.arr[1].b', '$.nested.deeper.x', '$.nested.k', '$.title',
  ].sort());
  // IDs are stable JSON
  assert.equal(entries[0].id, JSON.stringify(['title']));
});

test('collectStringEntries: returns [] for non-string root', () => {
  assert.deepEqual(collectStringEntries(123), []);
  assert.deepEqual(collectStringEntries(null), []);
  assert.deepEqual(collectStringEntries([1, 2, 3]), []);
});

test('getByTokens: walks object/array', () => {
  const root = { a: { b: [{ c: 'found' }] } };
  assert.equal(getByTokens(root, ['a', 'b', 0, 'c']), 'found');
  assert.equal(getByTokens(root, ['a', 'b', 99, 'c']), undefined);
  assert.equal(getByTokens(root, ['missing']), undefined);
});

test('setByTokens: mutates leaf', () => {
  const root = { a: { b: 'old' } };
  const ok = setByTokens(root, ['a', 'b'], 'new');
  assert.equal(ok, true);
  assert.equal(root.a.b, 'new');
});

test('setByTokens: empty tokens is a no-op', () => {
  const root = { a: 1 };
  setByTokens(root, [], 'x');
  assert.deepEqual(root, { a: 1 });
});

test('setByTokens: array index path', () => {
  const root = { list: ['a', 'b', 'c'] };
  setByTokens(root, ['list', 1], 'B');
  assert.deepEqual(root.list, ['a', 'B', 'c']);
});
