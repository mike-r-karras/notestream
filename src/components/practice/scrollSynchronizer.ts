export interface PlaybackScrollLead {
  minimumScreenX: number;
  maintainedScreenX: number;
}

/**
 * Returns the content distance that should be translated left for a playhead.
 *
 * The note initially advances naturally through the score. Once it reaches the
 * farther of measure two or 25% of the viewport, scrolling gradually takes over.
 * The quadratic handoff makes scroll velocity continuous, then keeps the note at
 * one stable screen position for the rest of written-order playback.
 */
export function playbackScrollDistance(
  noteX: number,
  viewportWidth: number,
  secondMeasureX: number | undefined
): { distance: number; lead: PlaybackScrollLead } {
  const width = Math.max(0, viewportWidth);
  const minimumScreenX = Math.max(width * 0.25, secondMeasureX ?? 0);
  const handoffDistance = Math.max(1, width * 0.3);
  const maintainedScreenX = minimumScreenX + handoffDistance / 2;

  if (noteX <= minimumScreenX) {
    return { distance: 0, lead: { minimumScreenX, maintainedScreenX } };
  }

  const progress = Math.min(1, (noteX - minimumScreenX) / handoffDistance);
  const distance = progress < 1
    ? handoffDistance * progress * progress / 2
    : noteX - maintainedScreenX;

  return {
    distance: Math.max(0, distance),
    lead: { minimumScreenX, maintainedScreenX },
  };
}
