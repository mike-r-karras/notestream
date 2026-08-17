import { describe, expect, it } from 'vitest';

import type { EasyScoreDocument, InstrumentConfig } from '../../types/easyScore';
import { buildExpectedNoteEvents } from './detection/scoreExpectedEvents';
import {
  buildChordLyricsPlaybackModel,
  namedPitchToMidi,
} from './chordLyricsPlayback';

const instrument: InstrumentConfig = {
  tuning: ['G4', 'C4', 'E4', 'A4'],
  chords: {},
  chordTones: {
    C: ['G4', 'C4', 'E4', 'G4'],
    G7: ['G4', 'D4', 'F4', 'B4'],
  },
};

function chart(timeSignature: [number, number] = [4, 4]): EasyScoreDocument {
  return {
    metadata: { sheetType: 'chord-lyrics', timeSignature },
    chordLyrics: [{
      id: 'verse',
      label: 'Verse',
      measures: [{
        id: 'm1',
        number: 1,
        beats: timeSignature[0],
        effectiveChord: 'C',
        chords: [
          { id: 'c1', beat: 0, symbol: 'C' },
          { id: 'c2', beat: 2, symbol: 'G7' },
        ],
      }],
    }],
  };
}

describe('chord/lyric playback model', () => {
  it('schedules every configured chord tone in unison on every 4/4 beat', () => {
    const model = buildChordLyricsPlaybackModel(chart(), instrument);

    expect(model.beats.map(beat => beat.tick)).toEqual([0, 480, 960, 1440]);
    expect(model.beats.map(beat => beat.accent)).toEqual([true, false, false, false]);
    expect(model.tones).toHaveLength(16);
    expect(model.tones.filter(tone => tone.startTick === 0).map(tone => tone.midiNote))
      .toEqual([67, 60, 64, 67]);
    expect(model.tones.filter(tone => tone.startTick === 960).map(tone => tone.midiNote))
      .toEqual([67, 62, 65, 71]);
  });

  it('uses eighth-note beats for 3/8 transport and microphone expectations', () => {
    const model = buildChordLyricsPlaybackModel(chart([3, 8]), instrument);
    const expected = buildExpectedNoteEvents(model, 120, [1]);

    expect(model.totalTicks).toBe(720);
    expect(model.beats.map(beat => beat.tick)).toEqual([0, 240, 480]);
    expect(expected.map(event => event.onsetMs)).toEqual([0, 500, 1000]);
    expect(expected.every(event => event.notes.length === 4)).toBe(true);
  });

  it('parses sharp and flat instrument pitches', () => {
    expect(namedPitchToMidi('C#4')).toBe(61);
    expect(namedPitchToMidi('Bb4')).toBe(70);
    expect(namedPitchToMidi('bad')).toBeUndefined();
  });
});
