export interface InstrumentConfig {
  name?: string;
  tuning: string[];
  frets?: number;
  chords: Record<string, (number | string)[]>;
  chordTones?: Record<string, string[]>;
}

export type SheetType =
  | 'chord-lyrics'
  | 'standard-notation'
  | 'tablature'
  | 'hybrid'
  | 'unknown';

export interface EasyScoreNote {
  pitch?: string;
  duration?: string;
  string?: number;
  fret?: number;
}

export interface EasyScoreStaff {
  id?: string;
  type?: 'standard' | 'tablature' | string;
  lines?: number;
  notes?: EasyScoreNote[];
}

export interface EasyScorePart {
  id?: string;
  name?: string;
  staves?: EasyScoreStaff[];
}

export interface RationalBeatPosition {
  numerator: number;
  denominator: number;
}

export type BeatPosition = number | RationalBeatPosition;

export interface SourceReference {
  page: number;
  wordIds: string[];
}

export interface InferenceEvidence {
  confidence: number;
  evidence: string[];
}

export interface ChordChange {
  id: string;
  beat: BeatPosition;
  symbol: string;
  printed?: boolean;
  durationBeats?: number;
  sourceRef?: SourceReference;
  inference?: InferenceEvidence;
}

export interface LyricCue {
  id: string;
  beat: BeatPosition;
  text: string;
  role?: 'normal' | 'pickup';
  sourceRef?: SourceReference;
  inference?: InferenceEvidence;
}

export interface ChordLyricMeasure {
  id: string;
  number: number;
  beats: number;
  effectiveChord?: string;
  chords?: ChordChange[];
  lyricCues?: LyricCue[];
  lyrics?: {
    id?: string;
    beat?: BeatPosition;
    text: string;
  }[];
  sectionId?: string;
  sectionLabel?: string | null;
  absoluteIndex?: number;
  showChordBox?: boolean;
}

export interface ChordLyricSection {
  id: string;
  label: string;
  measures: ChordLyricMeasure[];
}

export interface EasyScoreDocument {
  schemaVersion?: string;
  sourceFormat?: string;
  metadata: {
    title?: string;
    subtitle?: string;
    writers?: string[] | string;
    year?: number;
    source?: string;
    key?: string;
    capo?: number;
    tempo?: number | null;
    timeSignature?: [number, number];
    style?: string;
    notes?: string[];
    author?: string;
    instrument?: string;
    sheetType?: SheetType;
    instrumentInference?: InferenceEvidence;
  };
  sections?: ChordLyricSection[]; // preserved for backward-compatibility
  parts?: EasyScorePart[];
  chordLyrics?: ChordLyricSection[];
  warnings?: Array<Record<string, unknown>>;
}
