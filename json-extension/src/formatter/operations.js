// formatter/operations.js — pure transformations on a JSON string.
// Each function returns { ok, value?, error? } so the caller can handle UX.

export function tryFormat(input) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed, null, 2) };
  } catch (e) {
    return { ok: false, error: '请先修复 JSON 再格式化: ' + e.message };
  }
}

export function tryCompact(input) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed) };
  } catch (e) {
    return { ok: false, error: '请先修复 JSON 再压缩: ' + e.message };
  }
}

export function tryRepair(input) {
  // Already valid → no change
  try { JSON.parse(input); return { ok: true, value: input, unchanged: true }; }
  catch (_) { /* fall through */ }
  // jsonRepair is injected via window from lib/jsonrepair.js (UMD)
  if (typeof globalThis.jsonRepair !== 'function') {
    return { ok: false, error: '修复器未加载 (lib/jsonrepair.js 缺失)' };
  }
  let repaired;
  try { repaired = globalThis.jsonRepair(input); }
  catch (e) { return { ok: false, error: '无法自动修复: ' + e.message }; }
  // Validate the repaired output and re-format
  try {
    const parsed = JSON.parse(repaired);
    return { ok: true, value: JSON.stringify(parsed, null, 2) };
  } catch (e) {
    return { ok: false, error: '修复结果仍非合法 JSON: ' + e.message };
  }
}

export function tryEscape(input) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(JSON.stringify(parsed)) };
  } catch (_) {
    // Not JSON: stringify raw text so the user can escape arbitrary strings.
    return { ok: true, value: JSON.stringify(input) };
  }
}

export function tryUnescape(input) {
  let unescaped;
  try { unescaped = JSON.parse(input); }
  catch (e) { return { ok: false, error: '输入不是有效的转义字符串: ' + e.message }; }
  if (typeof unescaped === 'string') return { ok: true, value: unescaped };
  return { ok: true, value: input, note: '已经是 JSON' };
}
