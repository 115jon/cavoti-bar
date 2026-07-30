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
  requestType?: string;
  groupName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  actualCost: number;
  standardCost: number;
  inputCost: number;
  outputCost: number;
  cacheCreationCost: number;
  cacheReadCost: number;
  rateMultiplier: number | null;
  subscriptionCost: number;
  balanceCost: number;
  unchargedCost: number;
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
  errorBody?: string;
};
export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};
export type ChannelMonitor = {
  id?: number;
  name: string;
  provider: string;
  groupName?: string;
  model: string;
  status: string;
  latencyMs: number | null;
  pingLatencyMs?: number | null;
  availability7d: number | null;
  checkedAt: string | null;
  extraModels?: Array<{
    name: string;
    status: string;
    latencyMs: number | null;
  }>;
  timeline?: Array<{
    status: string;
    latencyMs: number | null;
    pingLatencyMs: number | null;
    checkedAt: string | null;
  }>;
};
export type ApiKey = {
  id: number;
  name: string;
  groupId?: number;
  status?: string;
  groupName?: string;
  quota?: number;
  quotaUsed?: number;
  expiresAt?: string | null;
  rateLimit5h?: number;
  rateLimit1d?: number;
  rateLimit7d?: number;
  usage5h?: number;
  usage1d?: number;
  usage7d?: number;
  reset5hAt?: string | null;
  reset1dAt?: string | null;
  reset7dAt?: string | null;
  rateMultiplier?: number;
  rpmLimit?: number;
};
export type OptionItem = { id: number; name: string };
export type ModelPricing = {
  name: string;
  platform: string;
  source: string;
  groupId: number;
  groupName?: string;
  rateMultiplier?: number;
  billingMode: string;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheWritePrice: number | null;
  cacheReadPrice: number | null;
  imageOutputPrice: number | null;
  perRequestPrice: number | null;
  pointPrice: number | null;
  intervals: unknown[];
};
export type UsageFilters = {
  startDate: string;
  endDate: string;
  apiKeyId: number | null;
  model: string;
  groupId: number | null;
  requestType: string;
  billingType: number | null;
  billingMode: string;
  sortBy: "created_at" | "model";
  sortOrder: "asc" | "desc";
  granularity: "day" | "hour";
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
  modelPricing: ModelPricing[];
  banner: { title: string; message: string } | null;
  announcements: Array<{ title: string; message: string }>;
  channelMonitors: ChannelMonitor[];
  apiKeys: ApiKey[];
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
  const rawCacheCreation =
    source.cacheCreationTokens ?? source.cache_creation_tokens;
  const cacheCreationTokens =
    rawCacheCreation === undefined
      ? numberValue(source.cache_creation_5m_tokens) +
        numberValue(source.cache_creation_1h_tokens)
      : numberValue(rawCacheCreation);
  const createdAt = stringValue(
    source.createdAt,
    stringValue(source.created_at),
  );
  const requestType = stringValue(
    source.requestType,
    stringValue(source.request_type),
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
    ...(requestType ? { requestType } : {}),
    groupName: stringValue(
      source.groupName,
      stringValue(source.group_name, "Unknown group"),
    ),
    inputTokens: numberValue(source.inputTokens ?? source.input_tokens),
    outputTokens: numberValue(source.outputTokens ?? source.output_tokens),
    cacheCreationTokens,
    cacheReadTokens: numberValue(
      source.cacheReadTokens ?? source.cache_read_tokens,
    ),
    totalTokens: numberValue(source.totalTokens ?? source.total_tokens),
    actualCost: numberValue(source.actualCost ?? source.actual_cost),
    standardCost: numberValue(
      source.standardCost ?? source.cost ?? source.total_cost,
    ),
    inputCost: numberValue(source.inputCost ?? source.input_cost),
    outputCost: numberValue(source.outputCost ?? source.output_cost),
    cacheCreationCost: numberValue(
      source.cacheCreationCost ?? source.cache_creation_cost,
    ),
    cacheReadCost: numberValue(source.cacheReadCost ?? source.cache_read_cost),
    rateMultiplier: nullableNumber(
      source.rateMultiplier ?? source.rate_multiplier,
    ),
    subscriptionCost: numberValue(
      source.subscriptionCost ?? source.subscription_cost,
    ),
    balanceCost: numberValue(source.balanceCost ?? source.balance_cost),
    unchargedCost: numberValue(source.unchargedCost ?? source.uncharged_cost),
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
    errorBody: stringValue(source.errorBody, stringValue(source.error_body)),
  };
}

