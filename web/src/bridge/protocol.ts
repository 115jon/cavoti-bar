import type { SnapshotEnvelope } from "../domain/snapshot";

export type HostSettings = {
  topmost: boolean;
  maximized: boolean;
  refreshIntervalSeconds: number;
  showFreshnessSeconds: boolean;
  updateReady?: boolean;
  closeToTray: boolean;
  launchAtStartup: boolean;
  startupError: string | null;
  quotaThresholds: number[];
};

export type HostMessage =
  | {
      type: "snapshot";
      complete?: boolean;
      snapshot: SnapshotEnvelope;
      settings?: HostSettings;
    }
  | { type: "settings"; settings: HostSettings }
  | {
      type: "bridge-state";
      state: "auth-required" | "offline" | "error" | "loading";
      status: number;
      message: string;
    }
  | { type: "host-navigation"; target: "settings" };
type BridgeState = "auth-required" | "offline" | "error" | "loading";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function quotaThresholds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is number =>
          typeof item === "number" &&
          Number.isInteger(item) &&
          item >= 1 &&
          item <= 100,
      ),
    ),
  ].sort((a, b) => a - b);
}

function parseSettings(value: unknown): HostSettings | undefined {
  if (
    !isRecord(value) ||
    typeof value.topmost !== "boolean" ||
    typeof value.maximized !== "boolean" ||
    typeof value.refreshIntervalSeconds !== "number" ||
    typeof value.showFreshnessSeconds !== "boolean"
  )
    return undefined;
  return {
    topmost: value.topmost,
    maximized: value.maximized,
    refreshIntervalSeconds: value.refreshIntervalSeconds,
    showFreshnessSeconds: value.showFreshnessSeconds,
    ...(typeof value.updateReady === "boolean"
      ? { updateReady: value.updateReady }
      : {}),
    closeToTray:
      typeof value.closeToTray === "boolean" ? value.closeToTray : true,
    launchAtStartup:
      typeof value.launchAtStartup === "boolean"
        ? value.launchAtStartup
        : false,
    startupError:
      typeof value.startupError === "string" ? value.startupError : null,
    quotaThresholds: quotaThresholds(value.quotaThresholds),
  };
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (
    !isRecord(value) ||
    value.protocol !== 1 ||
    typeof value.type !== "string"
  )
    return null;
  if (
    value.type === "snapshot" &&
    isRecord(value.snapshot) &&
    value.snapshot.version === 1
  ) {
    const settings = parseSettings(value.settings);
    return {
      type: "snapshot",
      complete: value.complete !== false,
      snapshot: value.snapshot as unknown as SnapshotEnvelope,
      settings,
    };
  }
  if (value.type === "settings") {
    const settings = parseSettings(value.settings);
    if (settings) return { type: "settings", settings };
  }
  if (
    value.type === "bridge-state" &&
    ["auth-required", "offline", "error", "loading"].includes(
      String(value.state),
    )
  ) {
    return {
      type: "bridge-state",
      state: value.state as BridgeState,
      status: typeof value.status === "number" ? value.status : 0,
      message:
        typeof value.message === "string"
          ? value.message
          : "Cavoti connection unavailable",
    };
  }
  if (value.type === "host-navigation" && value.target === "settings")
    return { type: "host-navigation", target: "settings" };
  return null;
}
