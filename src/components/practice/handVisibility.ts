export type PianoHand = "right" | "left";

export function toggleHiddenHand(
  hiddenHand: PianoHand | null,
  hand: PianoHand
): PianoHand | null {
  if (hiddenHand === hand) return null;
  if (hiddenHand !== null) return hiddenHand;
  return hand;
}
