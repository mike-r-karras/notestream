import type { PositionedSegment } from '../../../utils/practiceTimeline';

export interface NotationRenderWindow {
  startIndex: number;
  endIndex: number;
  left: number;
  right: number;
}

const FALLBACK_VIEWPORT_WIDTH = 1200;
const WINDOW_STEP_VIEWPORTS = 2;
const OVERSCAN_BEHIND_VIEWPORTS = 1;
const OVERSCAN_AHEAD_VIEWPORTS = 2;

/**
 * Select a stable, chunked subset of measures around the visible score area.
 * The window changes only every two viewport widths so VexFlow is not asked to
 * redraw at measure boundaries during ordinary playback.
 */
export function notationRenderWindow(
  segments: PositionedSegment[],
  offsetX: number,
  viewportWidth: number
): NotationRenderWindow {
  if (segments.length === 0) {
    return { startIndex: 0, endIndex: -1, left: 0, right: 1 };
  }

  const width = viewportWidth > 0 ? viewportWidth : FALLBACK_VIEWPORT_WIDTH;
  const contentLeft = Math.max(0, -offsetX);
  const step = width * WINDOW_STEP_VIEWPORTS;
  const bucketLeft = Math.floor(contentLeft / step) * step;
  const requestedLeft = Math.max(0, bucketLeft - width * OVERSCAN_BEHIND_VIEWPORTS);
  const requestedRight = bucketLeft + step + width * OVERSCAN_AHEAD_VIEWPORTS;

  let startIndex = segments.findIndex(segment => segment.x + segment.width > requestedLeft);
  if (startIndex < 0) startIndex = segments.length - 1;

  let endIndex = segments.length - 1;
  for (let index = startIndex; index < segments.length; index += 1) {
    if (segments[index].x >= requestedRight) {
      endIndex = Math.max(startIndex, index - 1);
      break;
    }
  }

  const left = segments[startIndex].x;
  const last = segments[endIndex];
  return {
    startIndex,
    endIndex,
    left,
    right: last.x + last.width,
  };
}
