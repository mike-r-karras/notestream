import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SONG_PRACTICE_SETTINGS,
  parseSongPracticeSettings,
  songPracticeSettingsKey,
} from './practiceSettings';

describe('per-song practice settings', () => {
  it('uses a score and owner scoped storage key', () => {
    expect(songPracticeSettingsKey(12, 7)).toBe('notestream_practice_song_settings:7:12');
  });

  it('restores valid saved preferences', () => {
    expect(parseSongPracticeSettings(JSON.stringify({
      bpm: 132,
      volume: 42,
      playbackMode: 'tonal',
      repeatMode: 'inline',
      isFeedbackVisible: false,
      showMeasureNumbers: true,
      hiddenHand: 'left',
    }))).toEqual({
      bpm: 132,
      volume: 42,
      playbackMode: 'tonal',
      repeatMode: 'inline',
      isFeedbackVisible: false,
      showMeasureNumbers: true,
      hiddenHand: 'left',
    });
  });

  it('falls back safely for corrupt or out-of-range values', () => {
    expect(parseSongPracticeSettings('{nope')).toEqual(DEFAULT_SONG_PRACTICE_SETTINGS);
    expect(parseSongPracticeSettings(JSON.stringify({
      bpm: 999,
      volume: -1,
      playbackMode: 'invalid',
      hiddenHand: 'both',
    }))).toEqual(DEFAULT_SONG_PRACTICE_SETTINGS);
  });
});
