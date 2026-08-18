import { describe, expect, it } from "vitest";
import { playbackScrollDistance } from "./scrollSynchronizer";

describe("playbackScrollDistance", () => {
  it("waits for the second measure when it is farther than 25% of the viewport", () => {
    expect(playbackScrollDistance(399, 1000, 400).distance).toBe(0);
    expect(playbackScrollDistance(400, 1000, 400).distance).toBe(0);
  });

  it("uses 25% of the viewport when it is farther than the second measure", () => {
    const result = playbackScrollDistance(250, 1000, 180);
    expect(result.distance).toBe(0);
    expect(result.lead.minimumScreenX).toBe(250);
  });

  it("hands scrolling over gradually and then maintains the note position", () => {
    const duringHandoff = playbackScrollDistance(400, 1000, 250);
    expect(duringHandoff.distance).toBeCloseTo(37.5);

    const afterHandoff = playbackScrollDistance(900, 1000, 250);
    expect(afterHandoff.lead.maintainedScreenX).toBe(400);
    expect(900 - afterHandoff.distance).toBe(400);

    const later = playbackScrollDistance(1100, 1000, 250);
    expect(1100 - later.distance).toBe(400);
  });
});
