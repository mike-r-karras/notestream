import { describe, expect, it } from 'vitest';

import { isThemePreference, resolveTheme } from './theme';

describe('theme preference', () => {
  it('resolves system preferences', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('keeps explicit choices independent of the system', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('apple', true)).toBe('apple');
    expect(resolveTheme('grape', false)).toBe('grape');
  });

  it('rejects invalid persisted values', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('blueberry')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
  });
});
