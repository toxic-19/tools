// shared/theme.js — light/dark theme toggle persisted to localStorage.

import { els } from './dom.js';

const THEME_KEY = 'json-toolkit-theme';
const DEFAULT_THEME = 'light';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = els.btnTheme();
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* ignore */ }
}

export function initTheme() {
  let saved = DEFAULT_THEME;
  try { saved = localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch (_) { /* ignore */ }
  applyTheme(saved);
  const btn = els.btnTheme();
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
}
