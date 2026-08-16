import { describe, expect, it } from 'vitest';

import type { EasyScoreDocument } from '../../types/easyScore';
import {
  activeChordBeatIndex,
  beatPositionToNumber,
  beatPositionX,
  beatPositionXFromWidths,
  buildChordLyricsTimeline,
  chordLyricsBeatLayout,
  chordLyricsBeatWidths,
  preferredChordLyricsMeasureWidth,
} from './chordLyricsModel';

const chart: EasyScoreDocument = {
  schemaVersion: 'chord-chart-1.0',
  sourceFormat: 'pdf-chord-chart',
  metadata: {
    title: 'Stand By Me',
    sheetType: 'chord-lyrics',
    timeSignature: [4, 4],
  },
  sections: [{
    id: 'intro',
    label: 'Intro',
    measures: [{
      id: 'm8',
      number: 8,
      beats: 4,
      effectiveChord: 'A',
      chords: [],
      lyricCues: [{
        id: 'm8-l1',
        beat: { numerator: 3, denominator: 1 },
        text: 'When the',
        role: 'pickup',
        sourceRef: { page: 1, wordIds: ['p1-w72', 'p1-w73'] },
      }],
    }, {
      id: 'm9',
      number: 9,
      beats: 4,
      effectiveChord: 'A',
      chords: [{
        id: 'm9-c1',
        beat: { numerator: 0, denominator: 1 },
        symbol: 'A',
        printed: true,
      }],
      lyricCues: [{
        id: 'm9-l1',
        beat: { numerator: 0, denominator: 1 },
        text: 'night',
      }, {
        id: 'm9-l2',
        beat: { numerator: 3, denominator: 1 },
        text: 'has',
      }],
    }],
  }],
};

describe('chord lyrics timeline', () => {
  it('preserves exact pickup and lyric cue beat positions', () => {
    const segments = buildChordLyricsTimeline(chart);
    const pickup = segments[0].events.find(event => event.id === 'm8-l1');
    const night = segments[1].events.find(event => event.id === 'm9-l1');
    const has = segments[1].events.find(event => event.id === 'm9-l2');

    expect(segments[0]).toMatchObject({ startTick: 0, durationTicks: 1920 });
    expect(pickup).toMatchObject({ startTick: 1440, beat: 3 });
    expect(night).toMatchObject({ startTick: 1920, beat: 0 });
    expect(has).toMatchObject({ startTick: 3360, beat: 3 });
    expect(pickup?.sourceIds).toEqual(['p1-w72', 'p1-w73']);
  });

  it('derives visual and active beat positions without four-measure indexing', () => {
    const [segment] = buildChordLyricsTimeline(chart);

    expect(beatPositionToNumber({ numerator: 3, denominator: 2 })).toBe(1.5);
    expect(beatPositionX({ numerator: 3, denominator: 1 }, 270, 4)).toBe(236.25);
    expect(activeChordBeatIndex(1439, segment, 4)).toBe(2);
    expect(activeChordBeatIndex(1440, segment, 4)).toBe(3);
    expect(activeChordBeatIndex(1920, segment, 4)).toBeNull();
  });

  it('uses the time-signature denominator for 3/8 beat timing', () => {
    const threeEight: EasyScoreDocument = {
      metadata: { sheetType: 'chord-lyrics', timeSignature: [3, 8] },
      sections: [{
        id: 'verse',
        label: 'Verse',
        measures: [{
          id: 'm1',
          number: 1,
          beats: 3,
          chords: [{ id: 'c1', beat: 0, symbol: 'C' }],
          lyricCues: [{ id: 'l1', beat: { numerator: 1, denominator: 2 }, text: 'and' }],
        }],
      }],
    };

    const [segment] = buildChordLyricsTimeline(threeEight);
    expect(segment.durationTicks).toBe(720);
    expect(segment.events.find(event => event.id === 'l1')?.startTick).toBe(120);
  });

  it('continues to adapt legacy whole-measure lyrics', () => {
    const legacy: EasyScoreDocument = {
      metadata: { sheetType: 'chord-lyrics', timeSignature: [4, 4] },
      sections: [{
        id: 'verse',
        label: 'Verse',
        measures: [{
          id: 'legacy-m1',
          number: 1,
          beats: 4,
          chords: [{ id: 'legacy-c1', beat: 0, symbol: 'A', durationBeats: 4 }],
          lyrics: [{ text: 'legacy lyric' }],
        }],
      }],
    };

    const payload = buildChordLyricsTimeline(legacy)[0].payload as {
      lyricCues: Array<{ beat: number; text: string }>;
    };
    expect(payload.lyricCues).toEqual([
      expect.objectContaining({ beat: 0, text: 'legacy lyric' }),
    ]);
  });

  it('expands individual measures for long lyrics', () => {
    const compact = preferredChordLyricsMeasureWidth({
      beats: 4,
      lyrics: [{ beat: 0, text: 'night' }],
    });
    const expanded = preferredChordLyricsMeasureWidth({
      beats: 4,
      lyrics: [{ beat: 0, text: 'When the night has come and the land is dark' }],
    });

    expect(compact).toBe(270);
    expect(expanded).toBeGreaterThan(compact);
  });

  it('expands measures when chord changes are close together', () => {
    const width = preferredChordLyricsMeasureWidth({
      beats: 4,
      chords: [
        { id: 'c1', beat: 1, symbol: 'F#m7(add11)' },
        { id: 'c2', beat: 1.25, symbol: 'C#7sus4/G#' },
      ],
    });

    expect(width).toBeGreaterThan(270);
  });

  it('widens only crowded chord beats and leaves the final beat normal', () => {
    const widths = chordLyricsBeatWidths({
      beats: 4,
      chords: [
        { id: 'c1', beat: 0, symbol: 'C' },
        { id: 'c2', beat: 1, symbol: 'C' },
        { id: 'c3', beat: 2, symbol: 'G' },
      ],
    });

    expect(widths).toEqual([86, 86, 86, 67.5]);
    expect(beatPositionXFromWidths(3, widths) - beatPositionXFromWidths(2, widths)).toBe(76.75);
  });

  it('keeps normal spacing around lyrics without inflating their onset beats', () => {
    const layout = chordLyricsBeatLayout({
      beats: 4,
      lyricCues: [
        { id: 'l1', beat: 0, text: 'rest-less' },
        { id: 'l2', beat: 2, text: 'spirit' },
        { id: 'l3', beat: 3, text: 'on an end-less flight' },
      ],
    });

    expect(layout.beatPositions).toEqual([33.75, 101.25, 168.75, 281.25]);
    expect(layout.beatPositions[2] - (layout.beatPositions[0] + 67.5)).toBe(67.5);
    expect(layout.beatPositions[3] - (layout.beatPositions[2] + 45)).toBe(67.5);
    expect(layout.width).toBe(472.5);
    const nextMeasureFirstBeat = layout.width + 33.75;
    const finalLyricEnd = layout.beatPositions[3] + 157.5;
    expect(nextMeasureFirstBeat - finalLyricEnd).toBe(67.5);
  });
});
