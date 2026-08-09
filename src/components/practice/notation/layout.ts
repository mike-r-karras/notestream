import type { StandardNotationMeasure } from './types';
import { eventStartQuarter, getMeasureQuarterNotes } from './scoreModel';

export const NOTATION_LAYOUT = {
  pixelsPerQuarter: 108,
  minimumMeasureWidth: 150,
  firstMeasureHeaderAllowance: 92,

  // Content-aware spacing. These are intentionally conservative: VexFlow
  // modifiers (especially accidentals) need real horizontal room before its
  // formatter can produce stable stems and beams.
  minimumRhythmicSlotWidth: 38,
  accidentalAllowance: 18,
  dotAllowance: 6,
  measureInnerPadding: 20,

  top: 24,
  staffGap: 150,
  minimumHeight: 190,
  bottomPadding: 12,
} as const;

type StaffPressure = {
  starts: Set<string>;
  accidentals: number;
  dots: number;
};

function getContentMinimumWidth(measure: StandardNotationMeasure): number {
  const byStaff = new Map<number, StaffPressure>();

  for (const voice of measure.voices ?? []) {
    const staff = voice.staff ?? 1;
    let pressure = byStaff.get(staff);
    if (!pressure) {
      pressure = { starts: new Set<string>(), accidentals: 0, dots: 0 };
      byStaff.set(staff, pressure);
    }

    for (const event of voice.events ?? []) {
      // Simultaneous notes share a rhythmic column, so count unique onsets
      // rather than blindly summing events across voices.
      pressure.starts.add(eventStartQuarter(event).toFixed(6));

      pressure.accidentals += (event.accidentals ?? []).filter(Boolean).length;
      pressure.dots += Math.max(0, event.duration?.dots ?? 0);
    }
  }

  let widestStaff = 0;
  for (const pressure of byStaff.values()) {
    const slots = Math.max(1, pressure.starts.size);
    const width =
      slots * NOTATION_LAYOUT.minimumRhythmicSlotWidth +
      pressure.accidentals * NOTATION_LAYOUT.accidentalAllowance +
      pressure.dots * NOTATION_LAYOUT.dotAllowance +
      NOTATION_LAYOUT.measureInnerPadding;

    widestStaff = Math.max(widestStaff, width);
  }

  return widestStaff;
}

export function getMeasureWidth(
  measure: StandardNotationMeasure,
  measureIndex = 0
): number {
  const quarterNotes = getMeasureQuarterNotes(measure);
  const headerAllowance =
    measureIndex === 0 ? NOTATION_LAYOUT.firstMeasureHeaderAllowance : 0;

  const timeDrivenWidth =
    quarterNotes * NOTATION_LAYOUT.pixelsPerQuarter;
  const contentDrivenWidth = getContentMinimumWidth(measure);

  return Math.max(
    NOTATION_LAYOUT.minimumMeasureWidth,
    Math.round(
      Math.max(timeDrivenWidth, contentDrivenWidth) + headerAllowance
    )
  );
}
