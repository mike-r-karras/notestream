export type StandardNotationMeasure = {
  id?: string;
  number?: number;
  attributes?: {
    divisions?: number;
    time?: { beats?: number; beatType?: number; beat_type?: number } | null;
    key?: { fifths?: number; mode?: string | null } | null;
    clef?: { sign?: string; line?: number | null } | null;
    clefs?: Record<string, { sign?: string; line?: number | null }>;
  };
  voices?: Array<{
    id?: string;
    number?: number;
    staff?: number;
    events?: StandardNotationEvent[];
  }>;
  barlines?: StandardNotationBarline[];
  playbackPresentation?: {
    playbackIndex: number;
    repeatPass: number;
    sourceMeasureId: string;
    sourceMeasureIndex: number;
    ghostRepeatSigns: boolean;
  };
};

export type StandardNotationBarline = {
  location?: 'left' | 'right' | string;
  style?: string;
  ending?: {
    number?: string;
    type?: 'start' | 'stop' | 'discontinue' | string;
  };
  repeat?: {
    direction?: 'forward' | 'backward' | string;
    times?: number;
  };
};

export type StandardNotationEvent = {
  id?: string;
  type?: string;
  staff?: number;
  voice?: number;
  startQuarterNotes?: number;
  start_quarter_notes?: number;
  duration?: {
    quarterNotes?: number;
    quarter_notes?: number;
    vexflow?: string;
    dots?: number;
  };
  pitches?: Array<{
    step?: string;
    octave?: number;
    alter?: number;
  }>;
  pitchNotations?: Array<{
    ties?: Array<{ type?: string }>;
    slurs?: Array<{ number?: number; type?: string }>;
  }> | null;
  accidentals?: Array<string | null> | null;
};

export type StandardNotationVoice =
  NonNullable<StandardNotationMeasure['voices']>[number];

export type NotationTheme = {
  foreground: string;
  staff: string;
};
