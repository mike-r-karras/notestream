import {
  tickToElapsedMs,
  type NotationPlaybackModel,
} from './playbackModel';

export type ScheduledMetronomeBeat = {
  id: string;
  elapsedMs: number;
  measure: number;
  beat: number;
  accent: boolean;
};

export function buildMetronomeSchedule(
  model: NotationPlaybackModel,
  bpm: number
): ScheduledMetronomeBeat[] {
  return model.beats.map(beat => ({
    id: `${beat.tick}:${beat.measure}:${beat.beat}`,
    elapsedMs: tickToElapsedMs(model, beat.tick, bpm),
    measure: beat.measure,
    beat: beat.beat,
    accent: beat.accent,
  }));
}

export function metronomeBeatsInWindow(
  schedule: readonly ScheduledMetronomeBeat[],
  startMs: number,
  endMs: number
): ScheduledMetronomeBeat[] {
  return schedule.filter(beat =>
    beat.elapsedMs >= startMs && beat.elapsedMs <= endMs
  );
}
