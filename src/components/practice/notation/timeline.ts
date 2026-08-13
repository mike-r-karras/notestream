import type { EasyScoreDocument } from '../../../types/easyScore';
import type {
  PracticeEvent,
  PracticeSegment,
} from '../../../utils/practiceTimeline';
import type {
  StandardNotationEvent,
  StandardNotationMeasure,
  StandardNotationVoice,
} from './types';
import {
  eventDurationQuarter,
  eventStartQuarter,
  getContextualMeasureQuarterNotes,
} from './scoreModel';
import { getMeasureWidth } from './layout';

export const TICKS_PER_QUARTER = 480;

type NotationPart = {
  id?: string;
  measures?: StandardNotationMeasure[];
};

function partStaffCount(measures: StandardNotationMeasure[]): number {
  let count = 1;
  for (const measure of measures) {
    count = Math.max(count, measure.attributes?.staves ?? 1);
    for (const staff of Object.keys(measure.attributes?.clefs ?? {})) {
      count = Math.max(count, Number(staff) || 1);
    }
    for (const voice of measure.voices ?? []) {
      count = Math.max(count, voice.staff ?? 1);
      for (const event of voice.events ?? []) {
        count = Math.max(count, event.staff ?? voice.staff ?? 1);
      }
    }
  }
  return count;
}

function mergeNotationParts(parts: NotationPart[]): StandardNotationMeasure[] {
  const notationParts = parts
    .map(part => ({ ...part, measures: part.measures ?? [] }))
    .filter(part => part.measures.length > 0);
  if (notationParts.length === 0) return [];
  if (notationParts.length === 1) return notationParts[0].measures;

  let nextStaff = 1;
  const positionedParts = notationParts.map((part, partIndex) => {
    const staffCount = partStaffCount(part.measures);
    const staffOffset = nextStaff - 1;
    const staffGroup = Array.from(
      { length: staffCount },
      (_, index) => nextStaff + index
    );
    nextStaff += staffCount;
    return { ...part, partIndex, staffOffset, staffGroup };
  });
  const measureCount = Math.max(...positionedParts.map(part => part.measures.length));

  return Array.from({ length: measureCount }, (_, measureIndex) => {
    const available = positionedParts.flatMap(part => {
      const measure = part.measures[measureIndex];
      return measure ? [{ part, measure }] : [];
    });
    const primary = available[0]?.measure;
    if (!primary) return { id: `multi-part-measure-${measureIndex + 1}` };

    const clefs: NonNullable<StandardNotationMeasure['attributes']>['clefs'] = {};
    const voices: StandardNotationVoice[] = [];
    for (const { part, measure } of available) {
      const sourceClefs = measure.attributes?.clefs ?? {};
      Object.entries(sourceClefs).forEach(([staff, clef]) => {
        clefs[String(part.staffOffset + (Number(staff) || 1))] = { ...clef };
      });
      if (Object.keys(sourceClefs).length === 0 && measure.attributes?.clef) {
        clefs[String(part.staffOffset + 1)] = { ...measure.attributes.clef };
      }

      (measure.voices ?? []).forEach((voice, voiceIndex) => {
        const sourceStaff = voice.staff ?? 1;
        voices.push({
          ...voice,
          id: voice.id ?? `${part.id ?? `part-${part.partIndex + 1}`}-m${measureIndex + 1}-v${voiceIndex + 1}`,
          staff: part.staffOffset + sourceStaff,
          events: (voice.events ?? []).map(event => ({
            ...event,
            staff: part.staffOffset + (event.staff ?? sourceStaff),
          })),
        });
      });
    }

    return {
      ...primary,
      id: primary.id ?? `multi-part-measure-${measureIndex + 1}`,
      attributes: {
        ...primary.attributes,
        staves: nextStaff - 1,
        clef: clefs['1'] ?? primary.attributes?.clef,
        clefs,
      },
      voices,
      staffGroups: positionedParts.map(part => part.staffGroup),
    };
  });
}

export function notationEventId(
  measureId: string,
  voice: StandardNotationVoice,
  event: StandardNotationEvent
): string {
  // Converter event IDs are stable but are not guaranteed to be globally
  // unique; some scores restart them in each measure. Scope them to their
  // canonical measure so the transport and SVG registry identify the same
  // single written occurrence.
  if (event.id) return `${measureId}::${event.id}`;
  const staff = event.staff ?? voice.staff ?? 1;
  const voiceNumber = event.voice ?? voice.number ?? 1;
  const start = eventStartQuarter(event).toFixed(6);
  const duration = eventDurationQuarter(event).toFixed(6);
  const pitches = (event.pitches ?? [])
    .map(pitch => `${pitch.step ?? ''}${pitch.alter ?? 0}/${pitch.octave ?? ''}`)
    .join(',');
  return `${measureId}-s${staff}-v${voiceNumber}-t${start}-d${duration}-${event.type ?? 'note'}-${pitches}`;
}

export function getNotationMeasures(
  document: EasyScoreDocument
): StandardNotationMeasure[] {
  return mergeNotationParts((document.parts ?? []) as unknown as NotationPart[]);
}

export function buildNotationTimeline(
  document: EasyScoreDocument
): PracticeSegment[] {
  const measures = getNotationMeasures(document);
  const segments: PracticeSegment[] = [];
  let startTick = 0;
  measures.forEach((measure, index) => {
    const quarterNotes = getContextualMeasureQuarterNotes(measures, index);
    const durationTicks = Math.max(
      1,
      Math.round(quarterNotes * TICKS_PER_QUARTER)
    );
    const number = measure.number ?? index + 1;
    const measureId =
      measure.id ?? `notation-measure-${number}`;

    const events: PracticeEvent[] = [{
      id: `${measureId}-event`,
      startTick,
      durationTicks,
      measure: number,
      kind: 'measure',
      sourceIds: [measureId],
    }];

    for (const voice of measure.voices ?? []) {
      for (const event of voice.events ?? []) {
        const eventId = notationEventId(measureId, voice, event);
        events.push({
          id: eventId,
          startTick:
            startTick +
            Math.round(
              eventStartQuarter(event) *
                TICKS_PER_QUARTER
            ),
          durationTicks: Math.max(
            1,
            Math.round(
              eventDurationQuarter(event) * TICKS_PER_QUARTER
            )
          ),
          measure: number,
          kind: event.type === 'rest' ? 'rest' : 'note',
          sourceIds: [eventId],
        });
      }
    }

    segments.push({
      id: measureId,
      startTick,
      durationTicks,
      preferredWidth: getMeasureWidth(measure, index, quarterNotes),
      events,
      payload: measure,
    });

    startTick += durationTicks;
  });

  return segments;
}
