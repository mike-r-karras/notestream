import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EasyScoreDocument } from '../../types/easyScore';
import {
  activeNoteIdsAtTick,
  buildNotationPlaybackModel,
} from './playbackModel';
import { resolvePlaybackSequence } from './playbackResolver';

function score(measures: unknown[]): EasyScoreDocument {
  return {
    schemaVersion: '1.2',
    metadata: { sheetType: 'standard-notation' },
    parts: [{ id: 'P1', measures }],
  } as unknown as EasyScoreDocument;
}

function measure(
  number: number,
  options: {
    duration?: number;
    barlines?: unknown[];
  } = {}
) {
  const duration = options.duration ?? 1.5;
  return {
    id: `P1-m${number}`,
    number,
    attributes: { time: { beats: 3, beatType: 8 } },
    voices: [{
      staff: 1,
      number: 1,
      events: [{
        id: `P1-m${number}-event`,
        type: 'note',
        startQuarterNotes: 0,
        duration: { quarterNotes: duration },
        pitches: [{ step: 'C', octave: 4 }],
      }],
    }],
    barlines: options.barlines ?? [],
  };
}

describe('resolvePlaybackSequence', () => {
  it('excludes an opening pickup from an implicit repeat-to-start', () => {
    const document = score([
      measure(0, { duration: 0.5 }),
      measure(1),
      measure(2),
      measure(3, {
        barlines: [{ location: 'right', repeat: { direction: 'backward' } }],
      }),
      measure(4),
    ]);

    expect(
      resolvePlaybackSequence(document).measures.map(entry => entry.writtenMeasureNumber)
    ).toEqual([0, 1, 2, 3, 1, 2, 3, 4]);
  });

  it('uses an explicit forward repeat even when an opening pickup exists', () => {
    const document = score([
      measure(0, { duration: 0.5 }),
      measure(1),
      measure(2, {
        barlines: [{ location: 'left', repeat: { direction: 'forward' } }],
      }),
      measure(3, {
        barlines: [{ location: 'right', repeat: { direction: 'backward' } }],
      }),
    ]);

    expect(
      resolvePlaybackSequence(document).measures.map(entry => entry.writtenMeasureNumber)
    ).toEqual([0, 1, 2, 3, 2, 3]);
  });

  it('plays first and second endings on their applicable passes', () => {
    const document = score([
      measure(1),
      measure(2),
      measure(3, {
        barlines: [
          { location: 'left', ending: { number: '1', type: 'start' } },
          {
            location: 'right',
            ending: { number: '1', type: 'stop' },
            repeat: { direction: 'backward' },
          },
        ],
      }),
      measure(4, {
        barlines: [
          { location: 'left', ending: { number: '2', type: 'start' } },
          { location: 'right', ending: { number: '2', type: 'discontinue' } },
        ],
      }),
      measure(5),
    ]);

    const sequence = resolvePlaybackSequence(document).measures;
    expect(sequence.map(entry => entry.writtenMeasureNumber)).toEqual([
      1, 2, 3, 1, 2, 4, 5,
    ]);
    expect(sequence.map(entry => entry.repeatPass)).toEqual([
      1, 1, 1, 2, 2, 2, 1,
    ]);
  });

  it('matches the supplied Fur Elise pickup and ending sequence', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL('../../../fur-elise-beethoven-for-beginner-piano.ezs', import.meta.url),
        'utf8'
      )
    ) as EasyScoreDocument;
    const written = (fixture.parts?.[0] as unknown as { measures: Array<{ number: number }> })
      .measures.map(item => item.number);
    const sequence = resolvePlaybackSequence(fixture).measures
      .map(entry => entry.writtenMeasureNumber);

    expect(sequence).toEqual([
      0,
      ...written.filter(number => number >= 1 && number <= 8),
      ...written.filter(number => number >= 1 && number <= 7),
      ...written.filter(number => number >= 9),
    ]);
    expect(sequence.filter(number => number === 0)).toHaveLength(1);
    expect(sequence.filter(number => number === 1)).toHaveLength(2);
    expect(sequence.filter(number => number === 8)).toHaveLength(1);
    expect(sequence.filter(number => number === 9)).toHaveLength(1);
  });

  it('drives metronome and note intervals from the resolved sequence', () => {
    const document = score([
      measure(0, { duration: 0.5 }),
      measure(1),
      measure(2, {
        barlines: [{ location: 'right', repeat: { direction: 'backward' } }],
      }),
      measure(3),
    ]);
    const sequence = resolvePlaybackSequence(document);
    const model = buildNotationPlaybackModel(document, sequence);
    const repeatedMeasure = model.measures.filter(item => item.number === 1);
    const repeatedNote = model.notes.filter(note => note.id === 'P1-m1-event');

    expect(model.measures.map(item => item.number)).toEqual([0, 1, 2, 1, 2, 3]);
    expect(model.beats.filter(beat => beat.measure === 1 && beat.accent)).toHaveLength(2);
    expect(repeatedNote).toHaveLength(2);
    expect(activeNoteIdsAtTick(model.notes, repeatedMeasure[0].startTick)).toEqual(
      new Set(['P1-m1-event'])
    );
    expect(activeNoteIdsAtTick(model.notes, repeatedMeasure[1].startTick)).toEqual(
      new Set(['P1-m1-event'])
    );
  });
});
