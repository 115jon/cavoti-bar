import { describe, expect, it } from "vitest";
import { normalizeSnapshot, usagePercent } from "./snapshot";

describe("normalizeSnapshot", () => {
  it("normalizes Cavoti aggregate responses into the canonical local envelope", () => {
    const snapshot = normalizeSnapshot({
      version: 1,
      capturedAt: "2026-07-23T10:52:12Z",
      source: "live-webview2",
      account: { displayName: "Connected account", status: "active" },
      subscriptions: [{
         name: "usage_quota",
        status: "active",
        billingKind: "point_pack",
        expiresAt: "2026-08-19T15:47:58Z",
        usage: { daily: { used: 441.5, limit: 650 }, weekly: { used: 473.5, limit: 4000 }, monthly: { used: 473.5, limit: 9000 } },
      }],
      stats: { requests: 4, inputTokens: 20, outputTokens: 8, cacheTokens: 4, totalTokens: 32, actualCost: 2, averageDurationMs: 40, endpoints: [] },
      models: [],
      dailyTrend: [],
      groups: [],
      keys: { total: 1, active: 1, expiringSoon: 0 },
      quotaResetCards: [],
      banner: null,
       announcements: [],
       channelMonitors: [{ name: "Sol", provider: "openai", model: "gpt-5.6-sol", status: "operational", latencyMs: 6400, availability7d: 97.7, checkedAt: "2026-07-24T00:40:00Z" }],
    });

    expect(snapshot?.subscriptions[0]?.name).toBe("Usage quota");
    expect(snapshot?.subscriptions[0]?.billingKind).toBe("Point pack");
    expect(snapshot?.subscriptions[0]?.usage.daily).toEqual({ used: 441.5, limit: 650, unit: "points", resetAt: null });
    expect(snapshot?.stats.totalTokens).toBe(32);
    expect(usagePercent(snapshot?.subscriptions[0]?.usage.daily)).toBe(67.9);
    expect(snapshot?.channelMonitors[0]?.status).toBe("operational");
  });

  it("removes malformed, negative, and unsafe fields", () => {
    const snapshot = normalizeSnapshot({
      version: 1,
      capturedAt: "invalid",
      source: "live-webview2",
      account: { displayName: 4, status: "active", email: "never surface" },
      subscriptions: [{ name: "Lite", usage: { daily: { used: -2, limit: 0 } }, rawKey: "never surface" }],
      stats: { requests: -1, endpoints: [{ name: 2, requests: -3 }] },
      models: [{ name: "gpt", requests: -3, rawIp: "never surface" }],
      dailyTrend: [],
      groups: [],
      keys: { total: 1, active: 3, raw: "never surface" },
      quotaResetCards: [],
      banner: { title: "<script>", message: 2 },
      announcements: [{ title: "Update", message: "Safe", requestId: "never surface" }],
    });

    expect(snapshot?.capturedAt).toBeNull();
    expect(snapshot?.account.displayName).toBe("Connected account");
    expect(snapshot?.stats.requests).toBe(0);
    expect(snapshot?.models[0]).toEqual({ name: "gpt", requests: 0, tokens: 0, actualCost: 0 });
    expect(snapshot?.keys).toEqual({ total: 1, active: 1, expiringSoon: 0 });
  });
});
