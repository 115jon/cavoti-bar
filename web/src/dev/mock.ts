import type { HostBridge } from "../bridge/host";
import type { SnapshotEnvelope, Subscription, UsageWindow } from "../domain/snapshot";
import { liveSnapshot } from "../test/fixtures";

const planNames = ["Lite", "Test", "Max+", "Pro", "Team", "Research", "Staging", "Production", "Sandbox", "Analytics", "Media", "Agents", "Images", "Enterprise", "Archive"];

function quota(used: number, limit: number, resetAt: string): UsageWindow {
  return { used, limit, configured: true, unit: "points", resetAt };
}

function mockPlan(name: string, index: number): Subscription {
  const limit = 650 + index * 350;
  const used = Math.round(limit * (0.12 + (index % 6) * 0.12));
  const limited = index === 2 || index === 9;
  const resetAt = new Date(Date.now() + (index + 1) * 3600000).toISOString();
  return {
    name,
    status: limited ? "limited" : index === 0 ? "active" : "available",
    billingKind: index % 3 === 0 ? "Per-request plan" : "Usage plan",
    quotaState: limited ? "limited" : "available",
    blockedBy: limited ? ["weekly"] : [],
    expiresAt: new Date(Date.now() + 18 * 86400000).toISOString(),
    usage: {
      fiveHour: quota(limited ? limit : used, limit, resetAt),
      daily: quota(limited ? limit : used, limit, resetAt),
      weekly: quota(Math.round(used * 2.8), limit * 5, new Date(Date.now() + 3 * 86400000).toISOString()),
      monthly: quota(Math.round(used * 4.2), limit * 12, new Date(Date.now() + 15 * 86400000).toISOString()),
    },
  };
}

function mockSnapshot(): SnapshotEnvelope {
  return { ...liveSnapshot, capturedAt: new Date().toISOString(), account: { displayName: "Design review account", status: "active" }, subscriptions: planNames.map(mockPlan) };
}

export function createMockBridge(): HostBridge {
  let listener: ((message: unknown) => void) | null = null;
  const emit = () => listener?.({ protocol: 1, type: "snapshot", snapshot: mockSnapshot(), settings: { topmost: false, maximized: false, refreshIntervalSeconds: 60, showFreshnessSeconds: false } });
  return {
    post: (message) => {
      if (message.action === "bootstrap" || message.action === "refresh" || message.action === "connect") window.setTimeout(emit, 120);
    },
    subscribe: (next) => {
      listener = next;
      return () => { listener = null; };
    },
  };
}
