export interface InstrumentConfig {
  tuning: string[];
  chords: Record<string, (number | string)[]>;
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

export interface ChordLyricMeasure {
  id: string;
  number: number;
  beats: number;
  chords?: {
    id: string;
    beat: number;
    symbol: string;
    durationBeats: number;
  }[];
  lyrics?: {
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
  };
  sections?: ChordLyricSection[]; // preserved for backward-compatibility
  parts?: EasyScorePart[];
  chordLyrics?: ChordLyricSection[];
}
