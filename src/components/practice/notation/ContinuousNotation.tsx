import React from 'react';
import type { EasyScoreDocument } from '../../../types/easyScore';
import { useTheme } from '../../../context/ThemeContext';
import type { PositionedSegment } from '../../../utils/practiceTimeline';
import { NOTATION_LAYOUT } from './layout';
import { writtenMeasureNotation } from './notationMetadata';
import {
  eventDurationQuarter,
  eventStartQuarter,
  getStaffNumbers,
  normalizeVoicesForStaff,
} from './scoreModel';
import { getNotationMeasures, notationEventId } from './timeline';
import { buildNotationSignatureTimeline } from './signatureTimeline';
import { layoutLyrics, type LyricAnchor } from './lyricLayout';
import {
  registerRenderedNote,
  type RenderedNoteRegistry,
} from './renderedNoteRegistry';
import { notationThemeStyle, readNotationTheme } from './theme';
import { notationRenderWindow } from './virtualization';
import {
  accidentalFromAlter,
  accidentalToVex,
  getClefName,
  getRestKeyForClef,
  getStemDirectionForEvent,
  keySignatureFromFifths,
  pitchToVexKey,
  splitQuarterNotesIntoVexDurations,
} from './vexflowHelpers';

function ghostNotationColor(color: string): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  return match ? `#${match[1]}59` : `color-mix(in srgb, ${color} 35%, transparent)`;
}

