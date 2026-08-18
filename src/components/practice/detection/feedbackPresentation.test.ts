import { describe, expect, it } from 'vitest';
import {
  chordFeedbackByBeat,
  musicalFeedbackMessage,
  notationFeedbackByEvent,
} from './feedbackPresentation';
import type { PracticeDetectionResult } from './practiceDetectionTypes';

function result(overrides: Partial<PracticeDetectionResult> = {}): PracticeDetectionResult {
  return {
    eventId: 'measure::event',
    timestamp: 0,
    expectedNotes: [{
      id: 'measure::event-pitch-0',
      midi: 60,
      frequency: 261.6,
      confidence: 1,
      detected: true,
      status: 'correct',
    }],
    unexpectedNotes: [],
    timing: { expectedOnset: 0, toleranceMs: 100 },
    status: 'correct',
    confidence: 1,
    noiseFloor: 0,
    ...overrides,
  };
}

describe('practice feedback presentation', () => {
  it('maps repeat-aware detector pitch IDs back to rendered notation events', () => {
    const feedback = notationFeedbackByEvent([result({
      expectedNotes: [{
        id: 'm3::note-playback-2-pitch-0', midi: 64, frequency: 329.6,
        confidence: 0, detected: false, status: 'missing',
      }],
      status: 'missed',
    })]);
    expect(feedback.get('m3::note')).toBe('missed');
  });

  it('groups chord tones by their stable segment beat identity', () => {
    const note = {
      id: 'verse-m2-beat-3-Am-tone-0', midi: 57, frequency: 220,
      confidence: 1, detected: true, status: 'correct' as const,
    };
    expect(chordFeedbackByBeat([result({ expectedNotes: [note] })]).get('verse-m2-beat-3'))
      .toEqual([note]);
  });

  it('describes missing, mistimed, and unexpected notes musically', () => {
    const message = musicalFeedbackMessage(result({
      expectedNotes: [
        { id: 'a', midi: 60, frequency: 261.6, confidence: 0, detected: false, status: 'missing' },
        { id: 'b', midi: 64, frequency: 329.6, confidence: 1, detected: true, status: 'late' },
      ],
      unexpectedNotes: [
        { id: 'x', midi: 67, frequency: 392, confidence: 1, detected: true, status: 'unexpected' },
      ],
      status: 'incorrect',
    }), midi => `M${midi}`);
    expect(message).toBe('Missing M60 · M64 late · Unexpected M67');
  });
});
