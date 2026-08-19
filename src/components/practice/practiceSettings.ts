export type SavedPlaybackMode = 'highlight' | 'metronome' | 'tonal' | 'follow';
export type SavedRepeatMode = 'inline' | 'scrollback';
export type SavedHiddenHand = 'right' | 'left' | null;

export interface SongPracticeSettings {
  bpm: number;
  volume: number;
  playbackMode: SavedPlaybackMode;
  repeatMode: SavedRepeatMode;
  isFeedbackVisible: boolean;
  showMeasureNumbers: boolean;
  hiddenHand: SavedHiddenHand;
}

export const DEFAULT_SONG_PRACTICE_SETTINGS: SongPracticeSettings = {
  bpm: 100,
  volume: 100,
  playbackMode: 'metronome',
  repeatMode: 'scrollback',
  isFeedbackVisible: true,
  showMeasureNumbers: false,
  hiddenHand: null,
};

const PLAYBACK_MODES = new Set<SavedPlaybackMode>([
  'highlight', 'metronome', 'tonal', 'follow',
]);
const REPEAT_MODES = new Set<SavedRepeatMode>(['inline', 'scrollback']);
const HIDDEN_HANDS = new Set<SavedHiddenHand>(['right', 'left', null]);

export function songPracticeSettingsKey(scoreId: number, ownerId: number): string {
  return `notestream_practice_song_settings:${ownerId}:${scoreId}`;
}

export function parseSongPracticeSettings(value: string | null): SongPracticeSettings {
  if (!value) return DEFAULT_SONG_PRACTICE_SETTINGS;

  try {
    const parsed = JSON.parse(value) as Partial<SongPracticeSettings>;
    return {
      bpm: typeof parsed.bpm === 'number' && parsed.bpm >= 50 && parsed.bpm <= 200
        ? parsed.bpm
        : DEFAULT_SONG_PRACTICE_SETTINGS.bpm,
      volume: typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 100
        ? parsed.volume
        : DEFAULT_SONG_PRACTICE_SETTINGS.volume,
      playbackMode: PLAYBACK_MODES.has(parsed.playbackMode as SavedPlaybackMode)
        ? parsed.playbackMode as SavedPlaybackMode
        : DEFAULT_SONG_PRACTICE_SETTINGS.playbackMode,
      repeatMode: REPEAT_MODES.has(parsed.repeatMode as SavedRepeatMode)
        ? parsed.repeatMode as SavedRepeatMode
        : DEFAULT_SONG_PRACTICE_SETTINGS.repeatMode,
      isFeedbackVisible: typeof parsed.isFeedbackVisible === 'boolean'
        ? parsed.isFeedbackVisible
        : DEFAULT_SONG_PRACTICE_SETTINGS.isFeedbackVisible,
      showMeasureNumbers: typeof parsed.showMeasureNumbers === 'boolean'
        ? parsed.showMeasureNumbers
        : DEFAULT_SONG_PRACTICE_SETTINGS.showMeasureNumbers,
      hiddenHand: HIDDEN_HANDS.has(parsed.hiddenHand as SavedHiddenHand)
        ? parsed.hiddenHand as SavedHiddenHand
        : DEFAULT_SONG_PRACTICE_SETTINGS.hiddenHand,
    };
  } catch {
    return DEFAULT_SONG_PRACTICE_SETTINGS;
  }
}
