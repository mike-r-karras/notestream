import {
  tickToElapsedMs,
  type NotationPlaybackModel,
  type PlaybackToneEvent,
} from '../playbackModel';
import { midiToFrequency } from '../audio/detectionConfig';
import type { ExpectedNoteEvent } from './practiceDetectionTypes';

function sourceEventId(tone: PlaybackToneEvent): string {
  return tone.id.replace(/-pitch-\d+$/, '');
}

export function buildExpectedNoteEvents(
  model: NotationPlaybackModel,
  bpm: number
): ExpectedNoteEvent[] {
  const groups = new Map<string, PlaybackToneEvent[]>();
  for (const tone of model.tones) {
    const key = `${tone.startTick}`;
    const group = groups.get(key);
    if (group) group.push(tone);
    else groups.set(key, [tone]);
  }

  return [...groups.values()].map(tones => {
    const first = tones[0];
    const onsetMs = tickToElapsedMs(model, first.startTick, bpm);
    const endMs = Math.max(...tones.map(tone =>
      tickToElapsedMs(model, tone.startTick + tone.durationTicks, bpm)
    ));
    const sourceIds = [...new Set(tones.map(sourceEventId))];
    return {
      eventId: sourceIds.join('+'),
      onsetMs,
      durationMs: Math.max(1, endMs - onsetMs),
      beatDurationMs: 60_000 / Math.max(1, bpm),
      notes: tones.map(tone => ({
        id: tone.id,
        midi: tone.midiNote,
        frequency: midiToFrequency(tone.midiNote),
        onsetMs,
        durationMs: Math.max(
          1,
          tickToElapsedMs(model, tone.startTick + tone.durationTicks, bpm) - onsetMs
        ),
      })),
    };
  }).sort((a, b) => a.onsetMs - b.onsetMs);
}
