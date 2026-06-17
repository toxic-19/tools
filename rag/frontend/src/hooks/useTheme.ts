import { useState, useCallback, useEffect } from 'react';

export type Theme = 'blue' | 'amber' | 'emerald' | 'rose' | 'dark';
export type Layout = 'sidebar' | 'centered' | 'fullscreen';
export type Style = 'default' | 'glass' | 'minimal';

const STORAGE_KEYS = {
  theme: 'rag-theme',
  layout: 'rag-layout',
  style: 'rag-style',
} as const;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    return (saved as Theme) || 'blue';
  });

  const [layout, setLayoutState] = useState<Layout>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.layout);
    return (saved as Layout) || 'sidebar';
  });

  const [style, setStyleState] = useState<Style>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.style);
    return (saved as Style) || 'default';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-style', style);
  }, [style]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEYS.theme, newTheme);
  }, []);

  const setLayout = useCallback((newLayout: Layout) => {
    setLayoutState(newLayout);
    localStorage.setItem(STORAGE_KEYS.layout, newLayout);
  }, []);

  const setStyle = useCallback((newStyle: Style) => {
    setStyleState(newStyle);
    localStorage.setItem(STORAGE_KEYS.style, newStyle);
  }, []);

  return { theme, layout, style, setTheme, setLayout, setStyle };
}
