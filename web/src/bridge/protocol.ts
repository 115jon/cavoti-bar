import type { SnapshotEnvelope } from "../domain/snapshot";

export type HostSettings = {
  topmost: boolean;
  maximized: boolean;
  refreshIntervalSeconds: number;
  showFreshnessSeconds: boolean;
  updateReady?: boolean;
};

export type HostMessage =
  | {
      type: "snapshot";
      snapshot: SnapshotEnvelope;
      settings?: HostSettings;
    }
  | { type: "settings"; settings: HostSettings }
  | { type: "bridge-state"; state: "auth-required" | "offline" | "error" | "loading"; status: number; message: string };
type BridgeState = "auth-required" | "offline" | "error" | "loading";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value) || value.protocol !== 1 || typeof value.type !== "string") return null;
  if (value.type === "snapshot" && isRecord(value.snapshot) && value.snapshot.version === 1) {
    const settings =
      isRecord(value.settings) &&
      typeof value.settings.topmost === "boolean" &&
      typeof value.settings.maximized === "boolean" &&
      typeof value.settings.refreshIntervalSeconds === "number" &&
      typeof value.settings.showFreshnessSeconds === "boolean"
        ? {
            topmost: value.settings.topmost,
            maximized: value.settings.maximized,
            refreshIntervalSeconds: value.settings.refreshIntervalSeconds,
            showFreshnessSeconds: value.settings.showFreshnessSeconds,
            ...(typeof value.settings.updateReady === "boolean" ? { updateReady: value.settings.updateReady } : {}),
          }
        : undefined;
    return {
      type: "snapshot",
      snapshot: value.snapshot as unknown as SnapshotEnvelope,
      settings,
    };
  }
  if (
    value.type === "settings" &&
    isRecord(value.settings) &&
    typeof value.settings.topmost === "boolean" &&
    typeof value.settings.maximized === "boolean" &&
    typeof value.settings.refreshIntervalSeconds === "number" &&
    typeof value.settings.showFreshnessSeconds === "boolean"
  )
    return {
      type: "settings",
      settings: {
        topmost: value.settings.topmost,
        maximized: value.settings.maximized,
        refreshIntervalSeconds: value.settings.refreshIntervalSeconds,
        showFreshnessSeconds: value.settings.showFreshnessSeconds,
        ...(typeof value.settings.updateReady === "boolean" ? { updateReady: value.settings.updateReady } : {}),
      },
    };
  if (value.type === "bridge-state" && ["auth-required", "offline", "error", "loading"].includes(String(value.state))) {
    return {
      type: "bridge-state",
      state: value.state as BridgeState,
      status: typeof value.status === "number" ? value.status : 0,
      message: typeof value.message === "string" ? value.message : "Cavoti connection unavailable",
    };
  }
  return null;
}
