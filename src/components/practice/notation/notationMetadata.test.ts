import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writtenMeasureNotation } from './notationMetadata';
import type { StandardNotationMeasure } from './types';

describe('writtenMeasureNotation', () => {
  it('maps source repeat signs and single-measure alternate endings', () => {
    const measures: StandardNotationMeasure[] = [
      {
        id: 'first-ending',
        barlines: [
          {
            location: 'left',
            style: 'regular',
            ending: { number: '1', type: 'start' },
          },
          {
            location: 'right',
            style: 'light-heavy',
            ending: { number: '1', type: 'stop' },
            repeat: { direction: 'backward' },
          },
        ],
      },
      {
        id: 'second-ending',
        barlines: [
          {
            location: 'left',
            style: 'regular',
            ending: { number: '2', type: 'start' },
          },
          {
            location: 'right',
            style: 'regular',
            ending: { number: '2', type: 'discontinue' },
          },
        ],
      },
    ];

    expect(writtenMeasureNotation(measures)).toEqual([
      {
        beginBarline: 'single',
        endBarline: 'repeat-end',
        volta: { kind: 'begin-end', label: '1.' },
      },
      {
        beginBarline: 'single',
        endBarline: 'single',
        volta: { kind: 'begin', label: '2.' },
      },
    ]);
  });

  it('preserves a multi-measure ending span', () => {
    const measures: StandardNotationMeasure[] = [
      { barlines: [{ location: 'left', ending: { number: '1,2', type: 'start' } }] },
      {},
      { barlines: [{ location: 'right', ending: { number: '1,2', type: 'stop' } }] },
    ];

    expect(writtenMeasureNotation(measures).map(item => item.volta)).toEqual([
      { kind: 'begin', label: '1,2.' },
      { kind: 'mid', label: '' },
      { kind: 'end', label: '' },
    ]);
  });

  it('maps explicit forward repeats and final barlines', () => {
    const measures: StandardNotationMeasure[] = [{
      barlines: [
        { location: 'left', repeat: { direction: 'forward' } },
        { location: 'right', style: 'light-heavy' },
      ],
    }];

    expect(writtenMeasureNotation(measures)).toEqual([{
      beginBarline: 'repeat-begin',
      endBarline: 'final',
    }]);
  });

  it('maps the supplied Fur Elise first and second endings', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL('../../../../test/fixtures/scores/fur-elise-beethoven-for-beginner-piano.ezs', import.meta.url),
        'utf8'
      )
    ) as { parts: Array<{ measures: StandardNotationMeasure[] }> };
    const measures = fixture.parts[0].measures;
    const notation = writtenMeasureNotation(measures);

    expect(notation[8]).toMatchObject({
      endBarline: 'repeat-end',
      volta: { kind: 'begin-end', label: '1.' },
    });
    expect(notation[9]).toMatchObject({
      volta: { kind: 'begin', label: '2.' },
    });
  });
});
