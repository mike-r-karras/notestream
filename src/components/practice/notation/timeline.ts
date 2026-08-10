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
  getMeasureQuarterNotes,
  getOpeningPickupOffsetQuarterNotes,
  readBeatType,
} from './scoreModel';
import { getMeasureWidth } from './layout';

export const TICKS_PER_QUARTER = 480;

export function notationEventId(
  measureId: string,
  voice: StandardNotationVoice,
  event: StandardNotationEvent
): string {
  if (event.id) return event.id;
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
  return (
    (document.parts?.[0] as unknown as {
      measures?: StandardNotationMeasure[];
    })?.measures ?? []
  );
}

export function buildNotationTimeline(
  document: EasyScoreDocument
): PracticeSegment[] {
  const measures = getNotationMeasures(document);
  const segments: PracticeSegment[] = [];
  let startTick = 0;
  const metadataTime = document.metadata?.timeSignature;

  measures.forEach((measure, index) => {
    const quarterNotes = getMeasureQuarterNotes(measure);
    const durationTicks = Math.max(
      1,
      Math.round(quarterNotes * TICKS_PER_QUARTER)
    );
    const number = measure.number ?? index + 1;
    const measureId =
      measure.id ?? `notation-measure-${number}`;
    const pickupOffsetQuarterNotes = index === 0
      ? getOpeningPickupOffsetQuarterNotes(
          measure,
          measure.attributes?.time?.beats ?? metadataTime?.[0] ?? 4,
          measure.attributes?.time
            ? readBeatType(measure.attributes.time)
            : metadataTime?.[1] ?? 4
        )
      : 0;

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
              (eventStartQuarter(event) + pickupOffsetQuarterNotes) *
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
      preferredWidth: getMeasureWidth(measure, index),
      events,
      payload: measure,
    });

    startTick += durationTicks;
  });

  return segments;
}
