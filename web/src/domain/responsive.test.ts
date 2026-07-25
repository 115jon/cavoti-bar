import { describe, expect, it } from "vitest";
import { isCompactViewport } from "./responsive";

describe("isCompactViewport", () => {
  it("switches to compact mode for narrow viewports while keeping desktop layouts scrollable", () => {
    expect(isCompactViewport(500, 820)).toBe(true);
    expect(isCompactViewport(528, 1024)).toBe(true);
    expect(isCompactViewport(560, 700)).toBe(true);
    expect(isCompactViewport(720, 701)).toBe(true);
    expect(isCompactViewport(721, 600)).toBe(false);
    expect(isCompactViewport(721, 702)).toBe(false);
  });
});
