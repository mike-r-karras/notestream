import type { EasyScoreDocument, InstrumentConfig } from '../../types/easyScore';
import type {
  NotationPlaybackModel,
  PlaybackToneEvent,
} from './playbackModel';
import {
  beatPositionToNumber,
  buildChordLyricsTimeline,
} from './chordLyricsModel';

const PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function namedPitchToMidi(pitch: string): number | undefined {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(pitch.trim());
  if (!match) return undefined;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const midi = (Number(match[3]) + 1) * 12 + PITCH_CLASS[match[1].toUpperCase()] + accidental;
  return Number.isInteger(midi) && midi >= 0 && midi <= 127 ? midi : undefined;
}

function chordAtBeat(
  initialChord: string,
  changes: Array<{ beat: number; symbol: string }>,
  beat: number
): string {
  return changes.reduce(
    (active, change) => change.beat <= beat ? change.symbol : active,
    initialChord
  );
}

export function buildChordLyricsPlaybackModel(
  document: EasyScoreDocument,
  instrument: InstrumentConfig | null
): NotationPlaybackModel {
  const segments = buildChordLyricsTimeline(document);
  const measures: NotationPlaybackModel['measures'] = [];
  const beats: NotationPlaybackModel['beats'] = [];
  const tones: PlaybackToneEvent[] = [];
  let carriedChord = '';

  segments.forEach((segment, sourceMeasureIndex) => {
    const payload = segment.payload as {
      beats: number;
      beatTicks: number;
      effectiveChord?: string;
      chords?: Array<{ beat: number | { numerator: number; denominator: number }; symbol: string }>;
      number: number;
    };
    const changes = (payload.chords ?? [])
      .map(change => ({ beat: beatPositionToNumber(change.beat), symbol: change.symbol }))
      .sort((a, b) => a.beat - b.beat);
    const initialChord = payload.effectiveChord ?? carriedChord;
    const measureNumber = payload.number ?? sourceMeasureIndex + 1;

    measures.push({
      number: measureNumber,
      sourceMeasureIndex,
      startTick: segment.startTick,
      durationTicks: segment.durationTicks,
      beats: payload.beats,
      beatType: Math.round(1920 / payload.beatTicks),
      beatTicks: payload.beatTicks,
    });

    for (let beat = 0; beat < payload.beats; beat += 1) {
      const tick = segment.startTick + beat * payload.beatTicks;
      beats.push({ tick, measure: measureNumber, beat, accent: beat === 0 });
      const symbol = chordAtBeat(initialChord, changes, beat);
      (instrument?.chordTones?.[symbol] ?? []).forEach((pitch, toneIndex) => {
        const midiNote = namedPitchToMidi(pitch);
        if (midiNote === undefined) return;
        tones.push({
          id: `${segment.id}-beat-${beat}-${symbol}-tone-${toneIndex}`,
          midiNote,
          startTick: tick,
          durationTicks: payload.beatTicks,
          staff: 1,
        });
      });
    }

    if (changes.length > 0) carriedChord = changes[changes.length - 1].symbol;
    else if (payload.effectiveChord) carriedChord = payload.effectiveChord;
  });

  const totalTicks = segments.length === 0
    ? 0
    : segments[segments.length - 1].startTick + segments[segments.length - 1].durationTicks;
  return { measures, notes: [], tones, beats, totalTicks };
}
