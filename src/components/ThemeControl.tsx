"use client";

import { useTheme } from '../context/ThemeContext';
import type { ThemePreference } from '../utils/theme';

const choices: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'apple', label: 'Apple' },
  { value: 'orange', label: 'Orange' },
  { value: 'lemon', label: 'Lemon' },
  { value: 'lime', label: 'Lime' },
  { value: 'blueberry', label: 'Blueberry' },
  { value: 'grape', label: 'Grape' },
];

export default function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500">
      <span className="sr-only">Theme</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42" />
        <circle cx="12" cy="12" r="4" />
      </svg>
      <select
        value={preference}
        onChange={event => setPreference(event.target.value as ThemePreference)}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs font-semibold text-neutral-300 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        aria-label="Color theme"
      >
        {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </label>
  );
}
