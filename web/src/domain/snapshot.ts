export type UsageUnit = "points" | "usd";
export type UsageWindow = { used: number; limit: number; unit: UsageUnit; resetAt: string | null };

export type Subscription = {
  name: string;
  status: string;
  billingKind: string;
  expiresAt: string | null;
  usage: { daily: UsageWindow; weekly: UsageWindow; monthly: UsageWindow };
};

export type UsageRow = { name: string; requests: number; tokens: number; actualCost: number };

export type SnapshotEnvelope = {
  version: 1;
  capturedAt: string | null;
  source: string;
  account: { displayName: string; status: string };
  subscriptions: Subscription[];
  stats: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
    actualCost: number;
    averageDurationMs: number;
    endpoints: UsageRow[];
  };
  models: UsageRow[];
  dailyTrend: Array<{ date: string; requests: number; tokens: number; actualCost: number }>;
  groups: UsageRow[];
  keys: { total: number; active: number; expiringSoon: number };
  quotaResetCards: Array<{ label: string; resetAt: string | null }>;
  banner: { title: string; message: string } | null;
  announcements: Array<{ title: string; message: string }>;
};

export type CavotiPayload = Record<string, unknown>;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringValue = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const numberValue = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const arrayValue = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function usageUnit(value: unknown, fallback: UsageUnit): UsageUnit {
  return value === "points" || value === "usd" ? value : fallback;
}

function windowValue(value: unknown, fallbackUnit: UsageUnit): UsageWindow {
  const source = record(value);
  return { used: numberValue(source.used), limit: numberValue(source.limit), unit: usageUnit(source.unit, fallbackUnit), resetAt: typeof source.resetAt === "string" && !Number.isNaN(Date.parse(source.resetAt)) ? source.resetAt : null };
}

function row(value: unknown): UsageRow {
  const source = record(value);
  return {
    name: stringValue(source.name, "Unknown"),
    requests: numberValue(source.requests),
    tokens: numberValue(source.tokens),
    actualCost: numberValue(source.actualCost),
  };
}

export function usagePercent(value: UsageWindow | undefined): number {
  if (!value?.limit) return 0;
  return Math.min(100, Math.max(0, Number(((value.used / value.limit) * 100).toFixed(1))));
}

export function normalizeSnapshot(payload: unknown): SnapshotEnvelope | null {
  const source = record(payload);
  if (source.version !== 1) return null;
  const account = record(source.account);
  const stats = record(source.stats);
  const subscriptions = arrayValue(source.subscriptions).filter((value) => Object.keys(record(value)).length > 0).map((value) => {
    const item = record(value);
    const usage = record(item.usage);
    const billingKind = stringValue(item.billingKind, "subscription");
    const pointBased = billingKind.toLowerCase().includes("point");
    const fallbackUnit: UsageUnit = pointBased ? "points" : "usd";
    return {
      name: stringValue(item.name, "Unnamed plan"),
      status: stringValue(item.status, "unknown"),
      billingKind: pointBased ? "Point pack" : billingKind === "subscription" ? "Subscription" : billingKind,
      expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
      usage: { daily: windowValue(usage.daily, fallbackUnit), weekly: windowValue(usage.weekly, fallbackUnit), monthly: windowValue(usage.monthly, fallbackUnit) },
    };
  });
  const normalizeRows = (value: unknown) => arrayValue(value).filter((item) => Object.keys(record(item)).length > 0).map(row);
  const keys = record(source.keys);
  const bannerSource = record(source.banner);
  const banner = typeof source.banner === "object" && source.banner !== null && typeof bannerSource.title === "string"
    ? { title: bannerSource.title, message: stringValue(bannerSource.message) }
    : null;
  return {
    version: 1,
    capturedAt: typeof source.capturedAt === "string" && !Number.isNaN(Date.parse(source.capturedAt)) ? source.capturedAt : null,
    source: stringValue(source.source, "live-webview2"),
    account: { displayName: stringValue(account.displayName, "Connected account"), status: stringValue(account.status, "unknown") },
    subscriptions,
    stats: {
      requests: numberValue(stats.requests), inputTokens: numberValue(stats.inputTokens), outputTokens: numberValue(stats.outputTokens),
      cacheTokens: numberValue(stats.cacheTokens), totalTokens: numberValue(stats.totalTokens), actualCost: numberValue(stats.actualCost),
      averageDurationMs: numberValue(stats.averageDurationMs), endpoints: normalizeRows(stats.endpoints),
    },
    models: normalizeRows(source.models),
    dailyTrend: arrayValue(source.dailyTrend).filter((item) => Object.keys(record(item)).length > 0).map((item) => {
      const trend = record(item);
      return { date: stringValue(trend.date), requests: numberValue(trend.requests), tokens: numberValue(trend.tokens), actualCost: numberValue(trend.actualCost) };
    }),
    groups: normalizeRows(source.groups),
    keys: { total: numberValue(keys.total), active: Math.min(numberValue(keys.total), numberValue(keys.active)), expiringSoon: numberValue(keys.expiringSoon) },
    quotaResetCards: arrayValue(source.quotaResetCards).filter((item) => Object.keys(record(item)).length > 0).map((item) => {
      const card = record(item); return { label: stringValue(card.label, "Quota reset"), resetAt: typeof card.resetAt === "string" ? card.resetAt : null };
    }),
    banner,
    announcements: arrayValue(source.announcements).filter((item) => Object.keys(record(item)).length > 0).map((item) => {
      const announcement = record(item); return { title: stringValue(announcement.title, "Announcement"), message: stringValue(announcement.message) };
    }),
  };
}
