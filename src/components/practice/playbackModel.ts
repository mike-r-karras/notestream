import type { EasyScoreDocument } from '../../types/easyScore';
import {
  eventDurationQuarter,
  eventIsSounding,
  eventStartQuarter,
  getContextualMeasureQuarterNotes,
  readBeatType,
} from './notation/scoreModel';
import {
  getNotationMeasures,
  notationEventId,
  TICKS_PER_QUARTER,
} from './notation/timeline';
import type { PlaybackSequence } from './playbackResolver';

export type PlaybackNoteEvent = {
  id: string;
  startTick: number;
  durationTicks: number;
  staff: number;
  voice: number;
};

export type PlaybackToneEvent = {
  id: string;
  midiNote: number;
  startTick: number;
  durationTicks: number;
};

export type PlaybackBeatEvent = {
  tick: number;
  measure: number;
  beat: number;
  accent: boolean;
};

export type PlaybackMeasure = {
  number: number;
  sourceMeasureIndex: number;
  startTick: number;
  durationTicks: number;
  beats: number;
  beatType: number;
  beatTicks: number;
};

export type NotationPlaybackModel = {
  measures: PlaybackMeasure[];
  notes: PlaybackNoteEvent[];
  tones: PlaybackToneEvent[];
  beats: PlaybackBeatEvent[];
  totalTicks: number;
};

export type PlaybackPosition = {
  measure: PlaybackMeasure;
  offsetTicks: number;
};

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

const PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function pitchToMidi(pitch: {
  step?: string;
  octave?: number;
  alter?: number;
}): number | undefined {
  const pitchClass = pitch.step ? PITCH_CLASS[pitch.step.toUpperCase()] : undefined;
  if (pitchClass === undefined || !Number.isInteger(pitch.octave)) return undefined;
  const midi = (pitch.octave! + 1) * 12 + pitchClass + (pitch.alter ?? 0);
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return undefined;
  return midi;
}

function playbackMeasureQuarterNotes(
  measure: ReturnType<typeof getNotationMeasures>[number],
  measures: ReturnType<typeof getNotationMeasures>,
  measureIndex: number
): number {
  const duration = getContextualMeasureQuarterNotes(measures, measureIndex);
  return duration > 0 ? duration : 1;
}

export function buildNotationPlaybackModel(
  document: EasyScoreDocument,
  sequence?: PlaybackSequence
): NotationPlaybackModel {
  const sourceMeasures = getNotationMeasures(document);
  const metadataTime = document.metadata?.timeSignature;
  let inheritedBeats = positiveInteger(metadataTime?.[0]) ?? 4;
  let inheritedBeatType = positiveInteger(metadataTime?.[1]) ?? 4;
  const sourceTimes = sourceMeasures.map(measure => {
    const declaredTime = measure.attributes?.time;
    inheritedBeats = positiveInteger(declaredTime?.beats) ?? inheritedBeats;
    inheritedBeatType = declaredTime
      ? readBeatType(declaredTime)
      : inheritedBeatType;
    return { beats: inheritedBeats, beatType: inheritedBeatType };
  });
  const playbackOrder = sequence?.measures.map(entry => entry.sourceMeasureIndex)
    ?? sourceMeasures.map((_, index) => index);
  let startTick = 0;
  const measures: PlaybackMeasure[] = [];
  const notes: PlaybackNoteEvent[] = [];
  const tones: PlaybackToneEvent[] = [];
  const openTies = new Map<string, PlaybackToneEvent>();
  const beats: PlaybackBeatEvent[] = [];

  let previousContinuityIndex: number | undefined;
  playbackOrder.forEach((sourceMeasureIndex, playbackIndex) => {
    const measure = sourceMeasures[sourceMeasureIndex];
    if (!measure) return;
    const {
      beats: measureBeats,
      beatType: measureBeatType,
    } = sourceTimes[sourceMeasureIndex];

    const continuityIndex = measure.playbackPresentation?.sourceMeasureIndex
      ?? sourceMeasureIndex;
    if (
      previousContinuityIndex !== undefined &&
      continuityIndex !== previousContinuityIndex + 1
    ) {
      openTies.clear();
    }
    previousContinuityIndex = continuityIndex;

    const durationTicks = Math.max(
      1,
      Math.round(
        playbackMeasureQuarterNotes(
          measure,
          sourceMeasures,
          sourceMeasureIndex
        ) * TICKS_PER_QUARTER
      )
    );
    const beatTicks = TICKS_PER_QUARTER * (4 / measureBeatType);
    const measureNumber = measure.number ?? sourceMeasureIndex + 1;
    measures.push({
      number: measureNumber,
      sourceMeasureIndex,
      startTick,
      durationTicks,
      beats: measureBeats,
      beatType: measureBeatType,
      beatTicks,
    });

    for (let beat = 0; beat < measureBeats; beat += 1) {
      const tick = startTick + Math.round(beat * beatTicks);
      if (tick < startTick + durationTicks) {
        beats.push({
          tick,
          measure: measureNumber,
          beat,
          accent: beat === 0,
        });
      }
    }

    for (const sourceVoice of measure.voices ?? []) {
      for (const event of sourceVoice.events ?? []) {
        if (!eventIsSounding(event)) continue;
        const eventId = notationEventId(
          measure.id ?? `notation-measure-${measureNumber}`,
          sourceVoice,
          event
        );
        const eventStartTick =
          startTick + Math.round(
          eventStartQuarter(event) *
              TICKS_PER_QUARTER
          );
        const eventDurationTicks = Math.max(
          1,
          Math.round(eventDurationQuarter(event) * TICKS_PER_QUARTER)
        );
        const staff = event.staff ?? sourceVoice.staff ?? 1;
        const voice = event.voice ?? sourceVoice.number ?? 1;
        notes.push({
          id: eventId,
          startTick: eventStartTick,
          durationTicks: eventDurationTicks,
          staff,
          voice,
        });

        (event.pitches ?? []).forEach((pitch, pitchIndex) => {
          const midiNote = pitchToMidi(pitch);
          if (midiNote === undefined) return;
          const tieTypes = new Set(
            (event.pitchNotations?.[pitchIndex]?.ties ?? [])
              .map(tie => tie.type?.toLowerCase())
              .filter(Boolean)
          );
          const tieKey = `${staff}:${voice}:${midiNote}`;
          const existing = openTies.get(tieKey);
          let tone = existing;

          if (tieTypes.has('stop') && existing) {
            existing.durationTicks = Math.max(
              existing.durationTicks,
              eventStartTick + eventDurationTicks - existing.startTick
            );
          } else {
            tone = {
              id: `${eventId}${sequence ? `-playback-${playbackIndex}` : ''}-pitch-${pitchIndex}`,
              midiNote,
              startTick: eventStartTick,
              durationTicks: eventDurationTicks,
            };
            tones.push(tone);
          }

          if (tieTypes.has('start') && tone) {
            openTies.set(tieKey, tone);
          } else {
            openTies.delete(tieKey);
          }
        });
      }
    }

    startTick += durationTicks;
  });

  return { measures, notes, tones, beats, totalTicks: startTick };
}

