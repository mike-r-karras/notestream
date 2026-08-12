import type { EasyScoreDocument } from '../../../types/easyScore';
import type { PositionedSegment } from '../../../utils/practiceTimeline';
import { getStaffNumbers, readBeatType } from './scoreModel';
import { getNotationMeasures } from './timeline';

export type NotationSignature = {
  clefs: Record<number, string>;
  fifths: number;
  beats: number;
  beatType: number;
};

export type NotationSignatureEntry = NotationSignature & {
  measureIndex: number;
  changed: {
    clefStaffs: number[];
    key: boolean;
    time: boolean;
  };
};

export type PositionedNotationSignature = NotationSignatureEntry & {
  left: number;
};

export function buildNotationSignatureTimeline(
  document: EasyScoreDocument
): NotationSignatureEntry[] {
  const measures = getNotationMeasures(document);
  const staffNumbers = getStaffNumbers(measures);
  const clefs: Record<number, string> = Object.fromEntries(
    staffNumbers.map((staff, index) => [staff, index === 0 ? 'G' : 'F'])
  );
  let fifths = 0;
  let beats = document.metadata?.timeSignature?.[0] ?? 4;
  let beatType = document.metadata?.timeSignature?.[1] ?? 4;

  return measures.map((measure, measureIndex) => {
    const previousClefs = { ...clefs };
    const previousFifths = fifths;
    const previousBeats = beats;
    const previousBeatType = beatType;
    const attributes = measure.attributes;

    if (attributes?.clef?.sign) clefs[staffNumbers[0] ?? 1] = attributes.clef.sign;
    Object.entries(attributes?.clefs ?? {}).forEach(([staff, clef]) => {
      if (clef?.sign) clefs[Number(staff)] = clef.sign;
    });
    if (attributes?.key?.fifths !== undefined) fifths = attributes.key.fifths;
    if (attributes?.time) {
      beats = attributes.time.beats ?? beats;
      beatType = readBeatType(attributes.time);
    }

    const changedClefStaffs = staffNumbers.filter(
      staff => measureIndex === 0 || previousClefs[staff] !== clefs[staff]
    );

    return {
      measureIndex,
      clefs: { ...clefs },
      fifths,
      beats,
      beatType,
      changed: {
        clefStaffs: changedClefStaffs,
        key: measureIndex === 0 || previousFifths !== fifths,
        time: measureIndex === 0 || previousBeats !== beats || previousBeatType !== beatType,
      },
    };
  });
}

export function signatureChangeEntries(
  timeline: NotationSignatureEntry[]
): NotationSignatureEntry[] {
  return timeline.filter(entry =>
    entry.changed.clefStaffs.length > 0 || entry.changed.key || entry.changed.time
  );
}

export function positionStickySignatures(
  timeline: NotationSignatureEntry[],
  segments: PositionedSegment[],
  offsetX: number,
  width: number | ((entry: NotationSignatureEntry) => number)
): PositionedNotationSignature[] {
  const changes = signatureChangeEntries(timeline);
  return changes.flatMap((entry, index) => {
    const anchor = segments[entry.measureIndex]?.x;
    if (anchor === undefined) return [];
    const nextEntry = changes[index + 1];
    const nextAnchor = nextEntry
      ? segments[nextEntry.measureIndex]?.x ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    const entryWidth = typeof width === 'function' ? width(entry) : width;
    const normalLeft = anchor + offsetX;
    const pushLimit = nextAnchor + offsetX - entryWidth;
    const left = Math.max(normalLeft, Math.min(0, pushLimit));
    return [{ ...entry, left }];
  });
}

export function signatureAtViewportLeft(
  timeline: NotationSignatureEntry[],
  segments: PositionedSegment[],
  offsetX: number
): NotationSignatureEntry | undefined {
  if (timeline.length === 0) return undefined;
  const contentX = Math.max(0, -offsetX);
  let active = timeline[0];

  for (const entry of timeline) {
    const segment = segments[entry.measureIndex];
    if (!segment || segment.x > contentX) break;
    active = entry;
  }

  return active;
}
