import type {
  BeatPosition,
  ChordLyricMeasure,
  ChordLyricSection,
  EasyScoreDocument,
  LyricCue,
} from '../../types/easyScore';
import type { PracticeEvent, PracticeSegment } from '../../utils/practiceTimeline';

export const TICKS_PER_QUARTER = 480;
export const DEFAULT_CHORD_MEASURE_WIDTH = 270;
export const DEFAULT_CHORD_BEAT_WIDTH = DEFAULT_CHORD_MEASURE_WIDTH / 4;
export const INLINE_CHORD_BOX_WIDTH = 74;
const MIN_LABEL_GAP = 12;

export interface ChordLyricsSegmentPayload extends ChordLyricMeasure {
  sectionId: string;
  sectionLabel: string | null;
  showChordBox: boolean;
  chordBoxSymbol: string;
  lyricCues: LyricCue[];
  beatTicks: number;
  beatWidths: number[];
  beatPositions: number[];
}

export function beatPositionToNumber(position: BeatPosition | undefined): number {
  if (typeof position === 'number') return position;
  if (!position) return 0;
  return position.denominator > 0
    ? position.numerator / position.denominator
    : 0;
}

export function beatUnitTicks(timeSignature: [number, number] | undefined): number {
  const denominator = timeSignature?.[1] ?? 4;
  return TICKS_PER_QUARTER * 4 / denominator;
}

export function beatPositionX(
  position: BeatPosition | undefined,
  width: number,
  beats: number
): number {
  const beat = Math.max(0, Math.min(beats - 1, beatPositionToNumber(position)));
  return (beat + 0.5) * width / beats;
}

export function beatPositionXFromWidths(
  position: BeatPosition | undefined,
  beatWidths: number[]
): number {
  if (beatWidths.length === 0) return 0;
  const numericPosition = Math.max(0, Math.min(beatWidths.length - 1, beatPositionToNumber(position)));
  const beatIndex = Math.floor(numericPosition);
  const fraction = numericPosition - beatIndex;
  const leadingWidth = beatWidths.slice(0, beatIndex).reduce((sum, width) => sum + width, 0);
  return leadingWidth + beatWidths[beatIndex] * (0.5 + fraction);
}

export function beatPositionXFromPositions(
  position: BeatPosition | undefined,
  beatPositions: number[]
): number {
  if (beatPositions.length === 0) return 0;
  const numericPosition = Math.max(0, Math.min(beatPositions.length - 1, beatPositionToNumber(position)));
  const beatIndex = Math.floor(numericPosition);
  const fraction = numericPosition - beatIndex;
  const current = beatPositions[beatIndex];
  const next = beatPositions[beatIndex + 1];
  return next === undefined ? current : current + (next - current) * fraction;
}

function estimatedTextWidth(text: string, pixelsPerCharacter: number): number {
  return Math.max(1, text.trim().length) * pixelsPerCharacter;
}

function widthForPositionedLabels(
  labels: Array<{ beat: BeatPosition | undefined; width: number }>,
  beats: number,
  centered: boolean
): number {
  const ordered = labels
    .map(label => ({ ...label, position: beatPositionToNumber(label.beat) }))
    .sort((a, b) => a.position - b.position);
  let requiredWidth = DEFAULT_CHORD_MEASURE_WIDTH;

  ordered.forEach((label, index) => {
    const next = ordered[index + 1];
    if (next && next.position > label.position) {
      const requiredDistance = centered
        ? label.width / 2 + next.width / 2 + MIN_LABEL_GAP
        : label.width + MIN_LABEL_GAP;
      requiredWidth = Math.max(
        requiredWidth,
        requiredDistance * beats / (next.position - label.position)
      );
    }

    const remainingFraction = Math.max(0.125, (beats - label.position - 0.5) / beats);
    const trailingWidth = centered ? label.width / 2 : label.width;
    requiredWidth = Math.max(requiredWidth, (trailingWidth + MIN_LABEL_GAP) / remainingFraction);
  });

  return requiredWidth;
}

