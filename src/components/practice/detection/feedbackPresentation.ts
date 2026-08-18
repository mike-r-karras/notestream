import type {
  NoteDetectionResult,
  PracticeDetectionResult,
} from './practiceDetectionTypes';

export type MusicalFeedbackKind = 'correct' | 'timing' | 'missed' | 'incorrect';

const FEEDBACK_PRIORITY: Record<MusicalFeedbackKind, number> = {
  correct: 0,
  timing: 1,
  incorrect: 2,
  missed: 3,
};

export function noteFeedbackKind(note: NoteDetectionResult): MusicalFeedbackKind {
  if (!note.detected || note.status === 'missing') return 'missed';
  if (note.status === 'early' || note.status === 'late') return 'timing';
  if (note.status === 'unexpected') return 'incorrect';
  return 'correct';
}

export function mergeFeedbackKind(
  current: MusicalFeedbackKind | undefined,
  incoming: MusicalFeedbackKind
): MusicalFeedbackKind {
  return !current || FEEDBACK_PRIORITY[incoming] > FEEDBACK_PRIORITY[current]
    ? incoming
    : current;
}

export function sourceEventIdFromDetectedNote(id: string): string {
  return id
    .replace(/-pitch-\d+$/, '')
    .replace(/-playback-\d+$/, '');
}

export function notationFeedbackByEvent(
  results: Iterable<PracticeDetectionResult>
): Map<string, MusicalFeedbackKind> {
  const feedback = new Map<string, MusicalFeedbackKind>();
  for (const result of results) {
    if (result.status === 'waiting') continue;
    for (const note of result.expectedNotes) {
      const id = sourceEventIdFromDetectedNote(note.id);
      let kind = noteFeedbackKind(note);
      if (result.unexpectedNotes.length > 0 && kind === 'correct') kind = 'incorrect';
      feedback.set(id, mergeFeedbackKind(feedback.get(id), kind));
    }
  }
  return feedback;
}

export function chordFeedbackByBeat(
  results: Iterable<PracticeDetectionResult>
): Map<string, NoteDetectionResult[]> {
  const feedback = new Map<string, NoteDetectionResult[]>();
  for (const result of results) {
    if (result.status === 'waiting') continue;
    for (const note of result.expectedNotes) {
      const match = /^(.*-beat-\d+)-.*-tone-\d+$/.exec(note.id);
      if (!match) continue;
      const notes = feedback.get(match[1]);
      if (notes) notes.push(note);
      else feedback.set(match[1], [note]);
    }
  }
  return feedback;
}

export function musicalFeedbackMessage(
  result: PracticeDetectionResult,
  noteLabel: (midi: number) => string
): string {
  const messages = result.expectedNotes.flatMap(note => {
    const label = noteLabel(note.midi);
    if (!note.detected || note.status === 'missing') return [`Missing ${label}`];
    if (note.status === 'early' || note.status === 'late') {
      return [`${label} ${note.status}`];
    }
    return [];
  });
  messages.push(...result.unexpectedNotes.map(note => `Unexpected ${noteLabel(note.midi)}`));
  if (messages.length > 0) return messages.join(' · ');
  const labels = result.expectedNotes.map(note => noteLabel(note.midi)).join('+');
  return `${labels || 'Event'} correct`;
}
