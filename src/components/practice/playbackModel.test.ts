import { describe, expect, it } from 'vitest';
import type { EasyScoreDocument } from '../../types/easyScore';
import {
  activeNoteIdsAtTick,
  beatsCrossed,
  buildNotationPlaybackModel,
  elapsedMsToTick,
  tickToElapsedMs,
} from './playbackModel';
import { buildNotationTimeline } from './notation/timeline';

type TestEvent = {
  id: string;
  type: 'note' | 'rest';
  staff: number;
  voice: number;
  startQuarterNotes: number;
  duration: { quarterNotes: number; vexflow: string };
  pitches?: Array<{ step: string; octave: number; alter?: number }>;
};

function event(
  id: string,
  startQuarterNotes: number,
  durationQuarterNotes: number,
  staff = 1,
  voice = 1,
  type: 'note' | 'rest' = 'note',
  pitchCount = 1
): TestEvent {
  return {
    id,
    type,
    staff,
    voice,
    startQuarterNotes,
    duration: {
      quarterNotes: durationQuarterNotes,
      vexflow: durationQuarterNotes <= 0.25 ? '16' : '8',
    },
    ...(type === 'note'
      ? {
          pitches: Array.from({ length: pitchCount }, (_, index) => ({
            step: index === 0 ? 'C' : 'E',
            octave: 4,
          })),
        }
      : {}),
  };
}

function score(measures: unknown[]): EasyScoreDocument {
  return {
    schemaVersion: '1.2',
    metadata: { sheetType: 'standard-notation' },
    parts: [{ id: 'P1', measures }],
  } as unknown as EasyScoreDocument;
}

