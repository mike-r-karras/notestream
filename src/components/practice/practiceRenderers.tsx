import React from 'react';
import { EasyScoreDocument, SheetType, InstrumentConfig } from '../../types/easyScore';
import { detectSheetType } from '../../utils/detectSheetType';
import { PositionedSegment, PracticeSegment } from '../../utils/practiceTimeline';

import { ContinuousNotation } from './notation/ContinuousNotation';
import { StationarySignature } from './notation/StationarySignature';
import { buildNotationTimeline } from './notation/timeline';
import type { RenderedNoteRegistry } from './notation/renderedNoteRegistry';
import type { NoteDetectionResult } from './detection/practiceDetectionTypes';
import { mergeFeedbackKind, noteFeedbackKind } from './detection/feedbackPresentation';
import {
  activeChordBeatIndex,
  activeLyricCueIdsAtTick,
  beatPositionToNumber,
  beatPositionXFromPositions,
  buildChordLyricsTimeline,
  type ChordLyricsSegmentPayload,
} from './chordLyricsModel';

const MIDI_NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function midiNoteLabel(midi: number): string {
  return `${MIDI_NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export interface PracticeRenderContext {
  isPlaying: boolean;
  beatCount: number;
  currentTick: number;
  offsetX: number;
  viewportWidth?: number;
  segments: PositionedSegment[];
  parsedInst?: InstrumentConfig | null;
  onRenderedNotes?: (notes: RenderedNoteRegistry) => void;
  feedbackByBeatId?: ReadonlyMap<string, NoteDetectionResult[]>;
  showMeasureNumbers?: boolean;
}

export interface PracticeRenderer {
  supports(type: SheetType): boolean;

  buildTimeline(
    document: EasyScoreDocument
  ): PracticeSegment[];

  renderSegment(
    segment: PositionedSegment,
    context: PracticeRenderContext
  ): React.ReactNode;

  renderContinuous?(
    document: EasyScoreDocument,
    segments: PositionedSegment[],
    context: PracticeRenderContext
  ): React.ReactNode;

  renderStationaryOverlay?(
    document: EasyScoreDocument,
    segments: PositionedSegment[],
    context: PracticeRenderContext
  ): React.ReactNode;
}

export const chordLyricsPracticeRenderer: PracticeRenderer = {
  supports(type: SheetType): boolean {
    return type === 'chord-lyrics';
  },

  buildTimeline(document: EasyScoreDocument): PracticeSegment[] {
    return buildChordLyricsTimeline(document);
  },

  renderSegment(
    segment: PositionedSegment,
    context: PracticeRenderContext
  ): React.ReactNode {
    const measure = segment.payload as ChordLyricsSegmentPayload;
    if (!measure) return null;

    const { isPlaying, currentTick, offsetX, segments } = context;
    const chordSymbol = measure.chordBoxSymbol;
    const stringLabels = (context.parsedInst?.tuning || ["G", "C", "E", "A"])
      .map((t: string) => t.replace(/\d+/, ""))
      .join(" ");
    const activeBeat = isPlaying
      ? activeChordBeatIndex(currentTick, segment, measure.beats)
      : null;
    const activeLyricIds = isPlaying
      ? activeLyricCueIdsAtTick(currentTick, segment, measure.lyricCues, measure.beatTicks)
      : new Set<string>();

    // 1. Calculate local_x for sticky chordbox if applicable
    let stickyChordBoxNode = null;
    if (chordSymbol && measure.showChordBox) {
      // Find index of this segment in context.segments
      const idx = segments.findIndex(s => s.id === segment.id);
      
      // Find the next segment with showChordBox = true
      const lastSegment = segments[segments.length - 1];
      let nextChordSegmentX = lastSegment
        ? lastSegment.x + lastSegment.width
        : segment.x + segment.width;
      for (let i = idx + 1; i < segments.length; i++) {
        if ((segments[i].payload as ChordLyricsSegmentPayload)?.showChordBox) {
          nextChordSegmentX = segments[i].x;
          break;
        }
      }

      const normalChordLeft = Math.max(
        4,
        beatPositionXFromPositions(0, measure.beatPositions) - 37
      );
      const x_normal = segment.x + normalChordLeft;
      const x_push_limit = nextChordSegmentX - 74 - 12;
      const x_sticky = 12 - offsetX;
      const x_pos = Math.max(x_normal, Math.min(x_sticky, x_push_limit));
      
      // Calculate local_x relative to the segment
      const local_x = x_pos - segment.x;

      stickyChordBoxNode = (
        <div
          key={`sticky-chordbox-${segment.id}`}
          style={{
            position: "absolute",
            left: `${local_x}px`,
            top: "2px",
            width: "74px",
            height: "112px",
            zIndex: 10,
          }}
          className="bg-neutral-950/95 border border-neutral-600 rounded-xl shadow-xl flex flex-col items-center pt-2 pb-0.5 select-none overflow-hidden backdrop-blur-sm"
        >
          {/* Centered Chord Name */}
          <span className="text-[15px] font-extrabold text-indigo-300 leading-none mb-0.5">
            {chordSymbol}
          </span>

          {/* String Labels */}
          <span className="text-[7.5px] font-black text-neutral-300 uppercase tracking-[0.15em] leading-none mb-1 text-center scale-90">
            {stringLabels}
          </span>

          {/* VexChords Canvas Anchor */}
          <div
            className="chord-diagram-container"
            data-chord={chordSymbol}
            style={{ width: "64px", height: "72px" }}
          />
        </div>
      );
    }

    return (
      <div
        key={segment.id}
        style={{ width: `${segment.width}px` }}
        className="h-full shrink-0 relative select-none"
      >
        {/* Section labels stay attached to the top of the viewport. */}
        {measure.sectionLabel && (
          <div className="absolute top-2 left-3 z-30 bg-indigo-950/80 border border-indigo-700 text-[10px] text-indigo-200 font-extrabold tracking-widest px-2 py-0.5 rounded uppercase select-none shadow-sm">
            {measure.sectionLabel}
          </div>
        )}

        <div className="absolute inset-x-0 top-1/2 h-[255px] -translate-y-1/2">
          {/* Top portion spacer */}
          <div className="h-[45px] w-full relative select-none" />

          {/* Middle Portion: Staff Lines & Beat Strum Hash Marks */}
          <svg className="w-full h-[135px]" viewBox={`0 0 ${segment.width} 135`} fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="45" x2={segment.width} y2="45" stroke="var(--theme-staff-muted)" strokeWidth="1" />
          <line x1="0" y1="60" x2={segment.width} y2="60" stroke="var(--theme-staff-muted)" strokeWidth="1" />
          <line x1="0" y1="75" x2={segment.width} y2="75" stroke="var(--theme-staff-muted)" strokeWidth="1" />
          <line x1="0" y1="90" x2={segment.width} y2="90" stroke="var(--theme-staff-muted)" strokeWidth="1" />
          <line x1="0" y1="105" x2={segment.width} y2="105" stroke="var(--theme-staff-muted)" strokeWidth="1" />

          {/* Strum Hash Marks */}
          {Array.from({ length: measure.beats || 4 }).map((_, bIdx) => {
            const x = beatPositionXFromPositions(bIdx, measure.beatPositions);
            const isActiveBeat = activeBeat === bIdx;
            const toneFeedback = context.feedbackByBeatId?.get(`${segment.id}-beat-${bIdx}`) ?? [];
            const feedbackKind = toneFeedback.reduce(
              (kind, note) => mergeFeedbackKind(kind, noteFeedbackKind(note)),
              undefined as ReturnType<typeof noteFeedbackKind> | undefined
            );
            const feedbackColor = feedbackKind
              ? `var(--theme-feedback-${feedbackKind})`
              : undefined;

            return (
              <g key={bIdx} data-feedback-beat={`${segment.id}-beat-${bIdx}`}>
                <line
                  x1={x - 8}
                  y1="98"
                  x2={x + 8}
                  y2="82"
                  stroke={feedbackColor ?? (isActiveBeat ? "var(--theme-playback-beat)" : "var(--theme-playback-idle)")}
                  strokeWidth={feedbackKind || isActiveBeat ? "5" : "3.5"}
                  strokeLinecap="round"
                  style={feedbackKind
                    ? { filter: `drop-shadow(0 0 7px var(--theme-feedback-${feedbackKind}))` }
                    : {
                        filter: isActiveBeat
                          ? 'drop-shadow(0 0 9px var(--theme-playback-beat))'
                          : 'drop-shadow(0 0 2px var(--theme-playback-idle))',
                      }}
                  className="transition-colors duration-100"
                />
                {toneFeedback.length > 0 && (
                  <text x={x} y="124" textAnchor="middle" fontSize="9" fontWeight="700">
                    {toneFeedback.map((note, index) => {
                      const kind = noteFeedbackKind(note);
                      return (
                        <tspan
                          key={note.id}
                          fill={`var(--theme-feedback-${kind})`}
                        >
                          {index > 0 ? ' ' : ''}{midiNoteLabel(note.midi)}
                        </tspan>
                      );
                    })}
                  </text>
                )}
              </g>
            );
          })}

          {/* Right vertical bar line */}
          <line
            x1={segment.width - 0.5}
            y1="45"
            x2={segment.width - 0.5}
            y2="105"
            stroke={segment.id === segments[segments.length - 1]?.id ? "var(--theme-playback-idle)" : "var(--theme-staff-muted)"}
            strokeWidth={segment.id === segments[segments.length - 1]?.id ? "4" : "1"}
          />
          {segment.id === segments[segments.length - 1]?.id && (
            <line x1={segment.width - 9} y1="45" x2={segment.width - 9} y2="105" stroke="var(--theme-playback-idle)" strokeWidth="1" />
          )}
          </svg>

          {/* Bottom Portion: Lyrics */}
          <div className="h-[75px] w-full relative select-none">
          {measure.lyricCues.length > 0 ? measure.lyricCues.map(cue => {
            const isActiveLyric = activeLyricIds.has(cue.id);
            return (
              <span
                key={cue.id}
                data-beat={beatPositionToNumber(cue.beat)}
                className={`absolute top-5 whitespace-nowrap text-[14px] font-semibold tracking-normal leading-snug transition-colors duration-100 ${
                  isActiveLyric
                    ? 'text-sky-300 drop-shadow-[0_0_9px_rgba(125,211,252,1)]'
                    : cue.role === 'pickup' ? 'text-indigo-300 italic' : 'text-neutral-300'
                }`}
                style={{
                  left: beatPositionXFromPositions(cue.beat, measure.beatPositions),
                  transform: 'translateX(-12px)',
                }}
              >
                {cue.text}
              </span>
            );
          }) : (
            <span className="text-[13px] text-neutral-700 italic select-none">...</span>
          )}
          </div>

          {/* Sticky chordbox layer */}
          {stickyChordBoxNode}
          {measure.chords?.filter((chord, index) =>
            chord.printed !== false &&
            !(
              measure.showChordBox &&
              index === 0 &&
              beatPositionToNumber(chord.beat) === 0 &&
              chord.symbol === chordSymbol
            )
          ).map(chord => (
            <div
              key={`inline-chordbox-${chord.id}`}
              data-chord-id={chord.id}
              data-beat={beatPositionToNumber(chord.beat)}
              style={{
                position: 'absolute',
                left: `${beatPositionXFromPositions(chord.beat, measure.beatPositions) - 37}px`,
                top: '2px',
                width: '74px',
                height: '112px',
                zIndex: 9,
              }}
              className="bg-neutral-950/95 border border-neutral-600 rounded-xl shadow-xl flex flex-col items-center pt-2 pb-0.5 select-none overflow-hidden backdrop-blur-sm"
            >
              <span className="text-[15px] font-extrabold text-indigo-300 leading-none mb-0.5">
                {chord.symbol}
              </span>
              <span className="text-[7.5px] font-black text-neutral-300 uppercase tracking-[0.15em] leading-none mb-1 text-center scale-90">
                {stringLabels}
              </span>
              <div
                className="chord-diagram-container"
                data-chord={chord.symbol}
                style={{ width: '64px', height: '72px' }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
};

export const notationPracticeRenderer: PracticeRenderer & {
  renderContinuous: (
    document: EasyScoreDocument,
    segments: PositionedSegment[],
    context: PracticeRenderContext
  ) => React.ReactNode;
} = {
  supports(type: SheetType): boolean {
    return type === 'standard-notation';
  },

  buildTimeline(document: EasyScoreDocument): PracticeSegment[] {
    return buildNotationTimeline(document);
  },

  renderContinuous(document, segments, context): React.ReactNode {
    return (
      <ContinuousNotation
        document={document}
        segments={segments}
        offsetX={context.offsetX}
        viewportWidth={context.viewportWidth ?? 0}
        onRenderedNotes={context.onRenderedNotes}
        showMeasureNumbers={context.showMeasureNumbers}
      />
    );
  },

  renderStationaryOverlay(document, segments, context): React.ReactNode {
    return (
      <StationarySignature
        document={document}
        segments={segments}
        offsetX={context.offsetX}
      />
    );
  },

  renderSegment(segment: PositionedSegment): React.ReactNode {
    return (
      <div
        key={segment.id}
        style={{ width: `${segment.width}px` }}
        className="h-full shrink-0"
      />
    );
  },
};

export const tablaturePracticeRenderer: PracticeRenderer = {
  supports(type: SheetType): boolean {
    return type === 'tablature';
  },

  buildTimeline(document: EasyScoreDocument): PracticeSegment[] {
    const parts = document.parts ?? [];
    
    const staff = parts[0]?.staves?.[0];
    const notesCount = staff?.notes?.length ?? 16;
    
    const segments: PracticeSegment[] = [];
    for (let i = 0; i < Math.ceil(notesCount / 4); i++) {
      const startTick = i * 4 * 480;
      const durationTicks = 4 * 480;
      segments.push({
        id: `tab-measure-${i + 1}`,
        startTick,
        durationTicks,
        preferredWidth: 320,
        events: [
          {
            id: `tab-m-event-${i + 1}`,
            startTick,
            durationTicks,
            measure: i + 1,
            kind: 'measure',
            sourceIds: [`tab-m-${i + 1}`],
          }
        ],
        payload: {
          number: i + 1,
          beats: 4,
        }
      });
    }
    return segments;
  },

  renderSegment(
    segment: PositionedSegment
  ): React.ReactNode {
    return (
      <div
        key={segment.id}
        style={{ width: `${segment.width}px` }}
        className="h-full flex flex-col shrink-0 relative border-r border-neutral-900 justify-center items-center text-neutral-400 select-none bg-neutral-900/10"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Guitar/Ukulele Tablature</span>
        <span className="text-lg font-black text-neutral-200 mt-2">Measure {(segment.payload as { number?: number })?.number}</span>
        <span className="text-[10px] text-neutral-500 mt-1">Start Tick: {segment.startTick}</span>
      </div>
    );
  }
};

export const hybridPracticeRenderer: PracticeRenderer = {
  supports(type: SheetType): boolean {
    return type === 'hybrid';
  },

  buildTimeline(document: EasyScoreDocument): PracticeSegment[] {
    const parts = document.parts ?? [];
    
    const staff = parts[0]?.staves?.[0];
    const notesCount = staff?.notes?.length ?? 16;
    
    const segments: PracticeSegment[] = [];
    for (let i = 0; i < Math.ceil(notesCount / 4); i++) {
      const startTick = i * 4 * 480;
      const durationTicks = 4 * 480;
      segments.push({
        id: `hybrid-measure-${i + 1}`,
        startTick,
        durationTicks,
        preferredWidth: 360,
        events: [
          {
            id: `hybrid-m-event-${i + 1}`,
            startTick,
            durationTicks,
            measure: i + 1,
            kind: 'measure',
            sourceIds: [`hybrid-m-${i + 1}`],
          }
        ],
        payload: {
          number: i + 1,
          beats: 4,
        }
      });
    }
    return segments;
  },

  renderSegment(
    segment: PositionedSegment
  ): React.ReactNode {
    return (
      <div
        key={segment.id}
        style={{ width: `${segment.width}px` }}
        className="h-full flex flex-col shrink-0 relative border-r border-neutral-900 justify-center items-center text-neutral-400 select-none bg-neutral-900/10"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Hybrid Score + Tab</span>
        <span className="text-lg font-black text-neutral-200 mt-2">Measure {(segment.payload as { number?: number })?.number}</span>
        <span className="text-[10px] text-neutral-500 mt-1">Start Tick: {segment.startTick}</span>
      </div>
    );
  }
};

export const fallbackPracticeRenderer: PracticeRenderer = {
  supports(): boolean {
    return true;
  },

  buildTimeline(): PracticeSegment[] {
    return [];
  },

  renderSegment(segment: PositionedSegment): React.ReactNode {
    return (
      <div
        key={segment.id}
        style={{ width: `${segment.width}px` }}
        className="h-full flex flex-col shrink-0 relative border-r border-neutral-900 justify-center items-center text-neutral-500 italic select-none"
      >
        <span>Unknown representation</span>
      </div>
    );
  }
};

const renderers: PracticeRenderer[] = [
  chordLyricsPracticeRenderer,
  notationPracticeRenderer,
  tablaturePracticeRenderer,
  hybridPracticeRenderer,
];

export function selectPracticeRenderer(
  document: EasyScoreDocument
): PracticeRenderer {
  const type =
    document.metadata?.sheetType ??
    detectSheetType(document).type;

  return (
    renderers.find(renderer => renderer.supports(type)) ??
    fallbackPracticeRenderer
  );
}
