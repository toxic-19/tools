// tests/i18n.test.js — coverage for shared/i18n.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { t, setLocale, getLocale } from '../src/shared/i18n.js';

test('default locale is zh-CN', () => {
  assert.equal(getLocale(), 'zh-CN');
  // Sanity check: a known key translates under the default locale.
  assert.equal(t('status.ready'), '就绪');
});

test('t() supports function values (interpolation)', () => {
  assert.equal(t('string.loaded', 3), '已加载 3 项');
});

test('t() returns the key itself when translation is missing', () => {
  assert.equal(t('totally.missing.key'), 'totally.missing.key');
});

test('setLocale() switches the active dictionary', () => {
  setLocale('en-US');
  assert.equal(getLocale(), 'en-US');
  assert.equal(t('status.ready'), 'Ready');
  // Missing key falls back to the key name (not zh-CN).
  assert.equal(t('status.noRepairNeeded'), 'status.noRepairNeeded');
  // Reset for other tests.
  setLocale('zh-CN');
  assert.equal(t('status.ready'), '就绪');
});

test('setLocale() ignores unknown locales', () => {
  setLocale('zh-CN');
  setLocale('xx-YY');
  assert.equal(getLocale(), 'zh-CN');
});
