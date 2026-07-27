import { describe, expect, it } from "vitest";
import { normalizeSnapshot, usagePercent } from "./snapshot";

describe("normalizeSnapshot", () => {
  it("normalizes Cavoti aggregate responses into the canonical local envelope", () => {
    const snapshot = normalizeSnapshot({
      version: 1,
      capturedAt: "2026-07-23T10:52:12Z",
      source: "live-cavoti-webview",
      account: { displayName: "Connected account", status: "active" },
      subscriptions: [
        {
          name: "usage_quota",
          status: "active",
          billingKind: "point_pack",
          expiresAt: "2026-08-19T15:47:58Z",
          usage: {
            fiveHour: { used: 441.5, limit: 650 },
            weekly: { used: 473.5, limit: 4000 },
            monthly: { used: 473.5, limit: 9000 },
          },
        },
      ],
      stats: {
        requests: 4,
        inputTokens: 20,
        outputTokens: 8,
        cacheTokens: 4,
        totalTokens: 32,
        actualCost: 2,
        averageDurationMs: 40,
        endpoints: [],
      },
      models: [],
      dailyTrend: [],
      groups: [],
      keys: { total: 1, active: 1, expiringSoon: 0 },
      quotaResetCards: [],
      banner: null,
      announcements: [],
      channelMonitors: [
        {
          name: "Sol",
          provider: "openai",
          model: "gpt-5.6-sol",
          status: "operational",
          latencyMs: 6400,
          availability7d: 97.7,
          checkedAt: "2026-07-24T00:40:00Z",
        },
      ],
    });

    expect(snapshot?.subscriptions[0]?.name).toBe("Usage plan");
    expect(snapshot?.subscriptions[0]?.billingKind).toBe("Per-request plan");
    expect(snapshot?.subscriptions[0]?.usage.fiveHour).toEqual({
      used: 441.5,
      limit: 650,
      configured: true,
      unit: "points",
      resetAt: null,
    });
    expect(snapshot?.stats.totalTokens).toBe(32);
    expect(usagePercent(snapshot?.subscriptions[0]?.usage.fiveHour)).toBe(67.9);
    expect(snapshot?.channelMonitors[0]?.status).toBe("operational");
  });

  it("removes malformed, negative, and unsafe fields", () => {
    const snapshot = normalizeSnapshot({
      version: 1,
      capturedAt: "invalid",
      source: "live-cavoti-webview",
      account: { displayName: 4, status: "active", email: "never surface" },
      subscriptions: [
        {
          name: "Lite",
          usage: { daily: { used: -2, limit: 0 } },
          rawKey: "never surface",
        },
      ],
      stats: { requests: -1, endpoints: [{ name: 2, requests: -3 }] },
      models: [{ name: "gpt", requests: -3, rawIp: "never surface" }],
      dailyTrend: [],
      groups: [],
      keys: { total: 1, active: 3, raw: "never surface" },
      quotaResetCards: [],
      banner: { title: "<script>", message: 2 },
      announcements: [
        { title: "Update", message: "Safe", requestId: "never surface" },
      ],
    });

    expect(snapshot?.capturedAt).toBeNull();
    expect(snapshot?.account.displayName).toBe("Connected account");
    expect(snapshot?.stats.requests).toBe(0);
    expect(snapshot?.models[0]).toEqual({
      name: "gpt",
      requests: 0,
      tokens: 0,
      actualCost: 0,
    });
    expect(snapshot?.keys).toEqual({ total: 1, active: 1, expiringSoon: 0 });
  });

  it("normalizes rich usage rows and keeps sensitive nested data out of the UI contract", () => {
    const snapshot = normalizeSnapshot({
      version: 1,
      stats: { endpoints: [] },
      models: [],
      dailyTrend: [],
      groups: [],
      usageLogs: [
        {
          id: 7,
          request_id: "req-7",
          api_key_name: "Primary",
          model: "gpt-5.6-luna",
          reasoning_effort: "high",
          inbound_endpoint: "/v1/chat/completions",
          group_name: "Core",
          input_tokens: 12,
          output_tokens: 8,
          cache_creation_tokens: 2,
          cache_read_tokens: 4,
          total_tokens: 26,
          actual_cost: 0.12,
          cost: 0.2,
          first_token_ms: 90,
          duration_ms: 640,
          ip_address: "192.0.2.10",
          location: {
            city: "Example City",
            country: "Exampleland",
            country_code: "EX",
          },
          user_agent: "Cavoti test",
          created_at: "2026-07-24T10:00:00Z",
          api_key: { secret: "must not surface" },
          user: { email: "must not surface" },
        },
      ],
      errors: [
        {
          id: 8,
          model: "gpt-5.6-luna",
          status_code: 429,
          message: "Rate limited",
          key_name: "Primary",
          created_at: "2026-07-24T10:01:00Z",
        },
      ],
    });

    expect(snapshot?.usageLogs[0]).toEqual({
      id: 7,
      requestId: "req-7",
      apiKeyName: "Primary",
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      endpoint: "/v1/chat/completions",
      groupName: "Core",
      inputTokens: 12,
      outputTokens: 8,
      cacheCreationTokens: 2,
      cacheReadTokens: 4,
      totalTokens: 26,
      actualCost: 0.12,
      standardCost: 0.2,
      timeToFirstTokenMs: 90,
      durationMs: 640,
      ipAddress: "192.0.2.10",
      location: {
        city: "Example City",
        region: "",
        country: "Exampleland",
        countryCode: "EX",
        organization: "",
        timezone: "",
      },
      userAgent: "Cavoti test",
      createdAt: "2026-07-24T10:00:00Z",
    });
    expect(snapshot?.errors[0]?.message).toBe("Rate limited");
  });
});
