// formatter/json-errors.js — extract line/column from JSON.parse errors.
// JSON.parse's error.message format varies by browser, so we sniff it.

/**
 * Parse a JSON.parse error message and return {line, column, position} if
 * the message embeds them. Two formats in the wild:
 *   - Modern V8 (Chrome ≥ 121, Node ≥ 21):
 *       "Expected double-quoted property name in JSON at position 7 (line 1 column 8)"
 *   - Older V8:
 *       "Unexpected token } in JSON at position 42"
 *   - SpiderMonkey (Firefox):
 *       "JSON.parse: expected property name or '}' at line 3 column 5 of the JSON data"
 *
 * @param {string} message
 * @returns {{line: number, column: number, position: number} | null}
 */
export function parseErrorLocation(message) {
  if (!message) return null;

  // Combined regex: capture "position N" and "(line X column Y)" together
  // (modern V8) or "line X column Y" alone (Firefox / SpiderMonkey).
  const modern = /at position (\d+) \(line (\d+) column (\d+)\)/.exec(message);
  if (modern) {
    return {
      position: Number(modern[1]),
      line: Number(modern[2]),
      column: Number(modern[3]),
    };
  }

  // Firefox / older SpiderMonkey: "at line N column M of the JSON data"
  const spidermonkey = /at line (\d+) column (\d+)/.exec(message);
  if (spidermonkey) {
    return {
      position: -1,
      line: Number(spidermonkey[1]),
      column: Number(spidermonkey[2]),
    };
  }

  // Older V8 (no line/column at all): "at position N"
  const flat = /at position (\d+)/.exec(message);
  if (flat) {
    return { position: Number(flat[1]), line: 1, column: 1 };
  }

  return null;
}

/**
 * Convert a character offset into 1-based {line, column} within `text`.
 */
export function offsetToLineColumn(text, position) {
  if (position < 0) return { line: 1, column: 1, position };
  let line = 1;
  let column = 1;
  const limit = Math.min(position, text.length);
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) { // \n
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column, position };
}

/**
 * Run JSON.parse, returning either {ok, value} or {ok:false, error:{message, line, column, position}}.
 * For older browsers that only report `position`, line/column are derived from the input text.
 */
export function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const message = e && e.message || String(e);
    const loc = parseErrorLocation(message);
    if (loc) {
      if (loc.line === 1 && loc.column === 1 && loc.position >= 0) {
        // Older V8 with only a flat position — derive line/column from text.
        const derived = offsetToLineColumn(text, loc.position);
        return { ok: false, error: { message, ...derived } };
      }
      return { ok: false, error: { message, ...loc } };
    }
    return { ok: false, error: { message, line: 1, column: 1, position: -1 } };
  }
}
