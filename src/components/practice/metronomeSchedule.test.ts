import { describe, expect, it } from 'vitest';
import type { NotationPlaybackModel } from './playbackModel';
import { buildMetronomeSchedule, metronomeBeatsInWindow } from './metronomeSchedule';

function model(): NotationPlaybackModel {
  return {
    measures: [
      { number: 1, sourceMeasureIndex: 0, startTick: 0, durationTicks: 1920, beats: 4, beatType: 4, beatTicks: 480 },
      { number: 2, sourceMeasureIndex: 1, startTick: 1920, durationTicks: 720, beats: 3, beatType: 8, beatTicks: 240 },
    ],
    notes: [], tones: [], totalTicks: 2640,
    beats: [
      { tick: 0, measure: 1, beat: 0, accent: true },
      { tick: 480, measure: 1, beat: 1, accent: false },
      { tick: 960, measure: 1, beat: 2, accent: false },
      { tick: 1440, measure: 1, beat: 3, accent: false },
      { tick: 1920, measure: 2, beat: 0, accent: true },
      { tick: 2160, measure: 2, beat: 1, accent: false },
      { tick: 2400, measure: 2, beat: 2, accent: false },
    ],
  };
}

describe('metronome audio schedule', () => {
  it('places 4/4 quarter beats and 3/8 eighth beats exactly at the selected BPM', () => {
    const schedule = buildMetronomeSchedule(model(), 120);
    expect(schedule.map(beat => beat.elapsedMs)).toEqual([
      0, 500, 1000, 1500, 2000, 2500, 3000,
    ]);
    expect(schedule.filter(beat => beat.accent).map(beat => beat.measure)).toEqual([1, 2]);
  });

  it('returns only beats inside the audio lookahead window', () => {
    const schedule = buildMetronomeSchedule(model(), 120);
    expect(metronomeBeatsInWindow(schedule, 900, 2050).map(beat => beat.id)).toEqual([
      '960:1:2', '1440:1:3', '1920:2:0',
    ]);
  });
});
