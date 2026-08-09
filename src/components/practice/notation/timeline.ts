import type { EasyScoreDocument } from '../../../types/easyScore';
import type {
  PracticeEvent,
  PracticeSegment,
} from '../../../utils/practiceTimeline';
import type { StandardNotationMeasure } from './types';
import {
  eventDurationQuarter,
  eventStartQuarter,
  getMeasureQuarterNotes,
} from './scoreModel';
import { getMeasureWidth } from './layout';

export const TICKS_PER_QUARTER = 480;

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

  measures.forEach((measure, index) => {
    const quarterNotes = getMeasureQuarterNotes(measure);
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
        events.push({
          id:
            event.id ??
            `${measureId}-event-${events.length}`,
          startTick:
            startTick +
            Math.round(
              eventStartQuarter(event) * TICKS_PER_QUARTER
            ),
          durationTicks: Math.max(
            1,
            Math.round(
              eventDurationQuarter(event) * TICKS_PER_QUARTER
            )
          ),
          measure: number,
          kind: event.type === 'rest' ? 'rest' : 'note',
          sourceIds: event.id ? [event.id] : [measureId],
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