describe('buildNotationPlaybackModel', () => {
  it('derives 4/4 beats and accents from EasyScore measure attributes', () => {
    const model = buildNotationPlaybackModel(score([{
      id: 'P1-m1',
      number: 1,
      attributes: { time: { beats: 4, beatType: 4 } },
      voices: [{ staff: 1, number: 1, events: [event('whole', 0, 4)] }],
    }]));

    expect(model.totalTicks).toBe(1920);
    expect(model.beats.map(beat => beat.tick)).toEqual([0, 480, 960, 1440]);
    expect(model.beats.map(beat => beat.accent)).toEqual([true, false, false, false]);
  });

  it('uses eighth-note beats in 3/8 and retains a sixteenth between beats', () => {
    const model = buildNotationPlaybackModel(score([{
      id: 'P1-m16',
      number: 16,
      attributes: { time: { beats: 3, beatType: 8 } },
      voices: [{
        staff: 1,
        number: 1,
        events: [
          event('first', 0, 0.5),
          event('P1-m16-s1-v1-e2', 1.25, 0.25),
        ],
      }],
    }]));

    expect(model.totalTicks).toBe(720);
    expect(model.beats.map(beat => beat.tick)).toEqual([0, 240, 480]);
    expect(model.notes[1]).toMatchObject({
      id: 'P1-m16::P1-m16-s1-v1-e2',
      startTick: 600,
      durationTicks: 120,
    });
    expect(activeNoteIdsAtTick(model.notes, 600)).toEqual(
      new Set(['P1-m16::P1-m16-s1-v1-e2'])
    );
    expect(activeNoteIdsAtTick(model.notes, 720)).toEqual(new Set());
  });

  it('right-aligns an underfilled opening measure as a pickup', () => {
    const document = score([{
      id: 'P1-m1',
      number: 1,
      attributes: { time: { beats: 3, beatType: 8 } },
      voices: [{
        staff: 1,
        number: 1,
        events: [
          event('pickup-1', 0, 0.25),
          event('pickup-2', 0.25, 0.25),
        ],
      }],
    }]);
    const model = buildNotationPlaybackModel(document);
    const timeline = buildNotationTimeline(document);

    expect(model.totalTicks).toBe(720);
    expect(model.beats.map(beat => beat.tick)).toEqual([0, 240, 480]);
    expect(model.notes.map(note => [note.id, note.startTick])).toEqual([
      ['P1-m1::pickup-1', 480],
      ['P1-m1::pickup-2', 600],
    ]);
    expect(model.tones.map(tone => tone.startTick)).toEqual([480, 600]);
    expect(
      timeline[0].events
        .filter(event => event.kind === 'note')
        .map(event => [event.id, event.startTick])
    ).toEqual([
      ['P1-m1::pickup-1', 480],
      ['P1-m1::pickup-2', 600],
    ]);
  });

  it('does not shift a complete opening measure containing a leading rest', () => {
    const model = buildNotationPlaybackModel(score([{
      id: 'P1-m1',
      number: 1,
      attributes: { time: { beats: 3, beatType: 8 } },
      voices: [{
        staff: 1,
        number: 1,
        events: [
          event('leading-rest', 0, 1, 1, 1, 'rest'),
          event('final-1', 1, 0.25),
          event('final-2', 1.25, 0.25),
        ],
      }],
    }]));

    expect(model.totalTicks).toBe(720);
    expect(model.notes.map(note => [note.id, note.startTick])).toEqual([
      ['P1-m1::final-1', 480],
      ['P1-m1::final-2', 600],
    ]);
  });

  it('does not force a short declared measure to one quarter note', () => {
    const model = buildNotationPlaybackModel(score([{
      number: 1,
      attributes: { time: { beats: 1, beatType: 8 } },
      voices: [{ staff: 1, number: 1, events: [event('eighth', 0, 0.5)] }],
    }]));

    expect(model.totalTicks).toBe(240);
    expect(model.beats.map(beat => beat.tick)).toEqual([0]);
  });

  it('includes chords and simultaneous hands and voices but excludes rests', () => {
    const model = buildNotationPlaybackModel(score([{
      number: 1,
      attributes: { time: { beats: 4, beatType: 4 } },
      voices: [
        {
          staff: 1,
          number: 1,
          events: [event('right-chord', 0.25, 0.5, 1, 1, 'note', 2)],
        },
        {
          staff: 1,
          number: 2,
          events: [event('right-voice-2', 0.25, 0.25, 1, 2)],
        },
        {
          staff: 2,
          number: 5,
          events: [
            event('left-hand', 0.25, 1, 2, 5),
            event('silent-rest', 1.25, 2.75, 2, 5, 'rest'),
          ],
        },
      ],
    }]));

    expect(activeNoteIdsAtTick(model.notes, 120)).toEqual(
      new Set([
        'notation-measure-1::right-chord',
        'notation-measure-1::right-voice-2',
        'notation-measure-1::left-hand',
      ])
    );
    expect(model.notes.some(note => note.id.endsWith('silent-rest'))).toBe(false);
    expect(model.tones.map(tone => tone.midiNote)).toEqual([60, 64, 60, 60]);
  });

  it('converts accidentals to MIDI and merges tied pitches without retriggering', () => {
    const tiedStart = {
      ...event('tie-start', 0, 1),
      pitches: [{ step: 'F', octave: 4, alter: 1 }],
      pitchNotations: [{ ties: [{ type: 'start' }] }],
    };
    const tiedStop = {
      ...event('tie-stop', 0, 1),
      pitches: [{ step: 'F', octave: 4, alter: 1 }],
      pitchNotations: [{ ties: [{ type: 'stop' }] }],
    };
    const model = buildNotationPlaybackModel(score([
      {
        number: 1,
        attributes: { time: { beats: 1, beatType: 4 } },
        voices: [{ staff: 1, number: 1, events: [tiedStart] }],
      },
      {
        number: 2,
        attributes: {},
        voices: [{ staff: 1, number: 1, events: [tiedStop] }],
      },
    ]));

    expect(model.tones).toEqual([{
      id: 'notation-measure-1::tie-start-pitch-0',
      midiNote: 66,
      startTick: 0,
      durationTicks: 960,
    }]);
  });

  it('inherits signatures and applies a later time-signature change', () => {
    const model = buildNotationPlaybackModel(score([
      {
        number: 1,
        attributes: { time: { beats: 4, beatType: 4 } },
        voices: [{ staff: 1, number: 1, events: [event('m1', 0, 4)] }],
      },
      {
        number: 2,
        attributes: {},
        voices: [{ staff: 1, number: 1, events: [event('m2', 0, 4)] }],
      },
      {
        number: 3,
        attributes: { time: { beats: 3, beat_type: 8 } },
        voices: [{ staff: 1, number: 1, events: [event('m3', 0, 1.5)] }],
      },
    ]));

    expect(model.measures.map(measure => [measure.beats, measure.beatType])).toEqual([
      [4, 4],
      [4, 4],
      [3, 8],
    ]);
    expect(model.beats.slice(-3).map(beat => beat.tick)).toEqual([3840, 4080, 4320]);
  });
});

describe('transport projections', () => {
  const model = buildNotationPlaybackModel(score([
    {
      number: 1,
      attributes: { time: { beats: 4, beatType: 4 } },
      voices: [{ staff: 1, number: 1, events: [event('m1', 0, 4)] }],
    },
    {
      number: 2,
      attributes: { time: { beats: 3, beatType: 8 } },
      voices: [{ staff: 1, number: 1, events: [event('m2', 0, 1.5)] }],
    },
  ]));

  it('maps monotonic elapsed time across changing beat units', () => {
    expect(tickToElapsedMs(model, 1920, 120)).toBe(2000);
    expect(tickToElapsedMs(model, model.totalTicks, 120)).toBe(3500);
    expect(elapsedMsToTick(model, 2250, 120)).toBe(2040);
    expect(elapsedMsToTick(model, 3500, 120)).toBe(model.totalTicks);
  });

  it('returns every beat crossed by a delayed animation frame', () => {
    expect(beatsCrossed(model, 100, 1100).map(beat => beat.tick)).toEqual([480, 960]);
    expect(beatsCrossed(model, 0, 10, true).map(beat => beat.tick)).toEqual([0]);
  });
});
