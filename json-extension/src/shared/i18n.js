// shared/i18n.js — minimal i18n abstraction.
// Centralize all user-facing strings so they can be swapped to another
// locale by registering a new dictionary. Default locale is zh-CN.
//
// Usage:
//   import { t } from '../shared/i18n.js';
//   setStatus(t('status.ready'), '');
//
// Adding a new locale:
//   import { setLocale } from '../shared/i18n.js';
//   setLocale('en-US');
// (Falls back to the key itself if a translation is missing, so the UI
// doesn't go blank during partial translations.)

const LOCALES = {
  'zh-CN': {
    'status.ready': '就绪',
    'status.valid': '✓ 有效',
    'status.invalid': '✗ 无效',
    'status.done': '✓ 完成',
    'status.noRepairNeeded': '✓ 无需修复',
    'status.repairOk': '✓ 修复成功',
    'status.repairFailed': '✗ 修复失败',
    'status.formatFailed': '✗ 格式化失败',
    'status.compactFailed': '✗ 压缩失败',
    'status.stringifyFailed': '✗ Stringify 失败',
    'status.unescapeFailed': '✗ 反转义失败',
    'error.formatHint': '请先修复 JSON 再格式化',
    'error.compactHint': '请先修复 JSON 再压缩',
    'error.repairImpossible': '无法自动修复',
    'error.unescapeHint': '输入不是有效的转义字符串',
    'error.clipboard': '剪贴板访问失败',
    'error.jsonAInvalid': 'JSON A 格式错误',
    'error.jsonBInvalid': 'JSON B 格式错误',
    'diff.needBothSides': '请在两侧都输入 JSON',
    'diff.badge.illegal': '非法',
    'diff.badge.array': 'Array',
    'diff.badge.object': 'Object',
    'string.waitInput': '请先输入 JSON',
    'string.invalid': 'JSON 无效',
    'string.editable': '可编辑',
    'string.loaded': (n) => `已加载 ${n} 项`,
    'string.choosePath': '请选择路径',
    'string.pathInvalid': '路径已失效',
    'string.written': '已写回 JSON',
    'string.editing': '编辑中',
    'string.needReload': '待解析',
    'string.noFields': '没有字符串字段',
    'string.needLoadFirst': '请先加载字段',
    'button.copied': '✓ 已复制',
    'expand.openHint': '在新标签页全屏打开',
  },
  // English stub — falls back to keys for missing entries. Add entries as
  // you translate them; untranslated keys render as the key itself.
  'en-US': {
    'status.ready': 'Ready',
    'status.valid': '✓ Valid',
    'status.invalid': '✗ Invalid',
    'status.done': '✓ Done',
    'button.copied': '✓ Copied',
    'expand.openHint': 'Open in a new tab',
  },
};

let currentLocale = 'zh-CN';

export function setLocale(locale) {
  if (LOCALES[locale]) currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function t(key, ...args) {
  const dict = LOCALES[currentLocale] || {};
  const value = dict[key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(...args) : value;
}
