export type UsageUnit = "points" | "usd";
export type UsageWindow = {
  used: number;
  limit: number;
  configured: boolean;
  unit: UsageUnit;
  resetAt: string | null;
};

export type Subscription = {
  name: string;
  status: string;
  billingKind: string;
  quotaState: "available" | "limited";
  blockedBy: string[];
  expiresAt: string | null;
  usage: {
    fiveHour: UsageWindow;
    daily: UsageWindow;
    weekly: UsageWindow;
    monthly: UsageWindow;
  };
};

export type UsageRow = {
  name: string;
  requests: number;
  tokens: number;
  actualCost: number;
  standardCost?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};
export type IpLocation = {
  city: string;
  region: string;
  country: string;
  countryCode: string;
  organization: string;
  timezone: string;
};
export type UsageLog = {
  id: number;
  requestId: string;
  apiKeyName: string;
  model: string;
  reasoningEffort: string;
  endpoint: string;
  groupName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  actualCost: number;
  standardCost: number;
  timeToFirstTokenMs: number;
  durationMs: number;
  ipAddress: string;
  location: IpLocation | null;
  userAgent: string;
  createdAt: string;
};
export type UsageError = {
  id: number;
  createdAt: string;
  model: string;
  endpoint: string;
  statusCode: number;
  category: string;
  platform: string;
  message: string;
  keyName: string;
  keyDeleted: boolean;
};
export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};
export type ChannelMonitor = {
  name: string;
  provider: string;
  model: string;
  status: string;
  latencyMs: number | null;
  availability7d: number | null;
  checkedAt: string | null;
};
export type OptionItem = { id: number; name: string };
export type UsageFilters = {
  startDate: string;
  endDate: string;
  apiKeyId: number | null;
  model: string;
  groupId: number | null;
  requestType: string;
  billingType: number | null;
  billingMode: string;
};

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
    cacheCreationTokens: number;
    cacheReadTokens: number;
    actualCost: number;
    standardCost: number;
    averageDurationMs: number;
    endpoints: UsageRow[];
  };
  models: UsageRow[];
  dailyTrend: Array<{
    date: string;
    requests: number;
    tokens: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    actualCost: number;
    standardCost?: number;
  }>;
  groups: UsageRow[];
  usageLogs: UsageLog[];
  usagePageInfo: PageInfo;
  errors: UsageError[];
  errorPageInfo: PageInfo;
  keys: { total: number; active: number; expiringSoon: number };
  quotaResetCards: Array<{ label: string; resetAt: string | null }>;
  banner: { title: string; message: string } | null;
  announcements: Array<{ title: string; message: string }>;
  channelMonitors: ChannelMonitor[];
  apiKeys: OptionItem[];
  groupOptions: OptionItem[];
};

export type CavotiPayload = Record<string, unknown>;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const stringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const numberValue = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
const nullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
const arrayValue = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const optionRows = (value: unknown): OptionItem[] =>
  arrayValue(value)
    .map((item) => {
      const source = record(item);
      return {
        id: numberValue(source.id),
        name: stringValue(source.name, "Unknown"),
      };
    })
    .filter((item) => item.id > 0);

function pageInfo(value: unknown): PageInfo {
  const source = record(value);
  const pageSize = Math.max(
    1,
    numberValue(source.pageSize ?? source.page_size) || 100,
  );
  const total = numberValue(source.total);
  const pages = Math.max(
    1,
    numberValue(source.pages) || Math.ceil(total / pageSize) || 1,
  );
  return {
    page: Math.min(pages, Math.max(1, numberValue(source.page) || 1)),
    pageSize,
    total,
    pages,
  };
}

function usageUnit(value: unknown, fallback: UsageUnit): UsageUnit {
  return value === "points" || value === "usd" ? value : fallback;
}

function windowValue(value: unknown, fallbackUnit: UsageUnit): UsageWindow {
  const source = record(value);
  return {
    used: numberValue(source.used),
    limit: numberValue(source.limit),
    configured:
      typeof source.configured === "boolean"
        ? source.configured
        : numberValue(source.limit) > 0,
    unit: usageUnit(source.unit, fallbackUnit),
    resetAt:
      typeof source.resetAt === "string" &&
      !Number.isNaN(Date.parse(source.resetAt))
        ? source.resetAt
        : null,
  };
}

function row(value: unknown): UsageRow {
  const source = record(value);
  const normalized: UsageRow = {
    name: stringValue(source.name, "Unknown"),
    requests: numberValue(source.requests),
    tokens: numberValue(source.tokens),
    actualCost: numberValue(source.actualCost),
  };
  const optionalFields: Array<[keyof UsageRow, unknown]> = [
    ["standardCost", source.standardCost],
    ["inputTokens", source.inputTokens],
    ["outputTokens", source.outputTokens],
    ["cacheCreationTokens", source.cacheCreationTokens],
    ["cacheReadTokens", source.cacheReadTokens],
  ];
  for (const [key, value] of optionalFields)
    if (typeof value === "number" && Number.isFinite(value))
      Object.assign(normalized, { [key]: Math.max(0, value) });
  return normalized;
}

