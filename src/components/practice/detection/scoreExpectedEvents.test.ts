import { describe, expect, it } from 'vitest';
import type { NotationPlaybackModel } from '../playbackModel';
import { buildExpectedNoteEvents } from './scoreExpectedEvents';

describe('buildExpectedNoteEvents', () => {
  it('groups chord pitches and preserves tie-collapsed sustained durations', () => {
    const model: NotationPlaybackModel = {
      measures: [{ number: 1, sourceMeasureIndex: 0, startTick: 0, durationTicks: 1920, beats: 4, beatType: 4, beatTicks: 480 }],
      notes: [],
      beats: [],
      tones: [
        { id: 'event-1-pitch-0', midiNote: 60, startTick: 0, durationTicks: 960, staff: 1 },
        { id: 'other-hand-event-pitch-0', midiNote: 64, startTick: 0, durationTicks: 480, staff: 2 },
      ],
      totalTicks: 1920,
    };
    const events = buildExpectedNoteEvents(model, 120);
    expect(events).toHaveLength(1);
    expect(events[0].notes.map(note => note.midi)).toEqual([60, 64]);
    expect(events[0].eventId).toBe('event-1+other-hand-event');
    expect(events[0].notes[0].durationMs).toBe(1000);
  });

  it('excludes hidden staffs while preserving visible simultaneous notes', () => {
    const model: NotationPlaybackModel = {
      measures: [{ number: 1, sourceMeasureIndex: 0, startTick: 0, durationTicks: 1920, beats: 4, beatType: 4, beatTicks: 480 }],
      notes: [],
      beats: [],
      tones: [
        { id: 'right-hand-pitch-0', midiNote: 72, startTick: 0, durationTicks: 480, staff: 1 },
        { id: 'left-hand-pitch-0', midiNote: 48, startTick: 0, durationTicks: 480, staff: 2 },
      ],
      totalTicks: 1920,
    };

    const events = buildExpectedNoteEvents(model, 120, [2]);

    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('left-hand');
    expect(events[0].notes.map(note => note.midi)).toEqual([48]);
  });
});
