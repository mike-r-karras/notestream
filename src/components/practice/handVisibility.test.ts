import { describe, expect, it } from "vitest";
import { toggleHiddenHand } from "./handVisibility";

describe("toggleHiddenHand", () => {
  it("hides and restores the selected hand", () => {
    expect(toggleHiddenHand(null, "right")).toBe("right");
    expect(toggleHiddenHand("right", "right")).toBeNull();
  });

  it("does not hide the other hand while one hand is hidden", () => {
    expect(toggleHiddenHand("right", "left")).toBe("right");
    expect(toggleHiddenHand("left", "right")).toBe("left");
  });
});
