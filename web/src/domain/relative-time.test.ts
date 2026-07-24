import { describe, expect, it } from "vitest";
import { relativeAge } from "./relative-time";

describe("relativeAge", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");

  it("describes fresh, minute, and hour-old snapshots", () => {
    expect(relativeAge("2026-07-24T11:59:45.000Z", now)).toBe("Updated just now");
    expect(relativeAge("2026-07-24T11:59:00.000Z", now)).toBe("Updated 1 minute ago");
    expect(relativeAge("2026-07-24T11:55:00.000Z", now)).toBe("Updated 5 minutes ago");
    expect(relativeAge("2026-07-24T10:00:00.000Z", now)).toBe("Updated 2 hours ago");
    expect(relativeAge("2026-07-24T11:59:48.000Z", now, true)).toBe("Updated 12 seconds ago");
  });
});
