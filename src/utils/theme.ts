export type FruitTheme = 'apple' | 'orange' | 'lemon' | 'lime' | 'blueberry' | 'grape';
export type ThemePreference = 'system' | 'dark' | 'light' | FruitTheme;
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'notestream_theme';

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'dark' || value === 'light' ||
    value === 'apple' || value === 'orange' || value === 'lemon' ||
    value === 'lime' || value === 'blueberry' || value === 'grape';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  return preference === 'system'
    ? systemPrefersDark ? 'dark' : 'light'
    : preference;
}
