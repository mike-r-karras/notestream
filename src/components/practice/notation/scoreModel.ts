import type {
  StandardNotationEvent,
  StandardNotationMeasure,
  StandardNotationVoice,
} from './types';

export function eventStartQuarter(event: StandardNotationEvent): number {
  return event.startQuarterNotes ?? event.start_quarter_notes ?? 0;
}

export function eventDurationQuarter(event: StandardNotationEvent): number {
  return event.duration?.quarterNotes ?? event.duration?.quarter_notes ?? 0;
}

export function eventIsSounding(event: StandardNotationEvent): boolean {
  return event.type !== 'rest' && !!event.pitches?.length && eventDurationQuarter(event) > 0;
}

export function getMeasureEventEndQuarterNotes(
  measure: StandardNotationMeasure
): number {
  let eventEnd = 0;
  for (const voice of measure.voices ?? []) {
    for (const event of voice.events ?? []) {
      eventEnd = Math.max(
        eventEnd,
        eventStartQuarter(event) + eventDurationQuarter(event)
      );
    }
  }
  return eventEnd;
}

export function getOpeningPickupOffsetQuarterNotes(
  measure: StandardNotationMeasure,
  beats: number,
  beatType: number
): number {
  const declared = beats * (4 / beatType);
  const eventEnd = getMeasureEventEndQuarterNotes(measure);
  const epsilon = 1e-5;

  return eventEnd > epsilon && eventEnd < declared - epsilon
    ? declared - eventEnd
    : 0;
}

export function voicesActuallyOverlap(
  a: StandardNotationVoice,
  b: StandardNotationVoice
): boolean {
  const aEvents = (a.events ?? []).filter(eventIsSounding);
  const bEvents = (b.events ?? []).filter(eventIsSounding);
  const epsilon = 1e-5;

  for (const left of aEvents) {
    const leftStart = eventStartQuarter(left);
    const leftEnd = leftStart + eventDurationQuarter(left);
    for (const right of bEvents) {
      const rightStart = eventStartQuarter(right);
      const rightEnd = rightStart + eventDurationQuarter(right);
      if (leftStart < rightEnd - epsilon && rightStart < leftEnd - epsilon) {
        return true;
      }
    }
  }
  return false;
}

function eventIdentity(event: StandardNotationEvent): string {
  const pitches = (event.pitches ?? [])
    .map(p => `${p.step ?? ''}${p.alter ?? 0}/${p.octave ?? ''}`)
    .join(',');

  return [
    event.type ?? 'note',
    eventStartQuarter(event).toFixed(6),
    eventDurationQuarter(event).toFixed(6),
    pitches,
    (event.accidentals ?? []).join(','),
  ].join('|');
}

export function normalizeVoicesForStaff(
  voices: StandardNotationVoice[]
): StandardNotationVoice[] {
  if (voices.length <= 1) return voices;

  let hasTruePolyphony = false;
  for (let i = 0; i < voices.length && !hasTruePolyphony; i += 1) {
    for (let j = i + 1; j < voices.length; j += 1) {
      if (voicesActuallyOverlap(voices[i], voices[j])) {
        hasTruePolyphony = true;
        break;
      }
    }
  }

  if (hasTruePolyphony) return voices;

  const seen = new Set<string>();
  const events = voices
    .flatMap(voice => voice.events ?? [])
    .sort((a, b) => eventStartQuarter(a) - eventStartQuarter(b))
    .filter(event => {
      const key = eventIdentity(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return [{
    ...voices[0],
    number: voices[0]?.number ?? 1,
    events,
  }];
}

export function readBeatType(
  time: StandardNotationMeasure['attributes'] extends infer A
    ? A extends { time?: infer T }
      ? T
      : never
    : never
): number {
  if (!time || typeof time !== 'object') return 4;
  const value =
    (time as { beatType?: number; beat_type?: number }).beatType ??
    (time as { beatType?: number; beat_type?: number }).beat_type;
  return typeof value === 'number' && value > 0 ? value : 4;
}

export function getMeasureQuarterNotes(measure: StandardNotationMeasure): number {
  const time = measure.attributes?.time;
  const beats = time?.beats ?? 4;
  const beatType = readBeatType(time ?? null);
  const declared = beats * (4 / beatType);

  const eventEnd = getMeasureEventEndQuarterNotes(measure);

  return Math.max(declared, eventEnd, 1);
}

function hasPickupBoundaryBefore(
  measures: StandardNotationMeasure[],
  measureIndex: number
): boolean {
  if (measureIndex === 0) return true;
  const currentBarlines = measures[measureIndex]?.barlines ?? [];
  const previousBarlines = measures[measureIndex - 1]?.barlines ?? [];
  const isDouble = (style: string | undefined) =>
    style === 'light-light' || style === 'double';

  return previousBarlines.some(barline =>
    isDouble(barline.style) || !!barline.repeat
  ) || currentBarlines.some(barline =>
    barline.location === 'left' &&
    (isDouble(barline.style) || !!barline.repeat)
  );
}

/**
 * Return the written duration used by transport and horizontal layout.
 * Underfull measures are partial measures only at structurally valid pickup
 * boundaries: the opening, a double barline, or a repeat boundary.
 */
export function getContextualMeasureQuarterNotes(
  measures: StandardNotationMeasure[],
  measureIndex: number
): number {
  const measure = measures[measureIndex];
  if (!measure) return 1;
  const declared = getMeasureQuarterNotes(measure);
  const eventEnd = getMeasureEventEndQuarterNotes(measure);
  return hasPickupBoundaryBefore(measures, measureIndex) && eventEnd > 0 && eventEnd < declared
    ? eventEnd
    : declared;
}

export function getStaffNumbers(
  measures: StandardNotationMeasure[]
): number[] {
  const staffNumbers = Array.from(
    new Set(
      measures.flatMap(measure =>
        (measure.voices ?? []).map(voice => voice.staff ?? 1)
      )
    )
  ).sort((a, b) => a - b);

  return staffNumbers.length > 0 ? staffNumbers : [1];
}
