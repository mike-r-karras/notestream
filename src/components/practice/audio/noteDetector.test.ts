import { describe, expect, it } from 'vitest';
import { midiToFrequency } from './detectionConfig';
import { HarmonicNoteDetector } from './noteDetector';
import { synthesizeSignal } from './testSignals';

function settledAnalysis(detector: HarmonicNoteDetector, frame: Float32Array) {
  let result = detector.analyze(frame);
  for (let index = 0; index < 8; index += 1) result = detector.analyze(frame);
  return result;
}

describe('HarmonicNoteDetector', () => {
  it.each([
    ['single frequency', [60], [60]],
    ['two simultaneous frequencies', [60, 67], [60, 67]],
    ['three-note chord', [60, 64, 67], [60, 64, 67]],
  ])('detects %s', (_label, sounding, expected) => {
    const detector = new HarmonicNoteDetector(48_000);
    detector.setCandidates(expected.map(midi => ({ id: `${midi}`, midi, expected: true })));
    const result = settledAnalysis(detector, synthesizeSignal({
      frequencies: sounding.map(midiToFrequency),
    }));
    expect(result.notes.every(note => note.detected && note.confidence > 0.7)).toBe(true);
  });

  it.each([-18, 18])('tolerates a target shifted %i cents', cents => {
    const detector = new HarmonicNoteDetector(48_000);
    detector.setCandidates([{ id: 'C4', midi: 60, expected: true }]);
    const result = settledAnalysis(detector, synthesizeSignal({
      frequencies: [midiToFrequency(60) * 2 ** (cents / 1200)],
    }));
    expect(result.notes[0].detected).toBe(true);
  });

  it('detects a target mixed with broadband noise and harmonics', () => {
    const detector = new HarmonicNoteDetector(48_000);
    detector.setCandidates([
      { id: 'C4', midi: 60, expected: true },
      { id: 'F#4', midi: 66, expected: false },
    ]);
    const result = settledAnalysis(detector, synthesizeSignal({
      frequencies: [midiToFrequency(60)],
      noiseAmplitude: 0.04,
      harmonics: [{ multiple: 2, amplitude: 0.8 }, { multiple: 3, amplitude: 0.5 }],
    }));
    expect(result.notes.find(note => note.midi === 60)?.detected).toBe(true);
    expect(result.notes.find(note => note.midi === 66)?.detected).toBe(false);
  });

  it('does not report a strong second harmonic as an octave candidate', () => {
    const detector = new HarmonicNoteDetector(48_000);
    detector.setCandidates([
      { id: 'C4', midi: 60, expected: true },
      { id: 'C5', midi: 72, expected: false },
    ]);
    const result = settledAnalysis(detector, synthesizeSignal({
      frequencies: [midiToFrequency(60)],
      amplitude: 0.15,
      harmonics: [{ multiple: 2, amplitude: 1.5 }, { multiple: 3, amplitude: 0.5 }],
    }));
    const lower = result.notes.find(note => note.midi === 60)!;
    const octave = result.notes.find(note => note.midi === 72)!;
    expect(lower.confidence).toBeGreaterThan(octave.confidence);
  });
});
