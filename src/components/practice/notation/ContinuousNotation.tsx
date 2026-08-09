import React from 'react';
import type { EasyScoreDocument } from '../../../types/easyScore';
import type { PositionedSegment } from '../../../utils/practiceTimeline';
import { NOTATION_LAYOUT } from './layout';
import {
  eventDurationQuarter,
  eventStartQuarter,
  getStaffNumbers,
  normalizeVoicesForStaff,
  readBeatType,
} from './scoreModel';
import { getNotationMeasures } from './timeline';
import { notationThemeStyle, readNotationTheme } from './theme';
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

export function ContinuousNotation({
  document,
  segments,
}: {
  document: EasyScoreDocument;
  segments: PositionedSegment[];
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';

    const draw = async () => {
      const VF = await import('vexflow');
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
      } = VF;

      const measures = getNotationMeasures(document);
      if (measures.length === 0) return;

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

      liveHost.style.width = `${totalWidth}px`;
      liveHost.style.minWidth = `${totalWidth}px`;
      liveHost.style.height = `${height}px`;

      console.log('[Notestream VexFlow v5.2-spacing] mounting continuous grand staff', {
        measures: measures.length,
        staves: staffNumbers,
        totalWidth,
        height,
      });

      const vfRenderer = new Renderer(liveHost, Renderer.Backends.SVG);
      vfRenderer.resize(totalWidth, height);
      const context = vfRenderer.getContext();

      measures.forEach((measure, measureIndex) => {
        const segment = segments[measureIndex];
        if (!segment) return;

        const attributes = measure.attributes ?? {};
        const time = attributes.time;
        const beats = time?.beats ?? 4;
        const beatValue = readBeatType(time ?? null);
        const keySignature = keySignatureFromFifths(attributes.key?.fifths ?? 0);

        // Build all staves for the measure before formatting any voices. This
        // lets both hands share the exact same horizontal rhythmic grid.
        const staves = new Map<number, InstanceType<typeof Stave>>();
        staffNumbers.forEach((staffNumber, staffIndex) => {
          const staveY = top + staffIndex * staffGap;
          const stave = new Stave(segment.x, staveY, segment.width);
          const clef = attributes.clefs?.[String(staffNumber)]
            ?? (staffNumber === 1 ? attributes.clef : undefined);

          if (measureIndex === 0) {
            stave.addClef(getClefName(clef?.sign));
            stave.addKeySignature(keySignature);
            stave.addTimeSignature(`${beats}/${beatValue}`);
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

        // Connect piano staves into a real grand staff. Every measure gets a
        // right barline connector; the first measure also gets a left line and
        // brace.
        if (staffNumbers.length >= 2) {
          const topStave = staves.get(staffNumbers[0]);
          const bottomStave = staves.get(staffNumbers[staffNumbers.length - 1]);
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
            const drawConnector = (type: number) => {
              const connector = new Connector(topStave, bottomStave).setType(type).setContext(context);
              connector.setStyle?.(elementStyle);
              connector.draw();
            };
            drawConnector(connectorTypes.SINGLE_RIGHT);
            if (measureIndex === 0) {
              drawConnector(connectorTypes.SINGLE_LEFT);
              drawConnector(connectorTypes.BRACE);
            }
          }
        }

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
          const clef = attributes.clefs?.[String(staffNumber)]
            ?? (staffNumber === 1 ? attributes.clef : undefined);
          const clefName = getClefName(clef?.sign);

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
              const startQuarter = event.startQuarterNotes ?? event.start_quarter_notes ?? cursorQuarter;
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
              note.setStave(stave);

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
    };
  }, [document, segments]);

  const totalWidth = Math.max(
    1,
    segments.reduce((max, segment) => Math.max(max, segment.x + segment.width), 0)
  );

  return (
    <div
      ref={hostRef}
      className="h-full shrink-0 overflow-visible"
      style={{
        ...notationThemeStyle,
        width: `${totalWidth}px`,
        minWidth: `${totalWidth}px`,
      }}
      aria-label="Continuous standard notation"
    />
  );
}

