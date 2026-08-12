export type NoteDetectionStatus = 'correct' | 'missing' | 'unexpected' | 'early' | 'late';

export type ExpectedNote = {
  id: string;
  midi: number;
  frequency: number;
  onsetMs: number;
  durationMs: number;
};

export type ExpectedNoteEvent = {
  eventId: string;
  onsetMs: number;
  durationMs: number;
  beatDurationMs: number;
  notes: ExpectedNote[];
};

export type NoteDetectionResult = {
  id: string;
  midi: number;
  frequency: number;
  confidence: number;
  detected: boolean;
  detectedOnsetMs?: number;
  status: NoteDetectionStatus;
};

export type PracticeDetectionStatus =
  | 'waiting'
  | 'correct'
  | 'partial'
  | 'early'
  | 'late'
  | 'missed'
  | 'incorrect';

export type PracticeDetectionResult = {
  eventId: string;
  timestamp: number;
  expectedNotes: NoteDetectionResult[];
  unexpectedNotes: NoteDetectionResult[];
  timing: {
    expectedOnset: number;
    detectedOnset?: number;
    errorMs?: number;
  };
  status: PracticeDetectionStatus;
  confidence: number;
  noiseFloor: number;
};
