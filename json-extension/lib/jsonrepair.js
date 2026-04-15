/**
 * JSON Repair - fixes common JSON errors
 * Handles: single quotes, missing quotes, trailing commas, comments, etc.
 */
function jsonRepair(text) {
  let i = 0;
  let output = '';

  function parseValue() {
    skipWhitespace();
    let ch = text[i];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"' || ch === "'") return parseString();
    if (ch === 't' || ch === 'f' || ch === 'n') return parseLiteral();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
    // Handle unquoted strings
    return parseUnquotedString();
  }

  function skipWhitespace() {
    while (i < text.length && /\s/.test(text[i])) i++;
    // Skip comments
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      skipWhitespace();
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      skipWhitespace();
    }
  }

  function parseObject() {
    let result = '{';
    i++; // skip {
    skipWhitespace();
    let first = true;
    while (i < text.length && text[i] !== '}') {
      if (!first) {
        if (text[i] === ',') i++;
        else result += ','; // insert missing comma? no — just proceed
        skipWhitespace();
        if (text[i] === '}') break;
      }
      first = false;
      // key
      skipWhitespace();
      let key;
      if (text[i] === '"' || text[i] === "'") {
        key = parseString();
      } else {
        // unquoted key
        let start = i;
        while (i < text.length && text[i] !== ':' && text[i] !== '}' && text[i] !== '\n') i++;
        key = '"' + text.slice(start, i).trim() + '"';
      }
      result += key;
      skipWhitespace();
      if (text[i] === ':') i++;
      result += ':';
      skipWhitespace();
      result += parseValue();
      skipWhitespace();
      // handle trailing comma
      if (text[i] === ',') {
        let saved = i;
        i++;
        skipWhitespace();
        if (text[i] === '}') {
          i = saved + 1; // consume the comma, pointer now at }
          break;
        }
      }
    }
    if (text[i] === '}') i++;
    return result + '}';
  }

  function parseArray() {
    let result = '[';
    i++; // skip [
    skipWhitespace();
    let first = true;
    while (i < text.length && text[i] !== ']') {
      if (!first) {
        if (text[i] === ',') i++;
        skipWhitespace();
        if (text[i] === ']') break;
      }
      first = false;
      result += parseValue();
      skipWhitespace();
      if (text[i] === ',') {
        let saved = i;
        i++;
        skipWhitespace();
        if (text[i] === ']') {
          i = saved + 1;
          break;
        }
      }
    }
    if (text[i] === ']') i++;
    return result + ']';
  }

  function parseString() {
    let quote = text[i];
    i++; // skip opening quote
    let result = '"';
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') {
        result += text[i];
        i++;
        result += text[i] || '';
        i++;
      } else {
        let ch = text[i];
        if (ch === '"') result += '\\"';
        else result += ch;
        i++;
      }
    }
    if (text[i] === quote) i++;
    return result + '"';
  }

  function parseLiteral() {
    if (text.startsWith('true', i)) { i += 4; return 'true'; }
    if (text.startsWith('false', i)) { i += 5; return 'false'; }
    if (text.startsWith('null', i)) { i += 4; return 'null'; }
    if (text.startsWith('undefined', i)) { i += 9; return 'null'; }
    return 'null';
  }

  function parseNumber() {
    let start = i;
    if (text[i] === '-') i++;
    while (i < text.length && /[\d.eE+\-]/.test(text[i])) i++;
    return text.slice(start, i);
  }

  function parseUnquotedString() {
    let start = i;
    while (i < text.length && !/[,\}\]\n]/.test(text[i])) i++;
    let val = text.slice(start, i).trim();
    if (val === '') return 'null';
    return '"' + val.replace(/"/g, '\\"') + '"';
  }

  try {
    skipWhitespace();
    let result = parseValue();
    return result;
  } catch (e) {
    throw new Error('Unable to repair JSON: ' + e.message);
  }
}
