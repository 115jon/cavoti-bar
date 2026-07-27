import { describe, expect, it } from "vitest";
import { DEFAULT_HOST_CAPABILITIES, parseHostMessage } from "./protocol";
import { liveSnapshot } from "../test/fixtures";

describe("parseHostMessage", () => {
  it("accepts a versioned live snapshot without exposing host internals", () => {
    expect(
      parseHostMessage({
        type: "snapshot",
        protocol: 1,
        complete: true,
        snapshot: liveSnapshot,
        settings: {
          topmost: true,
          maximized: true,
          refreshIntervalSeconds: 60,
          showFreshnessSeconds: false,
          updateReady: true,
          closeToTray: true,
          launchAtStartup: true,
          startupError: null,
          quotaThresholds: [80, 95],
        },
      }),
    ).toEqual({
      type: "snapshot",
      complete: true,
      snapshot: liveSnapshot,
      settings: {
        topmost: true,
        maximized: true,
        refreshIntervalSeconds: 60,
        showFreshnessSeconds: false,
        updateReady: true,
        closeToTray: true,
        launchAtStartup: true,
        startupError: null,
        quotaThresholds: [80, 95],
      },
    });
  });

  it.each([
    [401, "auth-required"],
    [403, "auth-required"],
    [0, "offline"],
    [500, "error"],
  ])("maps host result %s to %s", (status, state) => {
    expect(
      parseHostMessage({
        type: "bridge-state",
        protocol: 1,
        state,
        status,
        message: "safe message",
      }),
    ).toMatchObject({
      type: "bridge-state",
      state,
    });
  });

  it("rejects malformed or unsupported protocol messages", () => {
    expect(
      parseHostMessage({
        type: "snapshot",
        protocol: 2,
        snapshot: liveSnapshot,
      }),
    ).toBeNull();
    expect(
      parseHostMessage({
        type: "snapshot",
        protocol: 1,
        snapshot: { account: { displayName: "unsafe" } },
      }),
    ).toBeNull();
    expect(parseHostMessage("not a message")).toBeNull();
  });

  it.each(["overview", "usage", "plans", "status", "settings"])(
    "accepts only the allowlisted host navigation target %s",
    (target) => {
      expect(
        parseHostMessage({ protocol: 1, type: "host-navigation", target }),
      ).toEqual({ type: "host-navigation", target });
    },
  );

  it("rejects host navigation payloads outside the allowlist", () => {
    expect(
      parseHostMessage({
        protocol: 1,
        type: "host-navigation",
        target: "about",
        code: "must-not-cross-bridge",
      }),
    ).toBeNull();
  });

  it("accepts an explicit mobile capability state", () => {
    expect(
      parseHostMessage({
        protocol: 1,
        type: "capabilities",
        capabilities: {
          platform: "mobile",
          titlebarControls: false,
          tray: false,
          startup: false,
          topmost: false,
          windowSettings: false,
        },
      }),
    ).toEqual({
      type: "capabilities",
      capabilities: {
        platform: "mobile",
        titlebarControls: false,
        tray: false,
        startup: false,
        topmost: false,
        windowSettings: false,
      },
    });
    expect(DEFAULT_HOST_CAPABILITIES.titlebarControls).toBe(true);
  });

  it("accepts lifecycle state messages and rejects incomplete capabilities", () => {
    expect(
      parseHostMessage({
        protocol: 1,
        type: "lifecycle",
        state: "paused",
      }),
    ).toEqual({ type: "lifecycle", state: "paused" });
    expect(
      parseHostMessage({
        protocol: 1,
        type: "capabilities",
        capabilities: { platform: "mobile" },
      }),
    ).toBeNull();
  });
});
