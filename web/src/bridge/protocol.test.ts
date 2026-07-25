import { describe, expect, it } from "vitest";
import { parseHostMessage } from "./protocol";
import { liveSnapshot } from "../test/fixtures";

describe("parseHostMessage", () => {
  it("accepts a versioned live snapshot without exposing host internals", () => {
    expect(
      parseHostMessage({
        type: "snapshot",
        protocol: 1,
        snapshot: liveSnapshot,
        settings: { topmost: true, maximized: true, refreshIntervalSeconds: 60, showFreshnessSeconds: false, updateReady: true },
      }),
    ).toEqual({
      type: "snapshot",
      snapshot: liveSnapshot,
      settings: { topmost: true, maximized: true, refreshIntervalSeconds: 60, showFreshnessSeconds: false, updateReady: true },
    });
  });

  it.each([
    [401, "auth-required"],
    [403, "auth-required"],
    [0, "offline"],
    [500, "error"],
  ])("maps host result %s to %s", (status, state) => {
    expect(parseHostMessage({ type: "bridge-state", protocol: 1, state, status, message: "safe message" })).toMatchObject({
      type: "bridge-state",
      state,
    });
  });

  it("rejects malformed or unsupported protocol messages", () => {
    expect(parseHostMessage({ type: "snapshot", protocol: 2, snapshot: liveSnapshot })).toBeNull();
    expect(parseHostMessage({ type: "snapshot", protocol: 1, snapshot: { account: { displayName: "unsafe" } } })).toBeNull();
    expect(parseHostMessage("not a message")).toBeNull();
  });
});
