import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EasyScoreDocument } from '../../../types/easyScore';
import type { PositionedSegment } from '../../../utils/practiceTimeline';
import {
  buildNotationSignatureTimeline,
  positionStickySignatures,
  signatureChangeEntries,
  signatureAtViewportLeft,
} from './signatureTimeline';

const document = {
  metadata: { timeSignature: [4, 4] },
  parts: [{
    measures: [
      {
        attributes: {
          clefs: { '1': { sign: 'G' }, '2': { sign: 'F' } },
          key: { fifths: 1 },
          time: { beats: 4, beatType: 4 },
        },
        voices: [{ staff: 1, events: [] }, { staff: 2, events: [] }],
      },
      { attributes: { time: { beats: 3, beatType: 8 } }, voices: [] },
      {
        attributes: {
          time: { beats: 3, beatType: 8 },
          key: { fifths: 1 },
          clefs: { '1': { sign: 'G' }, '2': { sign: 'F' } },
        },
        voices: [],
      },
      { attributes: { key: { fifths: -2 }, clefs: { '1': { sign: 'C' } } }, voices: [] },
    ],
  }],
} as unknown as EasyScoreDocument;

const segments = [0, 400, 700, 1000].map((x, index) => ({
  id: `measure-${index}`,
  x,
  width: index === 0 ? 400 : 300,
  preferredWidth: index === 0 ? 400 : 300,
  startTick: index * 1920,
  durationTicks: 1920,
  events: [],
  payload: {},
})) as unknown as PositionedSegment[];

describe('notation signature timeline', () => {
  it('does not treat repeated normalized attributes as new signatures', () => {
    const fixture = JSON.parse(readFileSync(
      new URL('../../../../test/fixtures/scores/fur-elise-beethoven-for-beginner-piano.ezs', import.meta.url),
      'utf8'
    )) as EasyScoreDocument;

    expect(signatureChangeEntries(buildNotationSignatureTimeline(fixture)))
      .toHaveLength(1);
  });

  it('inherits unchanged clefs, key, and time independently', () => {
    const timeline = buildNotationSignatureTimeline(document);

    expect(timeline.map(({ clefs, fifths, beats, beatType }) => ({
      clefs,
      fifths,
      beats,
      beatType,
    }))).toEqual([
      { clefs: { 1: 'G', 2: 'F' }, fifths: 1, beats: 4, beatType: 4 },
      { clefs: { 1: 'G', 2: 'F' }, fifths: 1, beats: 3, beatType: 8 },
      { clefs: { 1: 'G', 2: 'F' }, fifths: 1, beats: 3, beatType: 8 },
      { clefs: { 1: 'C', 2: 'F' }, fifths: -2, beats: 3, beatType: 8 },
    ]);
    expect(timeline[2].changed).toEqual({ clefStaffs: [], key: false, time: false });
  });

  it('selects replacements in both forward and backward scroll directions', () => {
    const timeline = buildNotationSignatureTimeline(document);

    expect(signatureAtViewportLeft(timeline, segments, -450)?.measureIndex).toBe(1);
    expect(signatureAtViewportLeft(timeline, segments, -750)?.measureIndex).toBe(2);
    expect(signatureAtViewportLeft(timeline, segments, -450)?.measureIndex).toBe(1);
    expect(signatureAtViewportLeft(timeline, segments, -50)?.measureIndex).toBe(0);
  });

  it('pins a signature until the next change pushes it out from either direction', () => {
    const timeline = buildNotationSignatureTimeline(document);
    expect(signatureChangeEntries(timeline).map(entry => entry.measureIndex)).toEqual([0, 1, 3]);

    const movingForward = positionStickySignatures(timeline, segments, -300, 150);
    expect(movingForward.map(entry => [entry.measureIndex, entry.left])).toEqual([
      [0, -50],
      [1, 100],
      [3, 700],
    ]);

    const movingBackward = positionStickySignatures(timeline, segments, -100, 150);
    expect(movingBackward.map(entry => [entry.measureIndex, entry.left])).toEqual([
      [0, 0],
      [1, 300],
      [3, 900],
    ]);
  });
});
