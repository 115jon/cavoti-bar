import type { SnapshotEnvelope } from "../domain/snapshot";

export const liveSnapshot: SnapshotEnvelope = {
  version: 1,
  capturedAt: "2026-07-23T10:52:12.000Z",
  source: "live-webview2",
  account: {
    displayName: "Connected account",
    status: "active",
  },
  subscriptions: [
    {
      name: "Lite",
      status: "active",
      billingKind: "point_pack",
      expiresAt: "2026-08-19T15:47:58.000Z",
      usage: {
        daily: { used: 441.5, limit: 650, unit: "points", resetAt: "2026-07-24T10:06:49.000Z" },
        weekly: { used: 473.5, limit: 4000, unit: "points", resetAt: "2026-07-29T23:05:48.000Z" },
        monthly: { used: 473.5, limit: 9000, unit: "points", resetAt: "2026-08-22T23:05:48.000Z" },
      },
    },
  ],
  stats: {
    requests: 26326,
    inputTokens: 357486952,
    outputTokens: 15790536,
    cacheTokens: 3535512908,
    totalTokens: 3908790396,
    actualCost: 635.5365728933,
    averageDurationMs: 812,
    endpoints: [{ name: "/v1/chat/completions", requests: 26326, tokens: 3908790396, actualCost: 635.5365728933 }],
  },
  models: [{ name: "gpt-5.6-luna", requests: 19580, tokens: 3000000000, actualCost: 235.3303185433 }],
  dailyTrend: [{ date: "2026-07-23", requests: 4957, tokens: 700000000, actualCost: 82.13 }],
  groups: [{ name: "Default", requests: 26326, tokens: 3908790396, actualCost: 635.5365728933 }],
  keys: { total: 2, active: 2, expiringSoon: 0 },
  quotaResetCards: [],
  banner: null,
  announcements: [],
  channelMonitors: [{ name: "gpt-5.6-sol", provider: "openai", model: "gpt-5.6-sol", status: "operational", latencyMs: 6842, availability7d: 97.7, checkedAt: "2026-07-24T00:40:00Z" }],
};
