import {
  DEFAULT_PRACTICE_DETECTION_CONFIG,
  midiToFrequency,
  type PracticeDetectionConfig,
} from '../audio/detectionConfig';
import type { NoteConfidence } from '../audio/noteDetector';
import type {
  ExpectedNoteEvent,
  NoteDetectionResult,
  PracticeDetectionResult,
} from './practiceDetectionTypes';
import { classifyTiming, timingToleranceMs } from './timingEvaluator';

type Evidence = {
  confidence: number;
  detectedOnsetMs?: number;
};

export class ScoreAudioMatcher {
  private readonly config: PracticeDetectionConfig;
  private events: ExpectedNoteEvent[] = [];
  private evidence = new Map<string, Evidence>();

  constructor(config: Partial<PracticeDetectionConfig> = {}) {
    this.config = { ...DEFAULT_PRACTICE_DETECTION_CONFIG, ...config };
  }

  setExpectedEvents(events: ExpectedNoteEvent[]): void {
    this.events = events;
    const validIds = new Set(events.flatMap(event => event.notes.map(note => note.id)));
    this.evidence.forEach((_value, id) => {
      if (!validIds.has(id)) this.evidence.delete(id);
    });
  }

  candidateMidis(positionMs: number): Array<{ id: string; midi: number; expected: boolean }> {
    const beat = this.events.find(event =>
      positionMs <= event.onsetMs + event.durationMs
    )?.beatDurationMs ?? 600;
    const behind = beat * this.config.candidateLookBehindBeats;
    const ahead = beat * this.config.candidateLookAheadBeats;
    const expected = this.events.flatMap(event =>
      event.notes.filter(note =>
        positionMs >= note.onsetMs - ahead &&
        positionMs <= note.onsetMs + note.durationMs + behind
      )
    );
    const byMidi = new Map<number, { id: string; midi: number; expected: boolean }>();
    expected.forEach(note => byMidi.set(note.midi, { id: note.id, midi: note.midi, expected: true }));
    expected.forEach(note => {
      const mistakes = [
        ...(this.config.includeSemitoneMistakes ? [note.midi - 1, note.midi + 1] : []),
        ...(this.config.includeOctaveMistakes ? [note.midi - 12, note.midi + 12] : []),
      ].filter(midi => midi >= 0 && midi <= 127);
      mistakes.forEach(midi => {
        if (!byMidi.has(midi)) byMidi.set(midi, { id: `unexpected-${midi}`, midi, expected: false });
      });
    });
    return [...byMidi.values()];
  }

  update(
    positionMs: number,
    timestamp: number,
    notes: NoteConfidence[],
    noiseFloor: number
  ): PracticeDetectionResult[] {
    const byMidi = new Map(notes.map(note => [note.midi, note]));
    for (const event of this.events) {
      const tolerance = timingToleranceMs(event.beatDurationMs, this.config);
      const candidateLead = event.beatDurationMs * this.config.candidateLookAheadBeats;
      if (positionMs < event.onsetMs - candidateLead ||
        positionMs > event.onsetMs + event.durationMs + tolerance) continue;
      for (const expected of event.notes) {
        const observed = byMidi.get(expected.midi);
        const evidence = this.evidence.get(expected.id) ?? { confidence: 0 };
        if (observed) {
          evidence.confidence = Math.max(evidence.confidence, observed.confidence);
          if (observed.onset && evidence.detectedOnsetMs === undefined) {
            evidence.detectedOnsetMs = positionMs;
          }
          this.evidence.set(expected.id, evidence);
        }
      }
    }

    return this.events.flatMap(event => {
      const tolerance = timingToleranceMs(event.beatDurationMs, this.config);
      const opens = event.onsetMs - tolerance;
      const closes = event.onsetMs + tolerance + this.config.chordCollectionMs;
      if (positionMs < opens || positionMs > event.onsetMs + event.durationMs + tolerance) return [];
      const expectedNotes: NoteDetectionResult[] = event.notes.map(note => {
        const evidence = this.evidence.get(note.id) ?? { confidence: 0 };
        const detected = evidence.detectedOnsetMs !== undefined;
        const timing = detected
          ? classifyTiming(evidence.detectedOnsetMs! - event.onsetMs, tolerance)
          : 'missing';
        return {
          id: note.id,
          midi: note.midi,
          frequency: note.frequency,
          confidence: evidence.confidence,
          detected,
          detectedOnsetMs: evidence.detectedOnsetMs,
          status: timing,
        };
      });
      const expectedMidis = new Set(event.notes.map(note => note.midi));
      const unexpectedNotes: NoteDetectionResult[] = notes
        .filter(note => !note.expected && note.detected && !expectedMidis.has(note.midi))
        .map(note => ({
          id: note.id,
          midi: note.midi,
          frequency: midiToFrequency(note.midi),
          confidence: note.confidence,
          detected: true,
          detectedOnsetMs: positionMs,
          status: 'unexpected',
        }));
      const detected = expectedNotes.filter(note => note.detected);
      const complete = detected.length === expectedNotes.length;
      const expired = positionMs > closes;
      const timingStatuses = new Set(detected.map(note => note.status));
      let status: PracticeDetectionResult['status'] = 'waiting';
      if (complete) {
        status = timingStatuses.has('early') ? 'early' :
          timingStatuses.has('late') ? 'late' : 'correct';
      } else if (detected.length > 0) status = expired ? 'partial' : 'waiting';
      else if (unexpectedNotes.length > 0) status = 'incorrect';
      else if (expired) status = 'missed';
      const detectedOnset = detected
        .map(note => note.detectedOnsetMs!)
        .sort((a, b) => a - b)[0];
      return [{
        eventId: event.eventId,
        timestamp,
        expectedNotes,
        unexpectedNotes,
        timing: {
          expectedOnset: event.onsetMs,
          detectedOnset,
          errorMs: detectedOnset === undefined ? undefined : detectedOnset - event.onsetMs,
        },
        status,
        confidence: expectedNotes.length > 0
          ? expectedNotes.reduce((sum, note) => sum + note.confidence, 0) / expectedNotes.length
          : 0,
        noiseFloor,
      }];
    });
  }
}
