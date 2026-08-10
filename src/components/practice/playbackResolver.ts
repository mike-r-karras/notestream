import type { EasyScoreDocument } from '../../types/easyScore';
import {
  getOpeningPickupOffsetQuarterNotes,
  readBeatType,
} from './notation/scoreModel';
import { getNotationMeasures } from './notation/timeline';
import type {
  StandardNotationBarline,
  StandardNotationMeasure,
} from './notation/types';

export type ResolvedPlaybackMeasure = {
  playbackIndex: number;
  sourceMeasureIndex: number;
  sourceMeasureId: string;
  writtenMeasureNumber: number;
  repeatPass: number;
};

export type PlaybackSequence = {
  measures: ResolvedPlaybackMeasure[];
  hasRepeats: boolean;
};

function endingNumbers(number: string | undefined): number[] {
  if (!number) return [];
  const result = new Set<number>();

  for (const token of number.split(',')) {
    const range = token.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const first = Number(range[1]);
      const last = Number(range[2]);
      for (let value = Math.min(first, last); value <= Math.max(first, last); value += 1) {
        result.add(value);
      }
      continue;
    }

    const value = Number(token.trim());
    if (Number.isInteger(value) && value > 0) result.add(value);
  }

  return [...result];
}

function endingMembership(measures: StandardNotationMeasure[]): Array<Set<number>> {
  const active = new Set<number>();

  return measures.map(measure => {
    const barlines = measure.barlines ?? [];
    for (const barline of barlines) {
      if (barline.ending?.type !== 'start') continue;
      endingNumbers(barline.ending.number).forEach(number => active.add(number));
    }

    const membership = new Set(active);
    for (const barline of barlines) {
      endingNumbers(barline.ending?.number).forEach(number => membership.add(number));
    }

    for (const barline of barlines) {
      if (barline.ending?.type !== 'stop' && barline.ending?.type !== 'discontinue') continue;
      endingNumbers(barline.ending.number).forEach(number => active.delete(number));
    }

    return membership;
  });
}

function repeatBarline(
  measure: StandardNotationMeasure,
  direction: 'forward' | 'backward'
): StandardNotationBarline | undefined {
  return (measure.barlines ?? []).find(
    barline => barline.repeat?.direction === direction
  );
}

function firstRepeatStartIndex(
  document: EasyScoreDocument,
  measures: StandardNotationMeasure[]
): number {
  if (measures.length < 2) return 0;

  const opening = measures[0];
  const metadataTime = document.metadata?.timeSignature;
  const beats = opening.attributes?.time?.beats ?? metadataTime?.[0] ?? 4;
  const beatType = opening.attributes?.time
    ? readBeatType(opening.attributes.time)
    : metadataTime?.[1] ?? 4;

  return getOpeningPickupOffsetQuarterNotes(opening, beats, beatType) > 0
    ? 1
    : 0;
}

function repeatPassCount(
  backwardIndex: number,
  memberships: Array<Set<number>>,
  explicitTimes: number | undefined
): number {
  let count = Number.isInteger(explicitTimes) && (explicitTimes ?? 0) > 1
    ? explicitTimes as number
    : 2;

  let sawEnding = false;
  for (let index = backwardIndex; index < memberships.length; index += 1) {
    const membership = memberships[index];
    if (membership.size === 0) {
      if (sawEnding) break;
      continue;
    }
    sawEnding = true;
    membership.forEach(number => {
      count = Math.max(count, number);
    });
  }

  return count;
}

/**
 * Resolves immutable written measures into playback order. The returned
 * sequence contains source identities only; it does not clone or mutate score
 * measures and has no rendering behavior.
 */
export function resolvePlaybackSequence(
  document: EasyScoreDocument
): PlaybackSequence {
  const measures = getNotationMeasures(document);
  if (measures.length === 0) return { measures: [], hasRepeats: false };

  const memberships = endingMembership(measures);
  const fallbackRepeatStart = firstRepeatStartIndex(document, measures);
  const resolved: ResolvedPlaybackMeasure[] = [];
  const hasRepeats = measures.some(measure =>
    (measure.barlines ?? []).some(barline => !!barline.repeat)
  );

  let sourceIndex = 0;
  let repeatStart = fallbackRepeatStart;
  let repeatPass = 1;
  let steps = 0;
  const maximumSteps = Math.max(32, measures.length * 32);

  while (sourceIndex < measures.length && steps < maximumSteps) {
    steps += 1;
    const measure = measures[sourceIndex];
    if (
      repeatBarline(measure, 'forward') &&
      !(sourceIndex === repeatStart && repeatPass > 1)
    ) {
      repeatStart = sourceIndex;
      repeatPass = 1;
    }

    const membership = memberships[sourceIndex];
    if (membership.size > 0 && !membership.has(repeatPass)) {
      sourceIndex += 1;
      continue;
    }

    resolved.push({
      playbackIndex: resolved.length,
      sourceMeasureIndex: sourceIndex,
      sourceMeasureId: measure.id ?? `notation-measure-${measure.number ?? sourceIndex + 1}`,
      writtenMeasureNumber: measure.number ?? sourceIndex + 1,
      repeatPass,
    });

    const backward = repeatBarline(measure, 'backward');
    if (backward) {
      const passCount = repeatPassCount(
        sourceIndex,
        memberships,
        backward.repeat?.times
      );
      if (repeatPass < passCount) {
        repeatPass += 1;
        sourceIndex = repeatStart;
        continue;
      }
      repeatPass = 1;
      repeatStart = sourceIndex + 1;
    } else if (
      repeatPass > 1 &&
      membership.size > 0 &&
      (memberships[sourceIndex + 1]?.size ?? 0) === 0
    ) {
      repeatPass = 1;
      repeatStart = sourceIndex + 1;
    }

    sourceIndex += 1;
  }

  if (sourceIndex < measures.length && steps >= maximumSteps) {
    throw new Error('Repeat playback resolution exceeded its traversal safety limit.');
  }

  return { measures: resolved, hasRepeats };
}
