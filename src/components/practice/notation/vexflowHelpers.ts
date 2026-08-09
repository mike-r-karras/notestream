import type { StandardNotationEvent } from './types';

export function getClefName(sign?: string): string {
  switch ((sign ?? 'G').toUpperCase()) {
    case 'F': return 'bass';
    case 'C': return 'alto';
    case 'TAB': return 'tab';
    case 'PERCUSSION': return 'percussion';
    default: return 'treble';
  }
}

export function keySignatureFromFifths(fifths = 0): string {
  const majorKeys: Record<number, string> = {
    [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb',
    [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A',
    4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
  };
  return majorKeys[Math.max(-7, Math.min(7, fifths))] ?? 'C';
}

export function pitchToVexKey(
  pitch: NonNullable<StandardNotationEvent['pitches']>[number]
): string {
  const step = (pitch.step ?? 'B').toLowerCase();
  const octave = pitch.octave ?? 4;
  return `${step}/${octave}`;
}

export function accidentalFromAlter(alter?: number): string | null {
  if (alter == null || alter === 0) return null;
  if (alter === 1) return '#';
  if (alter === -1) return 'b';
  if (alter === 2) return '##';
  if (alter === -2) return 'bb';
  return null;
}

export function accidentalToVex(
  accidental?: string | null
): string | null {
  if (!accidental) return null;

  switch (accidental.trim().toLowerCase()) {
    case '#':
    case 'sharp':
      return '#';
    case 'b':
    case 'flat':
      return 'b';
    case 'n':
    case 'natural':
      return 'n';
    case '##':
    case 'x':
    case 'double-sharp':
    case 'sharp-sharp':
      return '##';
    case 'bb':
    case 'double-flat':
    case 'flat-flat':
      return 'bb';
    default:
      console.warn('[Notestream VexFlow] unsupported accidental:', accidental);
      return null;
  }
}

function diatonicIndex(step?: string, octave?: number): number {
  const stepIndex: Record<string, number> = {
    C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
  };
  return (
    (octave ?? 4) * 7 +
    (stepIndex[(step ?? 'C').toUpperCase()] ?? 0)
  );
}

export function getStemDirectionForEvent(
  event: StandardNotationEvent,
  clefName: string,
  voiceIndex: number,
  voiceCount: number
): number {
  if (voiceCount > 1) return voiceIndex === 0 ? 1 : -1;

  const pitches = event.pitches ?? [];
  if (pitches.length === 0) return 1;

  const average =
    pitches.reduce(
      (sum, pitch) =>
        sum + diatonicIndex(pitch.step, pitch.octave),
      0
    ) / pitches.length;

  const middleLine =
    clefName === 'bass'
      ? diatonicIndex('D', 3)
      : clefName === 'alto'
        ? diatonicIndex('C', 4)
        : diatonicIndex('B', 4);

  return average >= middleLine ? -1 : 1;
}

export function getRestKeyForClef(clefName: string): string {
  if (clefName === 'bass') return 'd/3';
  if (clefName === 'alto') return 'c/4';
  return 'b/4';
}

export function splitQuarterNotesIntoVexDurations(
  quarterNotes: number
): string[] {
  const durations: Array<[number, string]> = [
    [4, 'w'],
    [2, 'h'],
    [1, 'q'],
    [0.5, '8'],
    [0.25, '16'],
    [0.125, '32'],
    [0.0625, '64'],
  ];

  const result: string[] = [];
  let remaining = Math.max(0, quarterNotes);
  const epsilon = 1e-5;

  for (const [value, vex] of durations) {
    while (remaining + epsilon >= value) {
      result.push(vex);
      remaining -= value;
    }
  }

  if (remaining > epsilon) result.push('64');
  return result;
}
