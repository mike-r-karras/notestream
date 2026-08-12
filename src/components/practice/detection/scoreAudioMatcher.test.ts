import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../audio/detectionConfig';
import type { NoteConfidence } from '../audio/noteDetector';
import type { ExpectedNoteEvent } from './practiceDetectionTypes';
import { ScoreAudioMatcher } from './scoreAudioMatcher';

function event(
  id: string,
  midis: number[],
  onsetMs = 1000,
  durationMs = 500
): ExpectedNoteEvent {
  return {
    eventId: id,
    onsetMs,
    durationMs,
    beatDurationMs: 500,
    notes: midis.map((midi, index) => ({
      id: `${id}-pitch-${index}`,
      midi,
      frequency: midiToFrequency(midi),
      onsetMs,
      durationMs,
    })),
  };
}

function observed(midi: number, onset = true, expected = true): NoteConfidence {
  return {
    id: `${expected ? 'expected' : 'unexpected'}-${midi}`,
    midi,
    expected,
    frequency: midiToFrequency(midi),
    confidence: 0.92,
    rawScore: 1,
    detected: true,
    onset,
  };
}

describe('ScoreAudioMatcher', () => {
  it('reports one expected note correctly and reports an absent note missed', () => {
    const matcher = new ScoreAudioMatcher();
    matcher.setExpectedEvents([event('one', [60])]);
    matcher.update(1000, 10, [observed(60)], 0.01);
    expect(matcher.update(1130, 20, [observed(60, false)], 0.01)[0].status).toBe('correct');

    const absent = new ScoreAudioMatcher();
    absent.setExpectedEvents([event('absent', [62])]);
    expect(absent.update(1200, 20, [], 0.01)[0].status).toBe('missed');
  });

  it('matches an interval and a complete three-note chord', () => {
    for (const midis of [[60, 67], [60, 64, 67]]) {
      const matcher = new ScoreAudioMatcher();
      matcher.setExpectedEvents([event('chord', midis)]);
      matcher.update(1000, 10, midis.map(midi => observed(midi)), 0.01);
      expect(matcher.update(1130, 20, [], 0.01)[0]).toMatchObject({
        status: 'correct',
        confidence: 0.92,
      });
    }
  });

  it('reports one missing note from a chord as partial', () => {
    const matcher = new ScoreAudioMatcher();
    matcher.setExpectedEvents([event('chord', [60, 64, 67])]);
    matcher.update(1000, 10, [observed(60), observed(67)], 0.01);
    const result = matcher.update(1200, 20, [], 0.01)[0];
    expect(result.status).toBe('partial');
    expect(result.expectedNotes.find(note => note.midi === 64)?.status).toBe('missing');
  });

  it.each([
    ['early', 875, 'early'],
    ['acceptable', 1040, 'correct'],
    ['late', 1080, 'late'],
  ] as const)('classifies %s timing and retains raw error', (_label, at, status) => {
    const matcher = new ScoreAudioMatcher();
    matcher.setExpectedEvents([event('timed', [60])]);
    matcher.update(at, 10, [observed(60)], 0.01);
    const result = matcher.update(1200, 20, [], 0.01)[0];
    expect(result.status).toBe(status);
    expect(result.timing.errorMs).toBe(at - 1000);
  });

  it('reports a semitone wrong-note candidate', () => {
    const matcher = new ScoreAudioMatcher();
    matcher.setExpectedEvents([event('wrong', [60])]);
    expect(matcher.candidateMidis(1000).map(note => note.midi)).toContain(61);
    const result = matcher.update(1000, 10, [observed(61, true, false)], 0.01)[0];
    expect(result.status).toBe('incorrect');
    expect(result.unexpectedNotes[0].midi).toBe(61);
  });

  it('keeps repeated notes as independent events', () => {
    const matcher = new ScoreAudioMatcher();
    matcher.setExpectedEvents([event('first', [60], 500), event('second', [60], 1000)]);
    matcher.update(500, 1, [observed(60)], 0.01);
    matcher.update(1000, 2, [observed(60)], 0.01);
    const results = matcher.update(1200, 3, [], 0.01);
    expect(results.find(result => result.eventId === 'second')?.status).toBe('correct');
  });

  it('continues accepting evidence during a sustained note', () => {
    const matcher = new ScoreAudioMatcher();
    matcher.setExpectedEvents([event('sustain', [60], 1000, 1500)]);
    matcher.update(1300, 1, [observed(60)], 0.01);
    expect(matcher.update(1400, 2, [], 0.01)[0].expectedNotes[0].detected).toBe(true);
  });
});
