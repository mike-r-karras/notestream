import { describe, expect, it } from 'vitest';
import { getMeasureWidth } from './layout';
import type { StandardNotationMeasure } from './types';

describe('notation measure layout', () => {
  it('does not add obsolete signature space to the opening measure', () => {
    const measure: StandardNotationMeasure = {
      attributes: {
        time: { beats: 3, beatType: 8 },
        clefs: { '1': { sign: 'G' }, '2': { sign: 'F' } },
      },
      voices: [{
        staff: 1,
        events: [{
          type: 'note',
          startQuarterNotes: 0,
          duration: { quarterNotes: 1.5, vexflow: '4d' },
          pitches: [{ step: 'E', octave: 5 }],
        }],
      }],
    };

    expect(getMeasureWidth(measure, 0)).toBe(getMeasureWidth(measure, 1));
  });

  it('sizes a pickup from its content instead of its missing beats', () => {
    const sparsePickup: StandardNotationMeasure = {
      attributes: { time: { beats: 4, beatType: 4 } },
      voices: [{
        staff: 1,
        events: [{
          type: 'note',
          startQuarterNotes: 0,
          duration: { quarterNotes: 0.25, vexflow: '16' },
          pitches: [{ step: 'E', octave: 5 }],
        }],
      }],
    };
    const densePickup: StandardNotationMeasure = {
      ...sparsePickup,
      voices: [{
        staff: 1,
        events: Array.from({ length: 6 }, (_, index) => ({
          type: 'note',
          startQuarterNotes: index * 0.25,
          duration: { quarterNotes: 0.25, vexflow: '16' },
          pitches: [{ step: 'E', octave: 5 }],
        })),
      }],
    };

    expect(getMeasureWidth(sparsePickup, 0)).toBe(150);
    expect(getMeasureWidth(densePickup, 0)).toBeGreaterThan(
      getMeasureWidth(sparsePickup, 0)
    );
  });
});
