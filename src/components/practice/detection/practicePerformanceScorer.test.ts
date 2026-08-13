import { describe, expect, it } from 'vitest';
import type { PracticeDetectionResult } from './practiceDetectionTypes';
import {
  mergePerformanceResults,
  scorePracticePerformance,
} from './practicePerformanceScorer';

function result(overrides: Partial<PracticeDetectionResult> = {}): PracticeDetectionResult {
  return {
    eventId: 'event-1',
    timestamp: 1000,
    expectedNotes: [{
      id: 'note-1', midi: 60, frequency: 261.63, confidence: 0.9,
      detected: true, detectedOnsetMs: 1010, status: 'correct',
    }],
    unexpectedNotes: [],
    timing: { expectedOnset: 1000, toleranceMs: 60, detectedOnset: 1010, errorMs: 10 },
    status: 'correct',
    confidence: 0.9,
    noiseFloor: 0.01,
    ...overrides,
  };
}

describe('practice performance scoring', () => {
  it('scores correct notes and precise timing at nearly 100%', () => {
    const metrics = scorePracticePerformance([result()]);
    expect(metrics.noteAccuracy).toBe(1);
    expect(metrics.timingPrecision).toBeGreaterThan(0.9);
    expect(metrics.overallAccuracy).toBeGreaterThan(0.95);
  });

  it('penalizes missing pitches, loose timing, and unexpected notes', () => {
    const performance = result({
      expectedNotes: [
        result().expectedNotes[0],
        { id: 'note-2', midi: 64, frequency: 329.63, confidence: 0, detected: false, status: 'missing' },
      ],
      unexpectedNotes: [{
        id: 'wrong-1', midi: 61, frequency: 277.18, confidence: 0.8,
        detected: true, detectedOnsetMs: 1150, status: 'unexpected',
      }],
      timing: { expectedOnset: 1000, toleranceMs: 60, detectedOnset: 1150, errorMs: 150 },
      status: 'partial',
    });
    performance.expectedNotes[0].detectedOnsetMs = 1150;
    const metrics = scorePracticePerformance([performance]);
    expect(metrics.noteAccuracy).toBe(0.5);
    expect(metrics.timingPrecision).toBeLessThan(0.2);
    expect(metrics.overallAccuracy).toBeLessThan(0.5);
    expect(metrics.unexpectedNotes).toBe(1);
  });

  it('scores a completely missed passage at zero', () => {
    const missed = result({
      expectedNotes: [{
        id: 'note-1', midi: 60, frequency: 261.63, confidence: 0,
        detected: false, status: 'missing',
      }],
      timing: { expectedOnset: 1000, toleranceMs: 60 },
      status: 'missed',
    });
    expect(scorePracticePerformance([missed]).overallAccuracy).toBe(0);
  });

  it('retains unexpected-note faults seen in an earlier frame', () => {
    const wrong = result({
      unexpectedNotes: [{
        id: 'wrong-1', midi: 61, frequency: 277.18, confidence: 0.8,
        detected: true, detectedOnsetMs: 1000, status: 'unexpected',
      }],
    });
    const merged = mergePerformanceResults(new Map(), [wrong]);
    const afterRelease = mergePerformanceResults(merged, [result({ timestamp: 1100 })]);
    expect(afterRelease.get('event-1')?.unexpectedNotes).toHaveLength(1);
  });
});
