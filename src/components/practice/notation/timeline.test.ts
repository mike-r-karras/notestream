import { describe, expect, it } from 'vitest';
import type { EasyScoreDocument } from '../../../types/easyScore';
import { buildNotationTimeline, getNotationMeasures, notationEventId } from './timeline';
import type { StandardNotationEvent, StandardNotationMeasure, StandardNotationVoice } from './types';

describe('notationEventId', () => {
  it('scopes converter event IDs to their measure', () => {
    const voice = { staff: 1, number: 1 } as StandardNotationVoice;
    const event = { id: 'event-1' } as StandardNotationEvent;

    expect(notationEventId('measure-1', voice, event)).toBe('measure-1::event-1');
    expect(notationEventId('measure-2', voice, event)).toBe('measure-2::event-1');
  });
});

describe('multi-part notation alignment', () => {
  it('aligns vocal and piano measures while preserving source staff groups', () => {
    const vocalMeasure: StandardNotationMeasure = {
      id: 'P1-m1',
      number: 1,
      attributes: {
        time: { beats: 3, beatType: 4 },
        clefs: { '1': { sign: 'G', line: 2 } },
      },
      voices: [{
        id: 'P1-v1',
        number: 1,
        staff: 1,
        events: [{
          id: 'P1-note',
          type: 'note',
          staff: 1,
          startQuarterNotes: 0,
          duration: { quarterNotes: 1 },
          pitches: [{ step: 'C', octave: 5 }],
          lyrics: [{ number: '1', text: 'O', syllabic: 'single' }],
        }],
      }],
    };
    const pianoMeasure: StandardNotationMeasure = {
      id: 'P2-m1',
      number: 1,
      attributes: {
        staves: 2,
        time: { beats: 3, beatType: 4 },
        clefs: {
          '1': { sign: 'G', line: 2 },
          '2': { sign: 'F', line: 4 },
        },
      },
      voices: [1, 2].map(staff => ({
        id: `P2-v${staff}`,
        number: staff,
        staff,
        events: [{
          id: `P2-note-${staff}`,
          type: 'note',
          staff,
          startQuarterNotes: 0,
          duration: { quarterNotes: 3 },
          pitches: [{ step: staff === 1 ? 'E' : 'C', octave: staff === 1 ? 4 : 3 }],
        }],
      })),
    };
    const document = {
      schemaVersion: '1.2',
      metadata: { sheetType: 'standard-notation' },
      parts: [
        { id: 'P1', measures: [vocalMeasure] },
        { id: 'P2', measures: [pianoMeasure] },
      ],
    } as unknown as EasyScoreDocument;
    const snapshot = JSON.stringify(document);

    const [measure] = getNotationMeasures(document);

    expect(measure.staffGroups).toEqual([[1], [2, 3]]);
    expect(measure.attributes?.clefs).toEqual({
      '1': { sign: 'G', line: 2 },
      '2': { sign: 'G', line: 2 },
      '3': { sign: 'F', line: 4 },
    });
    expect(measure.voices?.map(voice => voice.staff)).toEqual([1, 2, 3]);
    expect(measure.voices?.flatMap(voice => voice.events ?? []).map(event => event.staff))
      .toEqual([1, 2, 3]);
    expect(buildNotationTimeline(document)[0].events.filter(event => event.kind === 'note'))
      .toHaveLength(3);
    expect(JSON.stringify(document)).toBe(snapshot);
  });
});