export function preferredChordLyricsMeasureWidth(
  measure: Pick<ChordLyricMeasure, 'beats' | 'chords' | 'lyricCues' | 'lyrics'>,
  defaultBeats = 4
): number {
  const beats = measure.beats || defaultBeats;
  const lyricCues = measure.lyricCues ?? measure.lyrics ?? [];
  const lyricWidth = widthForPositionedLabels(
    lyricCues.map(cue => ({ beat: cue.beat, width: estimatedTextWidth(cue.text, 7.5) })),
    beats,
    false
  );
  const chordWidth = widthForPositionedLabels(
    (measure.chords ?? [])
      .filter(chord => chord.printed !== false)
      .map(chord => ({ beat: chord.beat, width: estimatedTextWidth(chord.symbol, 9) })),
    beats,
    true
  );

  return Math.ceil(Math.max(DEFAULT_CHORD_MEASURE_WIDTH, lyricWidth, chordWidth));
}

export function chordLyricsBeatWidths(
  measure: Pick<ChordLyricMeasure, 'beats' | 'chords' | 'lyricCues' | 'lyrics'>,
  defaultBeats = 4
): number[] {
  const beats = measure.beats || defaultBeats;
  const normalBeatWidth = DEFAULT_CHORD_BEAT_WIDTH * 4 / beats;
  const widths = Array.from({ length: beats }, () => normalBeatWidth);
  const chordPositions = (measure.chords ?? [])
    .filter(chord => chord.printed !== false)
    .map(chord => beatPositionToNumber(chord.beat))
    .sort((a, b) => a - b);

  chordPositions.forEach((position, index) => {
    const next = chordPositions[index + 1];
    const previous = chordPositions[index - 1];
    if ((next !== undefined && next - position <= 1) ||
        (previous !== undefined && position - previous <= 1)) {
      const beatIndex = Math.min(beats - 1, Math.floor(position));
      widths[beatIndex] = Math.max(widths[beatIndex], INLINE_CHORD_BOX_WIDTH + MIN_LABEL_GAP);
    }
  });

  return widths;
}

export function chordLyricsBeatLayout(
  measure: Pick<ChordLyricMeasure, 'beats' | 'chords' | 'lyricCues' | 'lyrics'>,
  defaultBeats = 4
): { beatWidths: number[]; beatPositions: number[]; width: number } {
  const beats = measure.beats || defaultBeats;
  const beatWidths = chordLyricsBeatWidths(measure, beats);
  const beatPositions: number[] = [];
  let width = 0;
  beatWidths.forEach(beatWidth => {
    beatPositions.push(width + beatWidth / 2);
    width += beatWidth;
  });

  const lyricCues = [...(measure.lyricCues ?? measure.lyrics ?? [])]
    .sort((a, b) => beatPositionToNumber(a.beat) - beatPositionToNumber(b.beat));
  for (let index = 1; index < lyricCues.length; index += 1) {
    const previous = lyricCues[index - 1];
    const current = lyricCues[index];
    const previousX = beatPositionXFromPositions(previous.beat, beatPositions);
    const currentX = beatPositionXFromPositions(current.beat, beatPositions);
    const minimumCurrentX = previousX + estimatedTextWidth(previous.text, 7.5) + DEFAULT_CHORD_BEAT_WIDTH;
    const extra = Math.max(0, minimumCurrentX - currentX);
    if (extra > 0) {
      const firstShiftedBeat = Math.ceil(beatPositionToNumber(current.beat));
      for (let beat = firstShiftedBeat; beat < beatPositions.length; beat += 1) {
        beatPositions[beat] += extra;
      }
      width += extra;
    }
  }

  const lastCue = lyricCues[lyricCues.length - 1];
  if (lastCue) {
    const lastCueEnd = beatPositionXFromPositions(lastCue.beat, beatPositions)
      + estimatedTextWidth(lastCue.text, 7.5);
    // The following measure's first beat contributes the other half of the
    // normal inter-lyric gap. Adding a full beat here double-spaces phrases
    // that cross a barline.
    width = Math.max(width, lastCueEnd + DEFAULT_CHORD_BEAT_WIDTH / 2);
  }

  return { beatWidths, beatPositions, width };
}

