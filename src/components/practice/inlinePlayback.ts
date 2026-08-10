import type { EasyScoreDocument } from '../../types/easyScore';
import { readBeatType } from './notation/scoreModel';
import { getNotationMeasures } from './notation/timeline';
import type { StandardNotationMeasure } from './notation/types';
import type { PlaybackSequence } from './playbackResolver';

/**
 * Builds a source-derived display document in playback order. Every occurrence
 * gets a compound render identity while retaining its canonical source ID in
 * playbackPresentation. The input document and its measures are never mutated.
 */
export function buildInlinePlaybackDocument(
  document: EasyScoreDocument,
  sequence: PlaybackSequence
): EasyScoreDocument {
  if (!sequence.hasRepeats) return document;

  const sourceMeasures = getNotationMeasures(document);
  const metadataTime = document.metadata?.timeSignature;
  let inheritedBeats = metadataTime?.[0] ?? 4;
  let inheritedBeatType = metadataTime?.[1] ?? 4;
  const sourceTimes = sourceMeasures.map(measure => {
    inheritedBeats = measure.attributes?.time?.beats ?? inheritedBeats;
    inheritedBeatType = measure.attributes?.time
      ? readBeatType(measure.attributes.time)
      : inheritedBeatType;
    return { beats: inheritedBeats, beatType: inheritedBeatType };
  });

  const virtualMeasures: StandardNotationMeasure[] = sequence.measures.map(entry => {
    const source = sourceMeasures[entry.sourceMeasureIndex];
    const sourceMeasureId = source.id ?? `notation-measure-${entry.writtenMeasureNumber}`;
    const occurrenceId = `${sourceMeasureId}--playback-${entry.playbackIndex}`;
    const time = sourceTimes[entry.sourceMeasureIndex];

    return {
      ...source,
      id: occurrenceId,
      attributes: {
        ...source.attributes,
        time: {
          beats: time.beats,
          beatType: time.beatType,
        },
      },
      voices: (source.voices ?? []).map((voice, voiceIndex) => ({
        ...voice,
        id: `${voice.id ?? `${sourceMeasureId}-voice-${voiceIndex}`}--playback-${entry.playbackIndex}`,
        events: (voice.events ?? []).map((event, eventIndex) => ({
          ...event,
          id: `${event.id ?? `${sourceMeasureId}-event-${eventIndex}`}--playback-${entry.playbackIndex}`,
        })),
      })),
      barlines: source.barlines?.map(barline => ({
        ...barline,
        ending: barline.ending ? { ...barline.ending } : undefined,
        repeat: barline.repeat ? { ...barline.repeat } : undefined,
      })),
      playbackPresentation: {
        playbackIndex: entry.playbackIndex,
        repeatPass: entry.repeatPass,
        sourceMeasureId,
        sourceMeasureIndex: entry.sourceMeasureIndex,
        ghostRepeatSigns: (source.barlines ?? []).some(barline => !!barline.repeat),
      },
    };
  });

  const parts = [...(document.parts ?? [])];
  if (parts.length === 0) return document;
  parts[0] = {
    ...parts[0],
    measures: virtualMeasures,
  } as typeof parts[number];

  return { ...document, parts };
}
