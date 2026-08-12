import type {
  NoteDetectionResult,
  PracticeDetectionResult,
} from './practiceDetectionTypes';

export type PracticePerformanceMetrics = {
  noteAccuracy: number;
  timingPrecision: number;
  overallAccuracy: number;
  expectedNotes: number;
  detectedNotes: number;
  unexpectedNotes: number;
  scoredEvents: number;
};

function mergeNotes(
  previous: NoteDetectionResult[],
  incoming: NoteDetectionResult[]
): NoteDetectionResult[] {
  const merged = new Map(previous.map(note => [note.id, note]));
  incoming.forEach(note => {
    const existing = merged.get(note.id);
    merged.set(note.id, existing ? {
      ...note,
      confidence: Math.max(existing.confidence, note.confidence),
      detected: existing.detected || note.detected,
      detectedOnsetMs: existing.detectedOnsetMs ?? note.detectedOnsetMs,
      status: existing.detected ? existing.status : note.status,
    } : note);
  });
  return [...merged.values()];
}

export function mergePerformanceResults(
  current: Map<string, PracticeDetectionResult>,
  incoming: PracticeDetectionResult[]
): Map<string, PracticeDetectionResult> {
  if (incoming.length === 0) return current;
  const next = new Map(current);
  incoming.forEach(result => {
    const previous = next.get(result.eventId);
    next.set(result.eventId, previous ? {
      ...result,
      expectedNotes: mergeNotes(previous.expectedNotes, result.expectedNotes),
      unexpectedNotes: mergeNotes(previous.unexpectedNotes, result.unexpectedNotes),
      timing: {
        ...result.timing,
        detectedOnset: previous.timing.detectedOnset ?? result.timing.detectedOnset,
        errorMs: previous.timing.errorMs ?? result.timing.errorMs,
      },
    } : result);
  });
  return next;
}

export function scorePracticePerformance(
  results: Iterable<PracticeDetectionResult>
): PracticePerformanceMetrics {
  const finalized = [...results].filter(result => result.status !== 'waiting');
  const expected = finalized.flatMap(result => result.expectedNotes);
  const detected = expected.filter(note => note.detected);
  const unexpectedNotes = finalized.reduce(
    (count, result) => count + result.unexpectedNotes.length,
    0
  );
  const noteAccuracy = expected.length > 0 ? detected.length / expected.length : 0;
  const timingScores = finalized.flatMap(result => result.expectedNotes
    .filter(note => note.detectedOnsetMs !== undefined)
    .map(note => {
      const error = Math.abs(note.detectedOnsetMs! - result.timing.expectedOnset);
      return Math.max(0, 1 - error / Math.max(1, result.timing.toleranceMs * 3));
    }));
  const timingPrecision = timingScores.length > 0
    ? timingScores.reduce((sum, score) => sum + score, 0) / timingScores.length
    : 0;
  const unwantedPrecision = expected.length + unexpectedNotes > 0
    ? expected.length / (expected.length + unexpectedNotes)
    : 0;
  const overallAccuracy = finalized.length > 0
    ? noteAccuracy * 0.55 + timingPrecision * 0.35 +
      noteAccuracy * unwantedPrecision * 0.1
    : 0;

  return {
    noteAccuracy,
    timingPrecision,
    overallAccuracy,
    expectedNotes: expected.length,
    detectedNotes: detected.length,
    unexpectedNotes,
    scoredEvents: finalized.length,
  };
}
