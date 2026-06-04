// tests/structural.test.js — coverage for diff/structural.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralDiff, summarize, formatPath } from '../src/diff/structural.js';

test('identical objects produce no changes', () => {
  const obj = { a: 1, b: [1, 2, 3], c: { d: 'hi' } };
  assert.deepEqual(structuralDiff(obj, obj), []);
});

test('added key at root', () => {
  const c = structuralDiff({ a: 1 }, { a: 1, b: 2 });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'added');
  assert.equal(c[0].path, '$.b');
  assert.equal(c[0].after, 2);
});

test('removed key at root', () => {
  const c = structuralDiff({ a: 1, b: 2 }, { a: 1 });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'removed');
  assert.equal(c[0].path, '$.b');
  assert.equal(c[0].before, 2);
});

test('changed leaf value', () => {
  const c = structuralDiff({ a: 'old' }, { a: 'new' });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'changed');
  assert.equal(c[0].path, '$.a');
  assert.equal(c[0].before, 'old');
  assert.equal(c[0].after, 'new');
});

test('type-changed at a path', () => {
  const c = structuralDiff({ a: 1 }, { a: 'one' });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'type-changed');
  assert.equal(c[0].path, '$.a');
  assert.equal(c[0].before, 1);
  assert.equal(c[0].after, 'one');
});

test('array element added', () => {
  const c = structuralDiff({ list: [1, 2] }, { list: [1, 2, 3] });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'added');
  assert.equal(c[0].path, '$.list[2]');
  assert.equal(c[0].after, 3);
});

test('array element removed', () => {
  const c = structuralDiff({ list: [1, 2, 3] }, { list: [1, 2] });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'removed');
  assert.equal(c[0].path, '$.list[2]');
  assert.equal(c[0].before, 3);
});

test('deeply nested change reports full path', () => {
  const c = structuralDiff(
    { user: { profile: { city: 'Shanghai' } } },
    { user: { profile: { city: 'Beijing' } } }
  );
  assert.equal(c.length, 1);
  assert.equal(c[0].path, '$.user.profile.city');
  assert.equal(c[0].before, 'Shanghai');
  assert.equal(c[0].after, 'Beijing');
});

test('multiple changes at different depths', () => {
  const c = structuralDiff(
    { a: 1, b: { c: 2 } },
    { a: 1, b: { c: 3 }, d: 4 }
  );
  const paths = c.map((x) => x.path).sort();
  assert.deepEqual(paths, ['$.b.c', '$.d']);
});

test('null vs object is type-changed', () => {
  const c = structuralDiff({ a: null }, { a: { x: 1 } });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'type-changed');
  assert.equal(c[0].path, '$.a');
});

test('summarize counts each kind', () => {
  const c = [
    { kind: 'added', path: '$' },
    { kind: 'added', path: '$' },
    { kind: 'removed', path: '$' },
    { kind: 'changed', path: '$' },
    { kind: 'type-changed', path: '$' },
  ];
  const s = summarize(c);
  assert.equal(s.added, 2);
  assert.equal(s.removed, 1);
  assert.equal(s.changed, 1);
  assert.equal(s.typeChanged, 1);
});

test('formatPath: root and nested', () => {
  assert.equal(formatPath([]), '$');
  assert.equal(formatPath(['a', 'b']), '$.a.b');
  assert.equal(formatPath(['a', 0, 'b']), '$.a[0].b');
  assert.equal(formatPath(['a key']), '$["a key"]');
});
