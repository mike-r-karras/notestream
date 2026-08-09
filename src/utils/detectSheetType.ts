import { EasyScoreDocument, SheetType } from '../types/easyScore';

export interface SheetTypeResult {
  type: SheetType;
  confidence: number;
  reasons: string[];
}

export function detectSheetType(
  document: EasyScoreDocument
): SheetTypeResult {
  const hasChordLyrics =
    (Array.isArray(document.chordLyrics) && document.chordLyrics.length > 0) ||
    (Array.isArray(document.sections) && document.sections.length > 0);

  const parts = document.parts ?? [];

  const hasTabStaff = parts.some(part =>
    part.staves?.some(staff =>
      staff.type === 'tablature' ||
      staff.lines === 4 ||
      staff.lines === 6 ||
      staff.notes?.some(note =>
        note.string !== undefined ||
        note.fret !== undefined
      )
    )
  );

  const hasStandardStaff = parts.some(part =>
    part.staves?.some(staff =>
      staff.type === 'standard' ||
      staff.notes?.some(note =>
        note.pitch !== undefined &&
        note.duration !== undefined
      )
    )
  );

  if (hasTabStaff && hasStandardStaff) {
    return {
      type: 'hybrid',
      confidence: 0.98,
      reasons: ['Contains tablature and standard notation'],
    };
  }

  if (hasTabStaff) {
    return {
      type: 'tablature',
      confidence: 0.95,
      reasons: ['Contains string/fret information or tab staves'],
    };
  }

  if (hasChordLyrics && !hasStandardStaff) {
    return {
      type: 'chord-lyrics',
      confidence: 0.95,
      reasons: ['Contains chord/lyric sections without notation staves'],
    };
  }

  if (hasStandardStaff) {
    return {
      type: 'standard-notation',
      confidence: 0.9,
      reasons: ['Contains pitched and timed notation'],
    };
  }
  
  if (parts.length > 0) {
    return {
      type: 'standard-notation',
      confidence: 0.6,
      reasons: ['Contains parts array, assuming standard notation representation'],
    };
  }

  return {
    type: 'unknown',
    confidence: 0,
    reasons: ['No recognizable musical representation'],
  };
}
