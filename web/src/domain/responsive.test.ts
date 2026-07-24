import { describe, expect, it } from "vitest";
import { isCompactViewport } from "./responsive";

describe("isCompactViewport", () => {
  it("switches to compact mode when the viewport is narrow or short", () => {
    expect(isCompactViewport(500, 820)).toBe(true);
    expect(isCompactViewport(560, 700)).toBe(true);
    expect(isCompactViewport(501, 701)).toBe(false);
  });
});