export function activeNoteIdsAtTick(
  notes: PlaybackNoteEvent[],
  currentTick: number
): Set<string> {
  return new Set(
    notes
      .filter(
        note =>
          note.startTick <= currentTick &&
          currentTick < note.startTick + note.durationTicks
      )
      .map(note => note.id)
  );
}

export function playbackPositionAtTick(
  model: NotationPlaybackModel,
  tick: number
): PlaybackPosition | undefined {
  if (model.measures.length === 0) return undefined;
  const clampedTick = Math.max(0, Math.min(tick, model.totalTicks));
  const measure = model.measures.find(item =>
    clampedTick >= item.startTick &&
    clampedTick < item.startTick + item.durationTicks
  ) ?? model.measures[model.measures.length - 1];

  return {
    measure,
    offsetTicks: Math.max(
      0,
      Math.min(clampedTick - measure.startTick, measure.durationTicks)
    ),
  };
}

export function tickToElapsedMs(
  model: NotationPlaybackModel,
  tick: number,
  bpm: number
): number {
  const safeBpm = Math.max(1, bpm);
  const clampedTick = Math.max(0, Math.min(tick, model.totalTicks));
  let elapsedBeats = 0;

  for (const measure of model.measures) {
    const consumedTicks = Math.max(
      0,
      Math.min(
        clampedTick - measure.startTick,
        measure.durationTicks
      )
    );
    elapsedBeats += consumedTicks / measure.beatTicks;
    if (clampedTick < measure.startTick + measure.durationTicks) break;
  }

  return elapsedBeats * (60_000 / safeBpm);
}

export function elapsedMsToTick(
  model: NotationPlaybackModel,
  elapsedMs: number,
  bpm: number
): number {
  let remainingBeats = Math.max(0, elapsedMs) / (60_000 / Math.max(1, bpm));

  for (const measure of model.measures) {
    const measureBeats = measure.durationTicks / measure.beatTicks;
    if (remainingBeats < measureBeats) {
      return Math.min(
        model.totalTicks,
        measure.startTick + remainingBeats * measure.beatTicks
      );
    }
    remainingBeats -= measureBeats;
  }

  return model.totalTicks;
}

export function beatsCrossed(
  model: NotationPlaybackModel,
  previousTick: number,
  currentTick: number,
  includePrevious = false
): PlaybackBeatEvent[] {
  return model.beats.filter(
    beat =>
      (includePrevious ? beat.tick >= previousTick : beat.tick > previousTick) &&
      beat.tick <= currentTick
  );
}
