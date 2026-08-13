import React from 'react';
import type { EasyScoreDocument } from '../../../types/easyScore';
import type { PositionedSegment } from '../../../utils/practiceTimeline';
import { NOTATION_LAYOUT } from './layout';
import { getStaffNumbers } from './scoreModel';
import {
  buildNotationSignatureTimeline,
  positionStickySignatures,
  type PositionedNotationSignature,
} from './signatureTimeline';
import { notationThemeStyle, readNotationTheme } from './theme';
import { getNotationMeasures } from './timeline';
import { getClefName, keySignatureFromFifths } from './vexflowHelpers';

const SIGNATURE_LEFT_INSET = 10;
const SIGNATURE_RIGHT_INSET = 10;
const SIGNATURE_DRAWING_WIDTH = 180;
const INITIAL_SIGNATURE_WIDTH = 110;

function SignatureGroup({
  document,
  signature,
  width,
  onWidth,
}: {
  document: EasyScoreDocument;
  signature: PositionedNotationSignature;
  width: number;
  onWidth: (measureIndex: number, width: number) => void;
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
      if ('fonts' in globalThis.document) {
        await Promise.all([
          globalThis.document.fonts.load('30px Bravura'),
          globalThis.document.fonts.load('30px Academico'),
        ]);
      }
      if (cancelled || !hostRef.current) return;

      const { Renderer, Stave, StaveConnector } = VF;
      const staffNumbers = getStaffNumbers(getNotationMeasures(document));
      const height = Math.max(
        NOTATION_LAYOUT.minimumHeight,
        NOTATION_LAYOUT.top +
          staffNumbers.length * NOTATION_LAYOUT.staffGap +
          NOTATION_LAYOUT.bottomPadding
      );
      const liveHost = hostRef.current;
      if (!liveHost) return;
      const theme = readNotationTheme(liveHost);
      const renderer = new Renderer(liveHost, Renderer.Backends.SVG);
      renderer.resize(SIGNATURE_DRAWING_WIDTH, height);
      const context = renderer.getContext();
      context.setFillStyle(theme.foreground);
      context.setStrokeStyle(theme.staff);
      const staves = staffNumbers.map((staff, index) => {
        const stave = new Stave(
          SIGNATURE_LEFT_INSET,
          NOTATION_LAYOUT.top + index * NOTATION_LAYOUT.staffGap,
          SIGNATURE_DRAWING_WIDTH - SIGNATURE_LEFT_INSET
        );
        stave.addClef(getClefName(signature.clefs[staff]));
        stave.addKeySignature(keySignatureFromFifths(signature.fifths));
        stave.addTimeSignature(`${signature.beats}/${signature.beatType}`);
        stave.setStyle({ fillStyle: theme.staff, strokeStyle: theme.staff });
        context.setFillStyle(theme.foreground);
        context.setStrokeStyle(theme.staff);
        stave.setContext(context).draw();
        return stave;
      });
      const measuredWidth = Math.ceil(
        Math.max(...staves.map(stave => stave.getNoteStartX())) +
          SIGNATURE_RIGHT_INSET
      );
      onWidth(signature.measureIndex, measuredWidth);

      if (staves.length >= 2) {
        type ConnectorInstance = {
          setType: (type: number) => ConnectorInstance;
          setContext: (ctx: typeof context) => ConnectorInstance;
          setStyle?: (style: { fillStyle: string; strokeStyle: string }) => ConnectorInstance;
          draw: () => void;
        };
        const Connector = StaveConnector as unknown as {
          new (top: InstanceType<typeof Stave>, bottom: InstanceType<typeof Stave>): ConnectorInstance;
          type: Record<string, number>;
        };
        const connector = new Connector(staves[0], staves[staves.length - 1])
          .setType(Connector.type.BRACE)
          .setContext(context);
        connector.setStyle?.({ fillStyle: theme.foreground, strokeStyle: theme.foreground });
        connector.draw();
      }
    };

    draw().catch(error => {
      console.error('VexFlow stationary signature render failed:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [document, onWidth, signature.beatType, signature.beats, signature.clefs, signature.fifths, signature.measureIndex]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-y-0 pointer-events-none overflow-hidden bg-neutral-950 border-r border-neutral-800/80"
      style={{ left: signature.left, width, ...notationThemeStyle }}
    />
  );
}

export function StationarySignature({
  document,
  segments,
  offsetX,
}: {
  document: EasyScoreDocument;
  segments: PositionedSegment[];
  offsetX: number;
}) {
  const [widths, setWidths] = React.useState<Record<number, number>>({});
  const timeline = React.useMemo(
    () => buildNotationSignatureTimeline(document),
    [document]
  );
  const handleWidth = React.useCallback((measureIndex: number, width: number) => {
    setWidths(current => current[measureIndex] === width
      ? current
      : { ...current, [measureIndex]: width });
  }, []);
  const positioned = positionStickySignatures(
    timeline,
    segments,
    offsetX,
    entry => widths[entry.measureIndex] ?? INITIAL_SIGNATURE_WIDTH
  );

  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none overflow-hidden"
      aria-label="Current clef, key signature, and time signature"
    >
      {positioned.map(signature => (
        <SignatureGroup
          key={signature.measureIndex}
          document={document}
          signature={signature}
          width={widths[signature.measureIndex] ?? INITIAL_SIGNATURE_WIDTH}
          onWidth={handleWidth}
        />
      ))}
    </div>
  );
}
