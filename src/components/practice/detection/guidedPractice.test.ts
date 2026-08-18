import { describe, expect, it } from 'vitest';
import type { ExpectedNoteEvent } from './practiceDetectionTypes';
import {
  expectedEventAtOrAfter,
  guidedResultIsAccepted,
  nextExpectedEvent,
} from './guidedPractice';

const events = [0, 500, 1500].map((onsetMs, index): ExpectedNoteEvent => ({
  eventId: `event-${index}`,
  onsetMs,
  durationMs: 250,
  beatDurationMs: 500,
  notes: [],
}));

describe('guided practice cursor', () => {
  it('starts at the current event and does not skip an exact onset', () => {
    expect(expectedEventAtOrAfter(events, 500)?.eventId).toBe('event-1');
  });

  it('moves to the next playable onset across any intervening rest', () => {
    expect(nextExpectedEvent(events, 'event-1')).toMatchObject({
      eventId: 'event-2',
      onsetMs: 1500,
    });
  });

  it('reports completion after the final playable event', () => {
    expect(nextExpectedEvent(events, 'event-2')).toBeUndefined();
  });

  it('advances only for a fully correct result at the current event', () => {
    const base = {
      eventId: 'event-1', timestamp: 0, expectedNotes: [], unexpectedNotes: [],
      timing: { expectedOnset: 500, toleranceMs: 100 }, confidence: 1, noiseFloor: 0,
    };
    expect(guidedResultIsAccepted({ ...base, status: 'correct' }, 'event-1')).toBe(true);
    expect(guidedResultIsAccepted({ ...base, status: 'partial' }, 'event-1')).toBe(false);
    expect(guidedResultIsAccepted({ ...base, eventId: 'event-0', status: 'correct' }, 'event-1')).toBe(false);
  });
});