export function ContinuousNotation({
  document,
  segments,
  offsetX,
  viewportWidth,
  onRenderedNotes,
}: {
  document: EasyScoreDocument;
  segments: PositionedSegment[];
  offsetX: number;
  viewportWidth: number;
  onRenderedNotes?: (notes: RenderedNoteRegistry) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const renderWindow = React.useMemo(
    () => notationRenderWindow(segments, offsetX, viewportWidth),
    [offsetX, segments, viewportWidth]
  );

  React.useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';

    const draw = async () => {
      const VF = await import('vexflow');
      if (cancelled || !hostRef.current) return;

      // The bundled VexFlow entry registers its FontFace objects while the
      // dynamic import resolves, but their browser loads can still be pending.
      // A cold direct navigation can otherwise format with fallback metrics
      // and draw with Bravura metrics, progressively separating noteheads,
      // stems, flags, and beams. Client-side navigation hid the race because
      // the fonts had finished loading by the time the score was selected.
      if ('fonts' in globalThis.document) {
        await Promise.all([
          globalThis.document.fonts.load('30px Bravura'),
          globalThis.document.fonts.load('30px Academico'),
        ]);
      }
      if (cancelled || !hostRef.current) return;

      const {
        Renderer,
        Stave,
        StaveNote,
        GhostNote,
        Voice,
        Formatter,
        Accidental,
        Dot,
        Beam,
        StaveConnector,
        BarlineType,
        VoltaType,
      } = VF;

      const measures = getNotationMeasures(document);
      if (measures.length === 0) return;
      const writtenNotation = writtenMeasureNotation(measures);
      const signatureTimeline = buildNotationSignatureTimeline(document);

      const staffNumbers = getStaffNumbers(measures);

      const totalWidth = Math.max(1, segments.reduce((max, segment) => Math.max(max, segment.x + segment.width), 0));
      const top = NOTATION_LAYOUT.top;
      const staffGap = NOTATION_LAYOUT.staffGap;
      const height = Math.max(
        NOTATION_LAYOUT.minimumHeight,
        top + staffNumbers.length * staffGap + NOTATION_LAYOUT.bottomPadding
      );

      const liveHost = hostRef.current;
      if (!liveHost) return;
      const theme = readNotationTheme(liveHost);
      const elementStyle = { fillStyle: theme.foreground, strokeStyle: theme.foreground };

      const renderedWidth = Math.max(1, renderWindow.right - renderWindow.left);
      liveHost.style.left = `${renderWindow.left}px`;
      liveHost.style.width = `${renderedWidth}px`;
      liveHost.style.minWidth = `${renderedWidth}px`;
      liveHost.style.height = `${height}px`;

      console.log('[Notestream VexFlow v5.2-spacing] mounting continuous grand staff', {
        measures: renderWindow.endIndex - renderWindow.startIndex + 1,
        totalMeasures: measures.length,
        staves: staffNumbers,
        totalWidth,
        height,
      });

      const vfRenderer = new Renderer(liveHost, Renderer.Backends.SVG);
      vfRenderer.resize(renderedWidth, height);
      const context = vfRenderer.getContext();
      const renderedNoteElements: Array<{
        id: string;
        note: InstanceType<typeof StaveNote>;
        event: Parameters<typeof eventDurationQuarter>[0];
        eventEndAllowance: number;
      }> = [];

      measures.forEach((measure, measureIndex) => {
        if (measureIndex < renderWindow.startIndex || measureIndex > renderWindow.endIndex) return;
        const segment = segments[measureIndex];
        if (!segment) return;

        const attributes = measure.attributes ?? {};
        const signature = signatureTimeline[measureIndex];
        const beats = signature?.beats ?? 4;
        const beatValue = signature?.beatType ?? 4;
        const keySignature = keySignatureFromFifths(signature?.fifths ?? 0);
        const measureNotation = writtenNotation[measureIndex];

        // Build all staves for the measure before formatting any voices. This
        // lets both hands share the exact same horizontal rhythmic grid.
        const staves = new Map<number, InstanceType<typeof Stave>>();
        staffNumbers.forEach((staffNumber, staffIndex) => {
          const staveY = top + staffIndex * staffGap;
          const stave = new Stave(
            segment.x - renderWindow.left + (measureIndex === 0 ? 10 : 0),
            staveY,
            segment.width - (measureIndex === 0 ? 10 : 0)
          );
          const clefName = getClefName(signature?.clefs[staffNumber]);

          if (signature?.changed.clefStaffs.includes(staffNumber)) {
            stave.addClef(clefName);
          }
          if (signature?.changed.key) {
            stave.addKeySignature(keySignature);
          }
          if (signature?.changed.time) {
            stave.addTimeSignature(`${beats}/${beatValue}`);
          }

          const barlineTypes = {
            single: BarlineType.SINGLE,
            double: BarlineType.DOUBLE,
            final: BarlineType.END,
            'repeat-begin': BarlineType.REPEAT_BEGIN,
            'repeat-end': BarlineType.REPEAT_END,
          } as const;
          if (measureNotation.beginBarline) {
            stave.setBegBarType(barlineTypes[measureNotation.beginBarline]);
          }
          if (measureNotation.endBarline) {
            stave.setEndBarType(barlineTypes[measureNotation.endBarline]);
          }
          if (staffIndex === 0 && measureNotation.volta) {
            const voltaTypes = {
              begin: VoltaType.BEGIN,
              mid: VoltaType.MID,
              end: VoltaType.END,
              'begin-end': VoltaType.BEGIN_END,
            } as const;
            stave.setVoltaType(
              voltaTypes[measureNotation.volta.kind],
              measureNotation.volta.label,
              -5
            );
          }
          if (measure.playbackPresentation?.ghostRepeatSigns) {
            const ghostStyle = {
              fillStyle: ghostNotationColor(theme.foreground),
              strokeStyle: ghostNotationColor(theme.foreground),
            };
            stave.getModifiers(undefined, 'Barline').forEach(modifier => {
              const type = (modifier as unknown as { getType?: () => number }).getType?.();
              if (
                type === BarlineType.REPEAT_BEGIN ||
                type === BarlineType.REPEAT_END ||
                type === BarlineType.REPEAT_BOTH
              ) {
                modifier.setStyle(ghostStyle);
              }
            });
          }

          // Keep all music geometry color-coherent. These CSS variables are
          // the first hook for a fully themeable notation palette.
          stave.setStyle({ fillStyle: theme.staff, strokeStyle: theme.staff });
          context.setFillStyle(theme.staff);
          context.setStrokeStyle(theme.staff);
          stave.setContext(context).draw();
          staves.set(staffNumber, stave);
        });

        // Clef/key/time widths differ slightly between treble and bass. Force
        // the two staves to begin notes at the same x coordinate.
        const sharedNoteStartX = Math.max(
          ...Array.from(staves.values()).map(stave => stave.getNoteStartX())
        );
        staves.forEach(stave => stave.setNoteStartX(sharedNoteStartX));

        // Connect each source multi-staff instrument independently. This keeps
        // a piano brace scoped to its grand staff when a vocal part is present.
        const staffGroups = measure.staffGroups ?? [staffNumbers];
        staffGroups.filter(group => group.length >= 2).forEach(group => {
          const topStave = staves.get(group[0]);
          const bottomStave = staves.get(group[group.length - 1]);
          if (topStave && bottomStave) {
            const Connector = StaveConnector as unknown as {
              new (top: InstanceType<typeof Stave>, bottom: InstanceType<typeof Stave>): {
                setType: (type: number) => any;
                setContext: (ctx: typeof context) => any;
                setStyle?: (style: typeof elementStyle) => any;
                draw: () => void;
              };
              type: Record<string, number>;
            };
            const connectorTypes = Connector.type;
            const drawConnector = (type: number, ghosted = false) => {
              const connector = new Connector(topStave, bottomStave).setType(type).setContext(context);
              connector.setStyle?.(ghosted
                ? {
                    fillStyle: ghostNotationColor(theme.foreground),
                    strokeStyle: ghostNotationColor(theme.foreground),
                  }
                : elementStyle);
              connector.draw();
            };
            const rightConnector = measureNotation.endBarline === 'final' ||
              measureNotation.endBarline === 'repeat-end'
              ? connectorTypes.BOLD_DOUBLE_RIGHT
              : measureNotation.endBarline === 'double'
                ? connectorTypes.THIN_DOUBLE
                : connectorTypes.SINGLE_RIGHT;
            drawConnector(
              rightConnector,
              !!measure.playbackPresentation?.ghostRepeatSigns &&
                measureNotation.endBarline === 'repeat-end'
            );
            if (measureNotation.beginBarline === 'repeat-begin') {
              drawConnector(
                connectorTypes.BOLD_DOUBLE_LEFT,
                !!measure.playbackPresentation?.ghostRepeatSigns
              );
            } else if (measureIndex === 0) {
              drawConnector(connectorTypes.SINGLE_LEFT);
            }
            if (measureIndex === 0) {
              drawConnector(connectorTypes.BRACE);
            }
          }
        });

        type RenderedVoice = {
          voice: InstanceType<typeof Voice>;
          stave: InstanceType<typeof Stave>;
          staffNumber: number;
          voiceIndex: number;
          voiceCount: number;
          beamRuns: Array<Array<InstanceType<typeof StaveNote>>>;
        };

        const rendered: RenderedVoice[] = [];

        staffNumbers.forEach((staffNumber) => {
          const stave = staves.get(staffNumber);
          if (!stave) return;

          const rawVoicesForStaff = (measure.voices ?? []).filter(
            voice => (voice.staff ?? 1) === staffNumber
          );
          const voicesForStaff = normalizeVoicesForStaff(rawVoicesForStaff);

          if (rawVoicesForStaff.length !== voicesForStaff.length) {
            console.debug('[Notestream VexFlow] merged non-overlapping voice fragments', {
              measure: measure.number ?? measureIndex + 1,
              staff: staffNumber,
              sourceVoices: rawVoicesForStaff.map(v => v.number),
              renderedVoices: voicesForStaff.length,
            });
          }
          const clefName = getClefName(signature?.clefs[staffNumber]);

          voicesForStaff.forEach((sourceVoice, voiceIndex) => {
            const sourceEvents = [...(sourceVoice.events ?? [])].sort((a, b) => {
              const aStart = eventStartQuarter(a);
              const bStart = eventStartQuarter(b);
              return aStart - bStart;
            });

            const tickables: Array<InstanceType<typeof StaveNote> | InstanceType<typeof GhostNote>> = [];
            const beamRuns: Array<Array<InstanceType<typeof StaveNote>>> = [];
            let currentBeamRun: Array<InstanceType<typeof StaveNote>> = [];
            let cursorQuarter = 0;

            const finishBeamRun = () => {
              if (currentBeamRun.length > 0) beamRuns.push(currentBeamRun);
              currentBeamRun = [];
            };

            sourceEvents.forEach(event => {
              const sourceStartQuarter =
                event.startQuarterNotes ??
                event.start_quarter_notes ??
                cursorQuarter;
              const startQuarter = sourceStartQuarter;
              const eventQuarter = eventDurationQuarter(event);

              // VexFlow Voice is sequential. Preserve the converter's absolute
              // event start time with invisible tickable gaps.
              const gap = startQuarter - cursorQuarter;
              if (gap > 1e-5) {
                finishBeamRun();
                splitQuarterNotesIntoVexDurations(gap).forEach(duration => {
                  tickables.push(new GhostNote({ duration }));
                });
                cursorQuarter = startQuarter;
              }

              const durationBase = event.duration?.vexflow ?? 'q';
              const isRest = event.type === 'rest' || !event.pitches?.length;
              const note = new StaveNote({
                clef: clefName,
                keys: isRest
                  ? [getRestKeyForClef(clefName)]
                  : (event.pitches ?? []).map(pitchToVexKey),
                duration: isRest ? `${durationBase}r` : durationBase,
              });

              note.setStyle(elementStyle);
              note.setStemStyle(elementStyle);
              note.setFlagStyle(elementStyle);
              note.setLedgerLineStyle(elementStyle);
              note.setStave(stave);

              if (!isRest) {
                renderedNoteElements.push({
                  id: notationEventId(
                    measure.id ?? `notation-measure-${measure.number ?? measureIndex + 1}`,
                    sourceVoice,
                    event
                  ),
                  note,
                  event,
                  eventEndAllowance: Math.max(18, eventQuarter * NOTATION_LAYOUT.pixelsPerQuarter),
                });
              }

              if (!isRest) {
                (event.pitches ?? []).forEach((pitch, pitchIndex) => {
                  const written = event.accidentals?.[pitchIndex];
                  let accidental = accidentalToVex(written);

                  if (!accidental && !event.accidentals && (attributes.key?.fifths ?? 0) === 0) {
                    accidental = accidentalFromAlter(pitch.alter);
                  }

                  if (accidental) {
                    const modifier = new Accidental(accidental);
                    modifier.setStyle(elementStyle);
                    note.addModifier(modifier, pitchIndex);
                  }
                });

                // In polyphony, preserve conventional opposing voice stems.
                // In a single voice, leave beamed groups to VexFlow's group
                // calculation; only un-beamed notes need an initial direction.
                if (voicesForStaff.length > 1) {
                  note.setStemDirection(voiceIndex === 0 ? 1 : -1);
                } else {
                  note.setStemDirection(getStemDirectionForEvent(event, clefName, 0, 1));
                }

                // Only eighth notes and shorter belong in beam runs. A
                // quarter-or-longer note terminates the current group instead
                // of letting generateBeams infer a group across it.
                if (eventQuarter > 0 && eventQuarter <= 0.5 + 1e-5) {
                  currentBeamRun.push(note);
                } else {
                  finishBeamRun();
                }
              } else {
                finishBeamRun();
              }

              const dots = event.duration?.dots ?? 0;
              for (let i = 0; i < dots; i += 1) {
                Dot.buildAndAttach([note], { all: true });
              }

              tickables.push(note);
              cursorQuarter = Math.max(cursorQuarter, startQuarter + eventQuarter);
            });
            finishBeamRun();

            if (tickables.length === 0) return;

            const voice = new Voice({ numBeats: beats, beatValue });
            voice.setStrict(false);
            voice.addTickables(tickables);

            rendered.push({
              voice,
              stave,
              staffNumber,
              voiceIndex,
              voiceCount: voicesForStaff.length,
              beamRuns,
            });
          });
        });

        if (rendered.length === 0) return;

        const formatter = new Formatter();

        // joinVoices is per stave, but format() receives every voice from both
        // staves. This creates one tick grid for the entire grand staff.
        staffNumbers.forEach(staffNumber => {
          const staffVoices = rendered
            .filter(entry => entry.staffNumber === staffNumber)
            .map(entry => entry.voice);
          if (staffVoices.length > 0) formatter.joinVoices(staffVoices);

          // Only auto-shift rests when there is actual polyphony. Single-voice
          // rests should stay on the normal center line of their own clef.
          if (staffVoices.length > 1) formatter.alignRests(staffVoices, true);
        });

        const noteEndX = Math.min(
          ...Array.from(staves.values()).map(stave => stave.getNoteEndX())
        );
        const justifyWidth = Math.max(40, noteEndX - sharedNoteStartX - 8);
        const allVoices = rendered.map(entry => entry.voice);
        formatter.format(allVoices, justifyWidth, { context, alignRests: false });

        context.setFillStyle(theme.foreground);
        context.setStrokeStyle(theme.foreground);

        rendered.forEach(entry => {
          const generateBeams = (Beam as unknown as {
            generateBeams?: (
              notes: Array<InstanceType<typeof StaveNote>>,
              options?: {
                stem_direction?: number;
                maintain_stem_directions?: boolean;
                beam_rests?: boolean;
              }
            ) => Array<{
              setContext: (ctx: typeof context) => any;
              setStyle?: (style: typeof elementStyle) => any;
              draw: () => void;
            }>;
          }).generateBeams;

          const beams = entry.beamRuns.flatMap(run => {
            if (run.length < 2 || typeof generateBeams !== 'function') return [];
            const polyphonicDirection = entry.voiceCount > 1
              ? (entry.voiceIndex === 0 ? 1 : -1)
              : undefined;
            return generateBeams(run, {
              ...(polyphonicDirection ? { stem_direction: polyphonicDirection } : {}),
              // Single-voice beam groups should choose a group-optimal stem
              // direction. Polyphonic voices keep their explicit direction.
              maintain_stem_directions: entry.voiceCount > 1,
              beam_rests: false,
            });
          });

          entry.voice.draw(context, entry.stave);
          beams.forEach(beam => {
            beam.setStyle?.(elementStyle);
            beam.setContext(context).draw();
          });
        });
      });

      const svg = liveHost.querySelector('svg');
      const noteRegistry: RenderedNoteRegistry = new Map();
      const lyricAnchors: LyricAnchor[] = [];
      renderedNoteElements.forEach(({ id, note, event, eventEndAllowance }) => {
        const element = note.getSVGElement();
        if (!element) return;
        const overlay = element.cloneNode(true) as SVGElement;
        overlay.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
        overlay.removeAttribute('id');
        overlay.setAttribute('data-notestream-event-id', id);
        overlay.classList.add('notestream-playback-overlay');
        element.parentNode?.insertBefore(overlay, element.nextSibling);
        registerRenderedNote(noteRegistry, id, overlay);
        if (event.lyrics?.length) {
          const x = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
          lyricAnchors.push({
            eventId: id,
            x,
            eventEndX: x + eventEndAllowance,
            lyrics: event.lyrics,
          });
        }
      });
      if (svg && lyricAnchors.length > 0) {
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const lyricColor = 'var(--theme-chord-text)';
        const lyricLayer = globalThis.document.createElementNS(svgNamespace, 'g');
        lyricLayer.classList.add('notestream-lyrics');
        lyricLayer.setAttribute('fill', lyricColor);
        lyricLayer.setAttribute('stroke', 'none');
        lyricLayer.setAttribute('aria-label', 'Score lyrics');
        const lyricRowTop = top + 108;
        layoutLyrics(
          lyricAnchors.sort((left, right) => left.x - right.x),
          lyricRowTop
        ).forEach(lyric => {
          if (lyric.text) {
            const text = globalThis.document.createElementNS(svgNamespace, 'text');
            text.setAttribute('x', `${lyric.x}`);
            text.setAttribute('y', `${lyric.y}`);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
            text.setAttribute('font-size', '14');
            text.setAttribute('font-weight', '600');
            text.setAttribute('fill', lyricColor);
            text.setAttribute('stroke', 'none');
            text.setAttribute('data-notestream-event-id', lyric.eventId);
            text.setAttribute('data-notestream-verse', lyric.verse);
            text.textContent = lyric.text;
            lyricLayer.appendChild(text);
          }
          if (lyric.hyphenX !== undefined) {
            const hyphen = globalThis.document.createElementNS(svgNamespace, 'text');
            hyphen.setAttribute('x', `${lyric.hyphenX}`);
            hyphen.setAttribute('y', `${lyric.y}`);
            hyphen.setAttribute('text-anchor', 'middle');
            hyphen.setAttribute('dominant-baseline', 'middle');
            hyphen.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
            hyphen.setAttribute('font-size', '14');
            hyphen.setAttribute('font-weight', '600');
            hyphen.setAttribute('fill', lyricColor);
            hyphen.setAttribute('stroke', 'none');
            hyphen.textContent = '–';
            lyricLayer.appendChild(hyphen);
          }
          if (lyric.extension) {
            const line = globalThis.document.createElementNS(svgNamespace, 'line');
            line.setAttribute('x1', `${lyric.extension.startX}`);
            line.setAttribute('x2', `${lyric.extension.endX}`);
            line.setAttribute('y1', `${lyric.y + 5}`);
            line.setAttribute('y2', `${lyric.y + 5}`);
            line.setAttribute('stroke', lyricColor);
            line.setAttribute('stroke-width', '1');
            lyricLayer.appendChild(line);
          }
        });
        svg.appendChild(lyricLayer);
      }
      onRenderedNotes?.(noteRegistry);
      console.log('[Notestream VexFlow v5.2-spacing] grand-staff draw complete', {
        svgPresent: !!svg,
        svgWidth: svg?.getAttribute('width'),
        svgHeight: svg?.getAttribute('height'),
        childCount: liveHost.childElementCount,
      });
    };

    draw().catch(error => {
      console.error('VexFlow standard-notation render failed:', error);
    });

    return () => {
      cancelled = true;
      onRenderedNotes?.(new Map());
    };
  }, [
    document,
    segments,
    onRenderedNotes,
    renderWindow.endIndex,
    renderWindow.left,
    renderWindow.right,
    renderWindow.startIndex,
    resolvedTheme,
  ]);

  const totalWidth = Math.max(
    1,
    segments.reduce((max, segment) => Math.max(max, segment.x + segment.width), 0)
  );

  return (
    <div
      className="h-full shrink-0 overflow-visible relative"
      style={{
        ...notationThemeStyle,
        width: `${totalWidth}px`,
        minWidth: `${totalWidth}px`,
      }}
      aria-label="Continuous standard notation"
    >
      <div ref={hostRef} className="absolute top-0 h-full overflow-visible" />
    </div>
  );
}
