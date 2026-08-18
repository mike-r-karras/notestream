import { describe, expect, it } from 'vitest';
import type { PositionedSegment } from '../../../utils/practiceTimeline';
import { notationRenderWindow } from './virtualization';

const segments = Array.from({ length: 20 }, (_, index) => ({
  id: `measure-${index}`,
  x: index * 250,
  width: 250,
  startTick: index * 1920,
  durationTicks: 1920,
  preferredWidth: 250,
  events: [],
  payload: {},
})) satisfies PositionedSegment[];

describe('notationRenderWindow', () => {
  it('keeps a stable initial window with two viewports ahead', () => {
    expect(notationRenderWindow(segments, 0, 1000)).toEqual({
      startIndex: 0,
      endIndex: 15,
      left: 0,
      right: 4000,
    });
    expect(notationRenderWindow(segments, -1750, 1000)).toEqual(
      notationRenderWindow(segments, 0, 1000)
    );
  });

  it('moves in chunks while retaining a viewport behind the visible content', () => {
    expect(notationRenderWindow(segments, -2000, 1000)).toEqual({
      startIndex: 4,
      endIndex: 19,
      left: 1000,
      right: 5000,
    });
  });

  it('returns an empty sentinel for a score without segments', () => {
    expect(notationRenderWindow([], 0, 1000)).toEqual({
      startIndex: 0,
      endIndex: -1,
      left: 0,
      right: 1,
    });
  });
});
