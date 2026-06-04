// tests/json-errors.test.js — coverage for formatter/json-errors.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseErrorLocation, offsetToLineColumn, safeJsonParse } from '../src/formatter/json-errors.js';

test('offsetToLineColumn: empty text → 1:1', () => {
  assert.deepEqual(offsetToLineColumn('', 0), { line: 1, column: 1, position: 0 });
});

test('offsetToLineColumn: first line', () => {
  assert.deepEqual(offsetToLineColumn('abc', 2), { line: 1, column: 3, position: 2 });
});

test('offsetToLineColumn: second line', () => {
  // "a\nbcd" — position 3 is the 'b' on line 2
  assert.deepEqual(offsetToLineColumn('a\nbcd', 3), { line: 2, column: 2, position: 3 });
});

test('offsetToLineColumn: position past end clamps at end', () => {
  assert.deepEqual(offsetToLineColumn('hi', 99), { line: 1, column: 3, position: 99 });
});

test('parseErrorLocation: V8 modern format (position + line/column)', () => {
  const loc = parseErrorLocation('Expected double-quoted property name in JSON at position 7 (line 1 column 8)');
  assert.equal(loc.line, 1);
  assert.equal(loc.column, 8);
  assert.equal(loc.position, 7);
});

test('parseErrorLocation: V8 legacy format (position only)', () => {
  // Older V8 didn't include "(line X column Y)" in the message.
  const loc = parseErrorLocation('Unexpected token } in JSON at position 42');
  assert.equal(loc.position, 42);
  // No line/column embedded — caller must derive.
  assert.equal(loc.line, 1);
  assert.equal(loc.column, 1);
});

test('parseErrorLocation: SpiderMonkey format', () => {
  const loc = parseErrorLocation("JSON.parse: expected property name or '}' at line 3 column 5 of the JSON data");
  assert.equal(loc.line, 3);
  assert.equal(loc.column, 5);
});

test('parseErrorLocation: unknown format returns null', () => {
  assert.equal(parseErrorLocation('something else'), null);
  assert.equal(parseErrorLocation(''), null);
  assert.equal(parseErrorLocation(null), null);
});

test('safeJsonParse: valid JSON', () => {
  const r = safeJsonParse('{"a":1}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1 });
});

test('safeJsonParse: invalid JSON gives V8-style position', () => {
  const r = safeJsonParse('{"a":1,}');
  assert.equal(r.ok, false);
  // V8 reports position of the trailing ','
  assert.equal(r.error.position, 7);
  assert.equal(r.error.line, 1);
  assert.equal(r.error.column, 8);
});

test('safeJsonParse: error on second line — derive line/column from position', () => {
  // V8 reports the trailing comma on line 1 col 12. We derive line/column
  // from the flat position when the browser only gives us a position.
  const text = '{\n  "a": 1,\n}';
  const r = safeJsonParse(text);
  assert.equal(r.ok, false);
  assert.equal(r.error.position, 12);
  assert.equal(r.error.line, 3);
  assert.equal(r.error.column, 1);
});

test('safeJsonParse: no useful position — still returns valid line/column defaults', () => {
  // V8 sometimes reports errors without a position at all (e.g. for very
  // long inputs that get truncated in the error message). We should still
  // return *something* usable rather than throwing.
  const r = safeJsonParse('not json');
  assert.equal(r.ok, false);
  assert.equal(typeof r.error.message, 'string');
  assert.equal(r.error.line, 1);
  assert.equal(r.error.column, 1);
});
