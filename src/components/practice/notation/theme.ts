import type { CSSProperties } from 'react';
import type { NotationTheme } from './types';

export const DEFAULT_NOTATION_THEME: NotationTheme = {
  foreground: '#e5e5e5',
  staff: '#e5e5e5',
};

export function readNotationTheme(host: HTMLElement): NotationTheme {
  const styles = window.getComputedStyle(host);
  const css = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    foreground: css(
      '--notestream-notation-foreground',
      DEFAULT_NOTATION_THEME.foreground
    ),
    staff: css('--notestream-notation-staff', DEFAULT_NOTATION_THEME.staff),
  };
}

export const notationThemeStyle: CSSProperties = {
  ['--notestream-notation-foreground' as string]:
    DEFAULT_NOTATION_THEME.foreground,
  ['--notestream-notation-staff' as string]:
    DEFAULT_NOTATION_THEME.staff,
};
