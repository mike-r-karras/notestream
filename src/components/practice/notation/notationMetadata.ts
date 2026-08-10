import type { StandardNotationMeasure } from './types';

export type WrittenBarlineKind =
  | 'single'
  | 'double'
  | 'final'
  | 'repeat-begin'
  | 'repeat-end';

export type WrittenVoltaKind =
  | 'begin'
  | 'mid'
  | 'end'
  | 'begin-end';

export type WrittenMeasureNotation = {
  beginBarline?: WrittenBarlineKind;
  endBarline?: WrittenBarlineKind;
  volta?: {
    kind: WrittenVoltaKind;
    label: string;
  };
};

function barlineForStyle(style: string | undefined): WrittenBarlineKind | undefined {
  switch (style) {
    case 'light-light':
      return 'double';
    case 'light-heavy':
      return 'final';
    case 'regular':
      return 'single';
    default:
      return undefined;
  }
}

/** Maps canonical written notation metadata without inferring musical form. */
export function writtenMeasureNotation(
  measures: StandardNotationMeasure[]
): WrittenMeasureNotation[] {
  let activeEnding: string | undefined;

  return measures.map(measure => {
    const left = (measure.barlines ?? []).find(barline => barline.location === 'left');
    const right = (measure.barlines ?? []).find(barline => barline.location === 'right');
    const endingStart = (measure.barlines ?? []).find(
      barline => barline.ending?.type === 'start'
    )?.ending;
    const endingStop = (measure.barlines ?? []).find(
      barline => barline.ending?.type === 'stop'
    )?.ending;
    const endingDiscontinue = (measure.barlines ?? []).find(
      barline => barline.ending?.type === 'discontinue'
    )?.ending;
    const notation: WrittenMeasureNotation = {};

    if (left?.repeat?.direction === 'forward') {
      notation.beginBarline = 'repeat-begin';
    } else {
      notation.beginBarline = barlineForStyle(left?.style);
    }

    if (right?.repeat?.direction === 'backward') {
      notation.endBarline = 'repeat-end';
    } else {
      notation.endBarline = barlineForStyle(right?.style);
    }

    if (endingStart) {
      activeEnding = endingStart.number;
      notation.volta = {
        kind: endingStop
          ? 'begin-end'
          : 'begin',
        label: endingStart.number ? `${endingStart.number}.` : '',
      };
    } else if (activeEnding) {
      notation.volta = {
        kind: endingStop ? 'end' : 'mid',
        label: '',
      };
    }

    if (endingStop || endingDiscontinue) activeEnding = undefined;
    return notation;
  });
}
