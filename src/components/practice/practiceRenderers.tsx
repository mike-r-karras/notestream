import React from 'react';
import { EasyScoreDocument, SheetType, InstrumentConfig } from '../../types/easyScore';
import { detectSheetType } from '../../utils/detectSheetType';
import { PositionedSegment, PracticeSegment, PracticeEvent } from '../../utils/practiceTimeline';

import { ContinuousNotation } from './notation/ContinuousNotation';
import { buildNotationTimeline } from './notation/timeline';

export interface PracticeRenderContext {
  isPlaying: boolean;
  beatCount: number;
  currentTick: number;
  offsetX: number;
  segments: PositionedSegment[];
  parsedInst?: InstrumentConfig | null;
}

export interface ChordLyricsSegmentPayload {
  id: string;
  number: number;
  beats: number;
  showChordBox?: boolean;
  sectionId?: string;
  sectionLabel?: string | null;
  lyrics?: { text: string }[];
  chords?: { id: string; beat: number; symbol: string; durationBeats: number; }[];
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
}

export const chordLyricsPracticeRenderer: PracticeRenderer = {
  supports(type: SheetType): boolean {
    return type === 'chord-lyrics';
  },

  buildTimeline(document: EasyScoreDocument): PracticeSegment[] {
    const sections = document.chordLyrics ?? document.sections ?? [];
    const segments: PracticeSegment[] = [];
    let lastChordSymbol = "";

    sections.forEach((section) => {
      if (section.measures && section.measures.length > 0) {
        section.measures.forEach((measure, mIdx) => {
          const chordSymbol = measure.chords?.[0]?.symbol || "";
          let showChordBox = false;

          if (chordSymbol) {
            if (chordSymbol !== lastChordSymbol) {
              showChordBox = true;
              lastChordSymbol = chordSymbol;
            }
          }

          // A measure in 4/4 has 4 beats. We assume 480 ticks per beat.
          const beats = measure.beats || 4;
          const durationTicks = beats * 480;
          const startTick = segments.length > 0
            ? segments[segments.length - 1].startTick + segments[segments.length - 1].durationTicks
            : 0;

          const events: PracticeEvent[] = [];

          // Add measure event
          events.push({
            id: `${measure.id}-event`,
            startTick,
            durationTicks,
            measure: measure.number,
            kind: 'measure',
            sourceIds: [measure.id],
          });

          // Add chord event
          if (measure.chords && measure.chords.length > 0) {
            measure.chords.forEach((c) => {
              const chordStartTick = startTick + (c.beat || 0) * 480;
              const chordDurationTicks = (c.durationBeats || 4) * 480;
              events.push({
                id: c.id,
                startTick: chordStartTick,
                durationTicks: chordDurationTicks,
                measure: measure.number,
                beat: c.beat,
                kind: 'chord',
                sourceIds: [c.id],
              });
            });
          }

          // Add lyric event
          if (measure.lyrics && measure.lyrics.length > 0) {
            measure.lyrics.forEach((lyric, lIdx) => {
              events.push({
                id: `${measure.id}-lyric-${lIdx}`,
                startTick,
                durationTicks,
                measure: measure.number,
                kind: 'lyric',
                sourceIds: [`${measure.id}-lyric`],
              });
            });
          }

          segments.push({
            id: measure.id,
            startTick,
            durationTicks,
            preferredWidth: 270, // Standard preferred width for chord-lyrics measures
            events,
            payload: {
              ...measure,
              sectionId: section.id,
              sectionLabel: mIdx === 0 ? section.label : null,
              showChordBox,
            }
          });
        });
      }
    });

    return segments;
  },

  renderSegment(
    segment: PositionedSegment,
    context: PracticeRenderContext
  ): React.ReactNode {
    const measure = segment.payload as ChordLyricsSegmentPayload;
    if (!measure) return null;

    const { isPlaying, beatCount, offsetX, segments } = context;

    const lyricObj = measure.lyrics?.[0];
    const lyricText = lyricObj?.text || "";

    const chordObj = measure.chords?.[0];
    const chordSymbol = chordObj?.symbol || "";

    // 1. Calculate local_x for sticky chordbox if applicable
    let stickyChordBoxNode = null;
    if (chordSymbol && measure.showChordBox) {
      // Find index of this segment in context.segments
      const idx = segments.findIndex(s => s.id === segment.id);
      
      // Find the next segment with showChordBox = true
      let nextChordSegmentX = segments.length * 270; // fallback if no next chord box
      for (let i = idx + 1; i < segments.length; i++) {
        if ((segments[i].payload as ChordLyricsSegmentPayload)?.showChordBox) {
          nextChordSegmentX = segments[i].x;
          break;
        }
      }

      const x_normal = segment.x + 12;
      const x_push_limit = nextChordSegmentX - 74 - 12;
      const x_sticky = 12 - offsetX;
      const x_pos = Math.max(x_normal, Math.min(x_sticky, x_push_limit));
      
      // Calculate local_x relative to the segment
      const local_x = x_pos - segment.x;

      // Map instrument frets to vexchords labels
      const stringLabels = (context.parsedInst?.tuning || ["G", "C", "E", "A"])
        .map((t: string) => t.replace(/\d+/, ""))
        .join(" ");

      stickyChordBoxNode = (
        <div
          key={`sticky-chordbox-${segment.id}`}
          style={{
            position: "absolute",
            left: `${local_x}px`,
            top: "10px",
            width: "74px",
            height: "112px",
            zIndex: 10,
          }}
          className="bg-neutral-950/95 border border-neutral-800 rounded-xl shadow-xl flex flex-col items-center pt-2 pb-0.5 select-none overflow-hidden backdrop-blur-sm"
        >
          {/* Centered Chord Name */}
          <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-0.5">
            {chordSymbol}
          </span>

          {/* String Labels */}
          <span className="text-[7.5px] font-black text-neutral-500 uppercase tracking-[0.15em] leading-none mb-1 text-center scale-90">
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
        className="h-full flex flex-col shrink-0 relative border-r border-neutral-900 select-none"
      >
        {/* Floating Section Label Badge */}
        {measure.sectionLabel && (
          <div className="absolute top-1.5 left-3 z-30 bg-indigo-950/80 border border-indigo-800/80 text-[9px] text-indigo-300 font-extrabold tracking-widest px-2 py-0.5 rounded uppercase select-none shadow-sm">
            {measure.sectionLabel}
          </div>
        )}

        {/* Top portion spacer */}
        <div className="h-[45px] w-full relative select-none" />

        {/* Middle Portion: Staff Lines & Beat Strum Hash Marks */}
        <svg className="w-full h-[135px]" viewBox={`0 0 ${segment.width} 135`} fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="45" x2={segment.width} y2="45" stroke="#1f1f1f" strokeWidth="1" />
          <line x1="0" y1="60" x2={segment.width} y2="60" stroke="#1f1f1f" strokeWidth="1" />
          <line x1="0" y1="75" x2={segment.width} y2="75" stroke="#1f1f1f" strokeWidth="1" />
          <line x1="0" y1="90" x2={segment.width} y2="90" stroke="#1f1f1f" strokeWidth="1" />
          <line x1="0" y1="105" x2={segment.width} y2="105" stroke="#1f1f1f" strokeWidth="1" />

          {/* Strum Hash Marks */}
          {Array.from({ length: measure.beats || 4 }).map((_, bIdx) => {
            const beatWidth = segment.width / (measure.beats || 4);
            const x = beatWidth * bIdx + beatWidth / 2;
            
            // Find idx in context segments to calculate absolute beat
            const segIdx = segments.findIndex(s => s.id === segment.id);
            const absoluteBeatIdx = segIdx * 4 + bIdx;
            const isActiveBeat = isPlaying && (beatCount === absoluteBeatIdx + 1);

            return (
              <line
                key={bIdx}
                x1={x - 8}
                y1="98"
                x2={x + 8}
                y2="82"
                stroke={isActiveBeat ? "#34d399" : "#6366f1"}
                strokeWidth={isActiveBeat ? "4.5" : "3.5"}
                strokeLinecap="round"
                className={`transition-colors duration-100 ${
                  isActiveBeat
                    ? "drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                    : "drop-shadow-[0_0_2px_rgba(99,102,241,0.5)]"
                }`}
              />
            );
          })}

          {/* Right vertical bar line */}
          <line
            x1={segment.width}
            y1="45"
            x2={segment.width}
            y2="105"
            stroke={segment.id === segments[segments.length - 1]?.id ? "#6366f1" : "#2a2a2a"}
            strokeWidth={segment.id === segments[segments.length - 1]?.id ? "4" : "1"}
          />
          {segment.id === segments[segments.length - 1]?.id && (
            <line x1={segment.width - 9} y1="45" x2={segment.width - 9} y2="105" stroke="#6366f1" strokeWidth="1" />
          )}
        </svg>

        {/* Bottom Portion: Lyrics */}
        <div className="h-[75px] w-full flex items-center justify-center px-2 text-center select-none">
          {lyricText ? (
            <span className="text-[15px] text-neutral-300 font-semibold tracking-wide leading-snug">
              {lyricText}
            </span>
          ) : (
            <span className="text-[13px] text-neutral-700 italic select-none">...</span>
          )}
        </div>

        {/* Sticky chordbox layer */}
        {stickyChordBoxNode}
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
    void context;
    return <ContinuousNotation document={document} segments={segments} />;
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