function location(value: unknown): IpLocation | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  return {
    city: stringValue(source.city),
    region: stringValue(source.region),
    country: stringValue(source.country),
    countryCode: stringValue(
      source.countryCode,
      stringValue(source.country_code),
    ),
    organization: stringValue(
      source.organization,
      stringValue(source.organization_name),
    ),
    timezone: stringValue(source.timezone),
  };
}

function usageLog(value: unknown): UsageLog {
  const source = record(value);
  const createdAt = stringValue(
    source.createdAt,
    stringValue(source.created_at),
  );
  return {
    id: numberValue(source.id),
    requestId: stringValue(source.requestId, stringValue(source.request_id)),
    apiKeyName: stringValue(
      source.apiKeyName,
      stringValue(source.api_key_name, "Unknown key"),
    ),
    model: stringValue(source.model, "Unknown model"),
    reasoningEffort: stringValue(
      source.reasoningEffort,
      stringValue(source.reasoning_effort, "default"),
    ),
    endpoint: stringValue(
      source.endpoint,
      stringValue(source.inbound_endpoint, "Unknown endpoint"),
    ),
    groupName: stringValue(
      source.groupName,
      stringValue(source.group_name, "Unknown group"),
    ),
    inputTokens: numberValue(source.inputTokens ?? source.input_tokens),
    outputTokens: numberValue(source.outputTokens ?? source.output_tokens),
    cacheCreationTokens: numberValue(
      source.cacheCreationTokens ?? source.cache_creation_tokens,
    ),
    cacheReadTokens: numberValue(
      source.cacheReadTokens ?? source.cache_read_tokens,
    ),
    totalTokens: numberValue(source.totalTokens ?? source.total_tokens),
    actualCost: numberValue(source.actualCost ?? source.actual_cost),
    standardCost: numberValue(
      source.standardCost ?? source.cost ?? source.total_cost,
    ),
    timeToFirstTokenMs: numberValue(
      source.timeToFirstTokenMs ?? source.first_token_ms,
    ),
    durationMs: numberValue(source.durationMs ?? source.duration_ms),
    ipAddress: stringValue(
      source.ipAddress,
      stringValue(source.ip_address, "Unknown IP"),
    ),
    location: location(source.location),
    userAgent: stringValue(
      source.userAgent,
      stringValue(source.user_agent, "Unknown client"),
    ),
    createdAt: !Number.isNaN(Date.parse(createdAt)) ? createdAt : "",
  };
}

function usageError(value: unknown): UsageError {
  const source = record(value);
  const createdAt = stringValue(
    source.createdAt,
    stringValue(source.created_at),
  );
  return {
    id: numberValue(source.id),
    createdAt: !Number.isNaN(Date.parse(createdAt)) ? createdAt : "",
    model: stringValue(source.model, "Unknown model"),
    endpoint: stringValue(
      source.endpoint,
      stringValue(source.inbound_endpoint, "Unknown endpoint"),
    ),
    statusCode: numberValue(source.statusCode ?? source.status_code),
    category: stringValue(source.category, "Unknown"),
    platform: stringValue(source.platform, "Unknown"),
    message: stringValue(source.message, "No error message"),
    keyName: stringValue(
      source.keyName,
      stringValue(source.key_name, "Unknown key"),
    ),
    keyDeleted: source.keyDeleted === true || source.key_deleted === true,
  };
}

export function usagePercent(value: UsageWindow | undefined): number {
  if (!value?.configured || !value.limit) return 0;
  return Math.min(
    100,
    Math.max(0, Number(((value.used / value.limit) * 100).toFixed(1))),
  );
}

