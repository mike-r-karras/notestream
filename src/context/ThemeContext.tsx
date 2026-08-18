"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from '../utils/theme';

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  resolvedTheme: 'dark',
  setPreference: () => undefined,
});

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(saved) ? saved : 'system';
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === 'undefined') return 'dark';
    const initial = document.documentElement.dataset.theme ?? null;
    return isThemePreference(initial) && initial !== 'system' ? initial : 'dark';
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if ((document.documentElement.dataset.themePreference ?? 'system') === 'system') {
        const resolved = resolveTheme('system', media.matches);
        document.documentElement.dataset.theme = resolved;
        document.documentElement.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
        setResolvedTheme(resolved);
      }
    };
    media.addEventListener('change', handleSystemChange);
    return () => media.removeEventListener('change', handleSystemChange);
  }, []);

  const setPreference = (nextPreference: ThemePreference) => {
    localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    setPreferenceState(nextPreference);
    const resolved = resolveTheme(nextPreference, systemPrefersDark());
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = nextPreference;
    document.documentElement.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
    setResolvedTheme(resolved);
  };

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