export function activeChordBeatIndex(
  currentTick: number,
  segment: Pick<PracticeSegment, 'startTick' | 'durationTicks'>,
  beats: number
): number | null {
  if (
    currentTick < segment.startTick ||
    currentTick >= segment.startTick + segment.durationTicks
  ) {
    return null;
  }
  const beatTicks = segment.durationTicks / beats;
  return Math.min(beats - 1, Math.floor((currentTick - segment.startTick) / beatTicks));
}

export function buildChordLyricsTimeline(document: EasyScoreDocument): PracticeSegment[] {
  const sections: ChordLyricSection[] = document.chordLyrics ?? document.sections ?? [];
  const segments: PracticeSegment[] = [];
  const beatTicks = beatUnitTicks(document.metadata.timeSignature);
  let lastChordSymbol = '';

  sections.forEach(section => {
    section.measures.forEach((measure, measureIndex) => {
      const beats = measure.beats || document.metadata.timeSignature?.[0] || 4;
      const durationTicks = beats * beatTicks;
      const startTick = segments.length
        ? segments[segments.length - 1].startTick + segments[segments.length - 1].durationTicks
        : 0;
      const chordBoxSymbol = measure.effectiveChord ?? measure.chords?.[0]?.symbol ?? lastChordSymbol;
      const showChordBox = !!chordBoxSymbol && chordBoxSymbol !== lastChordSymbol;
      if (chordBoxSymbol) lastChordSymbol = chordBoxSymbol;

      const lyricCues: LyricCue[] = measure.lyricCues ?? measure.lyrics?.map((lyric, index) => ({
        id: lyric.id ?? `${measure.id}-legacy-lyric-${index + 1}`,
        beat: lyric.beat ?? 0,
        text: lyric.text,
        role: 'normal',
      })) ?? [];
      const beatLayout = chordLyricsBeatLayout(measure, beats);
      const events: PracticeEvent[] = [{
        id: `${measure.id}-event`,
        startTick,
        durationTicks,
        measure: measure.number,
        kind: 'measure',
        sourceIds: [measure.id],
      }];

      measure.chords?.forEach((chord, index) => {
        const chordBeat = beatPositionToNumber(chord.beat);
        const nextChord = measure.chords?.[index + 1];
        const durationBeats = chord.durationBeats ?? (
          nextChord ? beatPositionToNumber(nextChord.beat) - chordBeat : beats - chordBeat
        );
        events.push({
          id: chord.id,
          startTick: startTick + chordBeat * beatTicks,
          durationTicks: Math.max(0, durationBeats) * beatTicks,
          measure: measure.number,
          beat: chordBeat,
          kind: 'chord',
          sourceIds: [chord.id],
        });
      });

      lyricCues.forEach(cue => {
        const cueBeat = beatPositionToNumber(cue.beat);
        events.push({
          id: cue.id,
          startTick: startTick + cueBeat * beatTicks,
          durationTicks: beatTicks,
          measure: measure.number,
          beat: cueBeat,
          kind: 'lyric',
          sourceIds: cue.sourceRef?.wordIds ?? [cue.id],
        });
      });

      const payload: ChordLyricsSegmentPayload = {
        ...measure,
        beats,
        sectionId: section.id,
        sectionLabel: measureIndex === 0 ? section.label : null,
        showChordBox,
        chordBoxSymbol,
        lyricCues,
        beatTicks,
        beatWidths: beatLayout.beatWidths,
        beatPositions: beatLayout.beatPositions,
      };
      segments.push({
        id: measure.id,
        startTick,
        durationTicks,
        preferredWidth: beatLayout.width,
        events,
        payload,
      });
    });
  });

  return segments;
}