function apiKey(value: unknown): ApiKey {
  const source = record(value);
  const optional = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(0, candidate)
      : undefined;
  const optionalDate = (candidate: unknown) =>
    typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))
      ? candidate
      : null;
  return {
    id: numberValue(source.id),
    name: stringValue(source.name, "Unknown key"),
    groupId: numberValue(source.groupId) || undefined,
    status: stringValue(source.status, "unknown"),
    groupName: stringValue(source.groupName, ""),
    quota: optional(source.quota),
    quotaUsed: optional(source.quotaUsed),
    expiresAt: optionalDate(source.expiresAt),
    rateLimit5h: optional(source.rateLimit5h),
    rateLimit1d: optional(source.rateLimit1d),
    rateLimit7d: optional(source.rateLimit7d),
    usage5h: optional(source.usage5h),
    usage1d: optional(source.usage1d),
    usage7d: optional(source.usage7d),
    reset5hAt: optionalDate(source.reset5hAt),
    reset1dAt: optionalDate(source.reset1dAt),
    reset7dAt: optionalDate(source.reset7dAt),
    rateMultiplier: optional(source.rateMultiplier),
    rpmLimit: optional(source.rpmLimit),
  };
}

function modelPricing(value: unknown): ModelPricing {
  const source = record(value);
  return {
    name: stringValue(source.name, "Unknown model"),
    platform: stringValue(source.platform, "unknown"),
    source: stringValue(source.source, "unknown"),
    groupId: numberValue(source.groupId),
    groupName: stringValue(source.groupName),
    rateMultiplier: nullableNumber(source.rateMultiplier) ?? undefined,
    billingMode: stringValue(source.billingMode, "token"),
    inputPrice: nullableNumber(source.inputPrice),
    outputPrice: nullableNumber(source.outputPrice),
    cacheWritePrice: nullableNumber(source.cacheWritePrice),
    cacheReadPrice: nullableNumber(source.cacheReadPrice),
    imageOutputPrice: nullableNumber(source.imageOutputPrice),
    perRequestPrice: nullableNumber(source.perRequestPrice),
    pointPrice: nullableNumber(source.pointPrice),
    intervals: arrayValue(source.intervals),
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
      const timeline = arrayValue(monitor.timeline).map((entry) => {
        const item = record(entry);
        return {
          status: stringValue(item.status, "unknown"),
          latencyMs: nullableNumber(item.latencyMs),
          pingLatencyMs: nullableNumber(item.pingLatencyMs),
          checkedAt:
            typeof item.checkedAt === "string" &&
            !Number.isNaN(Date.parse(item.checkedAt))
              ? item.checkedAt
              : null,
        };
      });
      const extraModels = arrayValue(monitor.extraModels).map((entry) => {
        const item = record(entry);
        return {
          name: stringValue(item.name, "Unknown model"),
          status: stringValue(item.status, "unknown"),
          latencyMs: nullableNumber(item.latencyMs),
        };
      });
      return {
        id: numberValue(monitor.id) || undefined,
        name: stringValue(monitor.name, "Unknown channel"),
        provider: stringValue(monitor.provider, "unknown"),
        groupName: stringValue(monitor.groupName),
        model: stringValue(monitor.model),
        status: stringValue(monitor.status, "unknown"),
        latencyMs: nullableNumber(monitor.latencyMs),
        pingLatencyMs: nullableNumber(monitor.pingLatencyMs),
        availability7d: nullableNumber(monitor.availability7d),
        checkedAt:
          typeof monitor.checkedAt === "string" &&
          !Number.isNaN(Date.parse(monitor.checkedAt))
            ? monitor.checkedAt
            : null,
        extraModels,
        timeline,
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
    apiKeys: arrayValue(source.apiKeys).map(apiKey),
    modelPricing: arrayValue(source.modelPricing).map(modelPricing),
    groupOptions: optionRows(source.groupOptions),
  };
}
