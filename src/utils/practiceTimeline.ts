export interface PracticeEvent {
  id: string;

  startTick: number;
  durationTicks: number;

  measure?: number;
  beat?: number;

  kind:
    | 'note'
    | 'chord'
    | 'lyric'
    | 'tab-note'
    | 'rest'
    | 'measure';

  sourceIds: string[];
}

export interface PracticeSegment {
  id: string;
  startTick: number;
  durationTicks: number;

  preferredWidth: number;
  events: PracticeEvent[];
  payload?: unknown;
}

export interface PositionedSegment extends PracticeSegment {
  x: number;
  width: number;
}

export function positionSegments(
  segments: PracticeSegment[],
  gap = 24
): PositionedSegment[] {
  let x = 0;

  return segments.map(segment => {
    const positioned = {
      ...segment,
      x,
      width: segment.preferredWidth,
    };

    x += segment.preferredWidth + gap;
    return positioned;
  });
}

export function tickToX(
  tick: number,
  segments: PositionedSegment[]
): number {
  if (segments.length === 0) return 0;

  const segment = segments.find(
    item =>
      tick >= item.startTick &&
      tick < item.startTick + item.durationTicks
  );

  if (!segment) {
    // If before the first segment, return 0
    if (tick < segments[0].startTick) {
      return segments[0].x;
    }
    // If after the last segment, return the end of the last segment
    const last = segments[segments.length - 1];
    return last.x + last.width;
  }

  const progress =
    (tick - segment.startTick) /
    segment.durationTicks;

  return segment.x + segment.width * progress;
}

export function xToTick(
  x: number,
  segments: PositionedSegment[]
): number {
  if (segments.length === 0) return 0;

  // Find the segment that contains this x coordinate
  const segment = segments.find(
    item =>
      x >= item.x &&
      x < item.x + item.width
  );

  if (!segment) {
    if (x < segments[0].x) {
      return segments[0].startTick;
    }
    const last = segments[segments.length - 1];
    return last.startTick + last.durationTicks;
  }

  const progress = (x - segment.x) / segment.width;
  return segment.startTick + segment.durationTicks * progress;
}
