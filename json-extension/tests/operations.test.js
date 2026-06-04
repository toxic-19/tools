// tests/operations.test.js — coverage for formatter/operations.js (pure).
// jsonRepair is a global injected by the UMD bundle; we shim it here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { tryFormat, tryCompact, tryStringify, tryUnescape, tryRepair } from '../src/formatter/operations.js';

// Minimal jsonRepair shim that fixes single quotes → double quotes.
// Good enough to exercise the tryRepair branch and the post-repair reformat.
globalThis.jsonRepair = function (s) {
  // A real implementation lives in lib/jsonrepair.js; this is just for unit tests.
  return s.replace(/'/g, '"');
};

test('tryFormat: pretty-prints with 2-space indent', () => {
  const r = tryFormat('{"a":1,"b":2}');
  assert.equal(r.ok, true);
  assert.equal(r.value, '{\n  "a": 1,\n  "b": 2\n}');
});

test('tryFormat: invalid input returns error, not throw', () => {
  const r = tryFormat('not json');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});

test('tryCompact: removes whitespace', () => {
  const r = tryCompact('{\n  "a":  1,\n  "b": 2\n}');
  assert.equal(r.ok, true);
  assert.equal(r.value, '{"a":1,"b":2}');
});

test('tryStringify: valid JSON → double-stringified (embeddable as a string value)', () => {
  const r = tryStringify('{"a":1}');
  assert.equal(r.ok, true);
  // Round-tripping JSON.parse once yields the inner string '{"a":1}'.
  assert.deepEqual(JSON.parse(r.value), '{"a":1}');
  // And the outer value is itself a string with escaped quotes.
  assert.equal(typeof JSON.parse(r.value), 'string');
});

test('tryStringify: non-JSON returns error (does not silently coerce)', () => {
  const r = tryStringify('hello "world"');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON/);
});

test('tryStringify output is distinct from tryCompact output', () => {
  const input = '{\n  "a": 1\n}';
  const compact = tryCompact(input);
  const stringified = tryStringify(input);
  assert.equal(compact.value, '{"a":1}');
  // Stringify wraps in outer quotes and escapes — must be different.
  assert.notEqual(compact.value, stringified.value);
  assert.equal(stringified.value, '"{\\\"a\\\":1}"');
});

test('tryUnescape: JSON string → unescaped', () => {
  const r = tryUnescape('"line1\\nline2"');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'line1\nline2');
});

test('tryUnescape: object input is a no-op (returns input)', () => {
  const r = tryUnescape('{"a":1}');
  assert.equal(r.ok, true);
  assert.equal(r.value, '{"a":1}');
});

test('tryUnescape: invalid input returns error', () => {
  const r = tryUnescape('"unterminated');
  assert.equal(r.ok, false);
  assert.match(r.error, /转义/);
});

test('tryRepair: already-valid input is reported unchanged', () => {
  const r = tryRepair('{"a":1}');
  assert.equal(r.ok, true);
  assert.equal(r.unchanged, true);
  assert.equal(r.value, '{"a":1}');
});

test('tryRepair: single quotes get fixed and re-formatted', () => {
  const r = tryRepair("{'a':1,'b':2}");
  assert.equal(r.ok, true);
  assert.equal(r.unchanged, undefined);
  // reparsed and re-formatted with 2-space indent
  assert.equal(r.value, '{\n  "a": 1,\n  "b": 2\n}');
});
