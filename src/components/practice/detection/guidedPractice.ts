import type {
  ExpectedNoteEvent,
  PracticeDetectionResult,
} from './practiceDetectionTypes';

export function expectedEventAtOrAfter(
  events: readonly ExpectedNoteEvent[],
  positionMs: number
): ExpectedNoteEvent | undefined {
  const epsilon = 1e-5;
  return events.find(event => event.onsetMs >= positionMs - epsilon);
}

export function nextExpectedEvent(
  events: readonly ExpectedNoteEvent[],
  currentEventId: string
): ExpectedNoteEvent | undefined {
  const index = events.findIndex(event => event.eventId === currentEventId);
  return index >= 0 ? events[index + 1] : undefined;
}

export function guidedResultIsAccepted(
  result: PracticeDetectionResult,
  currentEventId: string
): boolean {
  return result.eventId === currentEventId && result.status === 'correct';
}