export function normalizeSnapshot(payload: unknown): SnapshotEnvelope | null {
  const source = record(payload);
  if (source.version !== 1) return null;
  const account = record(source.account);
  const stats = record(source.stats);
  const subscriptions = arrayValue(source.subscriptions)
    .filter((value) => Object.keys(record(value)).length > 0)
    .map((value) => {
      const item = record(value);
      const usage = record(item.usage);
      const rawName = stringValue(item.name, "Unnamed plan");
      const rawBillingKind = stringValue(item.billingKind, "subscription");
      const pointBased = rawBillingKind.toLowerCase().includes("point");
      const billingKind = pointBased
        ? "Per-request plan"
        : rawBillingKind.toLowerCase() === "usage_quota"
          ? "Usage plan"
          : rawBillingKind;
      const fallbackUnit: UsageUnit = pointBased ? "points" : "usd";
      const fiveHour = windowValue(usage.fiveHour ?? usage.daily, fallbackUnit);
      const weekly = windowValue(usage.weekly, fallbackUnit);
      const monthly = windowValue(usage.monthly, fallbackUnit);
      const blockedBy = [
        fiveHour.limit > 0 && fiveHour.used >= fiveHour.limit ? "5 hour" : null,
        weekly.limit > 0 && weekly.used >= weekly.limit ? "7 day" : null,
        monthly.limit > 0 && monthly.used >= monthly.limit ? "30 day" : null,
      ].filter((value): value is string => value !== null);
      const quotaState: Subscription["quotaState"] =
        blockedBy.length > 0 ? "limited" : "available";
      const displayBillingKind =
        billingKind === "subscription" ? "Subscription" : billingKind;
      const status = stringValue(item.status, "unknown");
      return {
        name: rawName.toLowerCase() === "usage_quota" ? "Usage plan" : rawName,
        status:
          quotaState === "limited" && status === "active" ? "Limited" : status,
        billingKind: displayBillingKind,
        quotaState,
        blockedBy,
        expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null,
        usage: { fiveHour, daily: fiveHour, weekly, monthly },
      };
    });
  const normalizeRows = (value: unknown) =>
    arrayValue(value)
      .filter((item) => Object.keys(record(item)).length > 0)
      .map(row);
  const keys = record(source.keys);
  const bannerSource = record(source.banner);
  const banner =
    typeof source.banner === "object" &&
    source.banner !== null &&
    typeof bannerSource.title === "string"
      ? {
          title: bannerSource.title,
          message: stringValue(bannerSource.message),
        }
      : null;
  const channelMonitors = arrayValue(source.channelMonitors)
    .filter((item) => Object.keys(record(item)).length > 0)
    .map((item) => {
      const monitor = record(item);
      return {
        name: stringValue(monitor.name, "Unknown channel"),
        provider: stringValue(monitor.provider, "unknown"),
        model: stringValue(monitor.model),
        status: stringValue(monitor.status, "unknown"),
        latencyMs: nullableNumber(monitor.latencyMs),
        availability7d: nullableNumber(monitor.availability7d),
        checkedAt:
          typeof monitor.checkedAt === "string" &&
          !Number.isNaN(Date.parse(monitor.checkedAt))
            ? monitor.checkedAt
            : null,
      };
    });
  return {
    version: 1,
    capturedAt:
      typeof source.capturedAt === "string" &&
      !Number.isNaN(Date.parse(source.capturedAt))
        ? source.capturedAt
        : null,
    source: stringValue(source.source, "live-cavoti-webview"),
    account: {
      displayName: stringValue(account.displayName, "Connected account"),
      status: stringValue(account.status, "unknown"),
    },
    subscriptions,
    stats: {
      requests: numberValue(stats.requests),
      inputTokens: numberValue(stats.inputTokens),
      outputTokens: numberValue(stats.outputTokens),
      cacheTokens: numberValue(stats.cacheTokens),
      totalTokens: numberValue(stats.totalTokens),
      cacheCreationTokens: numberValue(stats.cacheCreationTokens),
      cacheReadTokens: numberValue(stats.cacheReadTokens),
      actualCost: numberValue(stats.actualCost),
      standardCost: numberValue(stats.standardCost),
      averageDurationMs: numberValue(stats.averageDurationMs),
      endpoints: normalizeRows(stats.endpoints),
    },
    models: normalizeRows(source.models),
    dailyTrend: arrayValue(source.dailyTrend)
      .filter((item) => Object.keys(record(item)).length > 0)
      .map((item) => {
        const trend = record(item);
        return {
          date: stringValue(trend.date),
          requests: numberValue(trend.requests),
          tokens: numberValue(trend.tokens),
          actualCost: numberValue(trend.actualCost),
          ...(typeof trend.standardCost === "number"
            ? { standardCost: numberValue(trend.standardCost) }
            : {}),
          ...(typeof trend.inputTokens === "number"
            ? { inputTokens: numberValue(trend.inputTokens) }
            : {}),
          ...(typeof trend.outputTokens === "number"
            ? { outputTokens: numberValue(trend.outputTokens) }
            : {}),
          ...(typeof trend.cacheCreationTokens === "number"
            ? { cacheCreationTokens: numberValue(trend.cacheCreationTokens) }
            : {}),
          ...(typeof trend.cacheReadTokens === "number"
            ? { cacheReadTokens: numberValue(trend.cacheReadTokens) }
            : {}),
        };
      }),
    groups: normalizeRows(source.groups),
    usageLogs: arrayValue(source.usageLogs).map(usageLog),
    usagePageInfo: pageInfo(source.usagePageInfo),
    errors: arrayValue(source.errors).map(usageError),
    errorPageInfo: pageInfo(source.errorPageInfo),
    keys: {
      total: numberValue(keys.total),
      active: Math.min(numberValue(keys.total), numberValue(keys.active)),
      expiringSoon: numberValue(keys.expiringSoon),
    },
    quotaResetCards: arrayValue(source.quotaResetCards)
      .filter((item) => Object.keys(record(item)).length > 0)
      .map((item) => {
        const card = record(item);
        return {
          label: stringValue(card.label, "Quota reset"),
          resetAt: typeof card.resetAt === "string" ? card.resetAt : null,
        };
      }),
    banner,
    announcements: arrayValue(source.announcements)
      .filter((item) => Object.keys(record(item)).length > 0)
      .map((item) => {
        const announcement = record(item);
        return {
          title: stringValue(announcement.title, "Announcement"),
          message: stringValue(announcement.message),
        };
      }),
    channelMonitors,
    apiKeys: optionRows(source.apiKeys),
    groupOptions: optionRows(source.groupOptions),
  };
}
