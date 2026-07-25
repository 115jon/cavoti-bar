import { useState, type ReactNode } from "react";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  ChartBarIcon as ChartBar,
  StackIcon as Stack,
  UsersThreeIcon as UsersThree,
  XIcon as X,
} from "@phosphor-icons/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  PageInfo,
  SnapshotEnvelope,
  UsageFilters as UsageFilterState,
  UsageLog,
  UsageRow,
} from "../domain/snapshot";
import {
  dateRangeForPreset,
  dateRangeOptions,
  defaultUsageFilterState,
  integer,
  money,
  tokens,
  type DateRangePreset,
} from "../app/formatters";
import {
  Badge,
  Empty,
  TilePager,
  useCompactTiles,
} from "../components/app/shared";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";

type DistributionMetric = "cost" | "tokens";
type DistributionPoint = UsageRow & {
  value: number;
  fill: string;
  percentage: number;
};
const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function StatRail({ snapshot }: { snapshot: SnapshotEnvelope }) {
  return (
    <Card className="grid grid-cols-2 gap-0 overflow-hidden rounded-xl border border-(--line) bg-white/75 p-0 shadow-sm sm:grid-cols-3 xl:grid-cols-5">
      <div>
        <span className="block p-2 text-[10px] text-(--ink-muted)">
          Requests
        </span>
        <strong className="block px-2 pb-2 text-base font-semibold tabular-nums">
          {integer(snapshot.stats.requests)}
        </strong>
      </div>
      <div>
        <span className="block border-l border-(--line) p-2 text-[10px] text-(--ink-muted)">
          Total tokens
        </span>
        <strong className="block border-l border-(--line) px-2 pb-2 text-base font-semibold tabular-nums">
          {tokens(snapshot.stats.totalTokens)}
        </strong>
      </div>
      <div>
        <span className="block border-l border-(--line) p-2 text-[10px] text-(--ink-muted)">
          Actual cost
        </span>
        <strong className="block border-l border-(--line) px-2 pb-2 text-base font-semibold tabular-nums">
          {money(snapshot.stats.actualCost)}
        </strong>
      </div>
      <div>
        <span className="block border-l border-(--line) p-2 text-[10px] text-(--ink-muted)">
          Standard cost
        </span>
        <strong className="block border-l border-(--line) px-2 pb-2 text-base font-semibold tabular-nums">
          {money(snapshot.stats.standardCost)}
        </strong>
      </div>
      <div>
        <span className="block border-l border-(--line) p-2 text-[10px] text-(--ink-muted)">
          Avg duration
        </span>
        <strong className="block border-l border-(--line) px-2 pb-2 text-base font-semibold tabular-nums">
          {snapshot.stats.averageDurationMs
            ? `${(snapshot.stats.averageDurationMs / 1000).toFixed(1)} s`
            : "-"}
        </strong>
      </div>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const fieldId = `usage-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        value={value || "__all__"}
        onValueChange={(next) => onChange(next === "__all__" ? "" : next)}
      >
        <SelectTrigger id={fieldId} size="sm" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                value={option.value || "__all__"}
                key={`${label}-${option.value}`}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function DateRangeSelect({
  filters,
  onChange,
}: {
  filters: UsageFilterState;
  onChange: (filters: Pick<UsageFilterState, "startDate" | "endDate">) => void;
}) {
  const preset = dateRangeOptions.find(({ value }) => {
    const range = dateRangeForPreset(value);
    return (
      range.startDate === filters.startDate && range.endDate === filters.endDate
    );
  })?.value;
  const value = preset ?? "custom";
  return (
    <>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== "custom")
            onChange(dateRangeForPreset(next as DateRangePreset));
        }}
      >
        <SelectTrigger id="usage-date-range" size="sm" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {dateRangeOptions.map((option) => (
              <SelectItem value={option.value} key={option.value}>
                {option.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {value === "custom" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Input
            id="usage-start-date"
            type="date"
            aria-label="Start date"
            value={filters.startDate}
            onChange={(event) =>
              onChange({
                startDate: event.target.value,
                endDate: filters.endDate,
              })
            }
          />
          <Input
            id="usage-end-date"
            type="date"
            aria-label="End date"
            value={filters.endDate}
            onChange={(event) =>
              onChange({
                startDate: filters.startDate,
                endDate: event.target.value,
              })
            }
          />
        </div>
      ) : null}
    </>
  );
}

function UsageFilters({
  snapshot,
  filters,
  onChange,
  onRefresh,
  onReset,
}: {
  snapshot: SnapshotEnvelope;
  filters: UsageFilterState;
  onChange: (filters: UsageFilterState) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const models = snapshot.models
    .map((model) => model.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();
  const update = (patch: Partial<UsageFilterState>) =>
    onChange({ ...filters, ...patch });
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-(--line) bg-white/60 p-3">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(180px,1.25fr)_repeat(3,minmax(130px,1fr))]">
        <div className="flex min-w-0 flex-col gap-1 col-span-full xl:col-auto">
          <Label htmlFor="usage-start-date">Date range</Label>
          <DateRangeSelect filters={filters} onChange={update} />
        </div>
        <FilterSelect
          label="API key"
          value={filters.apiKeyId === null ? "" : String(filters.apiKeyId)}
          options={[
            { value: "", label: "All API keys" },
            ...snapshot.apiKeys.map((item) => ({
              value: String(item.id),
              label: item.name,
            })),
          ]}
          onChange={(value) =>
            update({ apiKeyId: value ? Number(value) : null })
          }
        />
        <FilterSelect
          label="Model"
          value={filters.model}
          options={[
            { value: "", label: "All models" },
            ...models.map((model) => ({ value: model, label: model })),
          ]}
          onChange={(model) => update({ model })}
        />
        <FilterSelect
          label="Group"
          value={filters.groupId === null ? "" : String(filters.groupId)}
          options={[
            { value: "", label: "All groups" },
            ...snapshot.groupOptions.map((item) => ({
              value: String(item.id),
              label: item.name,
            })),
          ]}
          onChange={(value) =>
            update({ groupId: value ? Number(value) : null })
          }
        />
        <FilterSelect
          label="Type"
          value={filters.requestType}
          options={[
            { value: "", label: "All types" },
            { value: "ws_v2", label: "WS" },
            { value: "stream", label: "Stream" },
            { value: "sync", label: "Sync" },
          ]}
          onChange={(requestType) => update({ requestType })}
        />
        <FilterSelect
          label="Billing type"
          value={
            filters.billingType === null ? "" : String(filters.billingType)
          }
          options={[
            { value: "", label: "All billing types" },
            { value: "0", label: "Balance" },
            { value: "1", label: "Subscription" },
          ]}
          onChange={(value) =>
            update({ billingType: value ? Number(value) : null })
          }
        />
        <FilterSelect
          label="Billing mode"
          value={filters.billingMode}
          options={[
            { value: "", label: "All billing modes" },
            { value: "token", label: "Token" },
            { value: "per_request", label: "Per request" },
            { value: "image", label: "Image" },
          ]}
          onChange={(billingMode) => update({ billingMode })}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onRefresh}>
          <ArrowsClockwise data-icon="inline-start" /> Refresh usage
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          <X data-icon="inline-start" /> Reset filters
        </Button>
      </div>
    </section>
  );
}

function DistributionTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DistributionPoint }>;
  metric: DistributionMetric;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="relative z-50 min-w-44 rounded-lg border border-(--line-strong) bg-(--canvas) p-2 text-[10px] shadow-lg">
      <strong className="mb-1 block max-w-56 truncate text-(--ink)">
        {point.name}
      </strong>
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        <span className="text-(--ink-muted)">Selected value</span>
        <strong>
          {metric === "cost" ? money(point.actualCost) : tokens(point.tokens)}
        </strong>
        <span className="text-(--ink-muted)">Tokens</span>
        <strong>{tokens(point.tokens)}</strong>
        <span className="text-(--ink-muted)">Actual cost</span>
        <strong>{money(point.actualCost)}</strong>
        <span className="text-(--ink-muted)">Share</span>
        <strong>{point.percentage.toFixed(1)}%</strong>
        <span className="text-(--ink-muted)">Standard cost</span>
        <strong>{money(point.standardCost ?? point.actualCost)}</strong>
      </div>
    </div>
  );
}

function DistributionChart({
  rows,
  metric,
  label,
}: {
  rows: UsageRow[];
  metric: DistributionMetric;
  label: string;
}) {
  const values = rows
    .filter((row) => (metric === "cost" ? row.actualCost : row.tokens) > 0)
    .sort((a, b) =>
      metric === "cost" ? b.actualCost - a.actualCost : b.tokens - a.tokens,
    )
    .slice(0, 5);
  const total = values.reduce(
    (sum, row) => sum + (metric === "cost" ? row.actualCost : row.tokens),
    0,
  );
  const points = values.map((row, index) => ({
    ...row,
    value: metric === "cost" ? row.actualCost : row.tokens,
    fill: chartColors[index],
    percentage: total
      ? ((metric === "cost" ? row.actualCost : row.tokens) / total) * 100
      : 0,
  }));
  if (!total)
    return (
      <Empty
        title="No distribution data"
        message={`No ${label.toLowerCase()} returned for these filters.`}
        compact
      />
    );
  return (
    <div className="grid min-h-48 grid-cols-[132px_minmax(0,1fr)] items-center gap-4 max-[460px]:grid-cols-1 max-[460px]:justify-items-center">
      <div
        className="relative z-0 h-36 w-full"
        role="img"
        aria-label={`${label} distribution`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              position={{ x: 0, y: 0 }}
              wrapperStyle={{
                zIndex: 50,
                transform: "translate(136px, -4px)",
                pointerEvents: "none",
              }}
              content={(props) => (
                <DistributionTooltip
                  active={props.active}
                  payload={
                    props.payload as unknown as ReadonlyArray<{
                      payload?: DistributionPoint;
                    }>
                  }
                  metric={metric}
                />
              )}
            />
            <Pie
              data={points}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={62}
              paddingAngle={2}
              stroke="none"
            />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 z-0 grid place-items-center text-center text-[10px] font-semibold tabular-nums">
          {metric === "cost" ? money(total) : tokens(total)}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 max-[460px]:w-full">
        {points.map((row) => (
          <div
            className="grid min-w-0 grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 text-[10px]"
            key={row.name}
          >
            <i className="size-2 rounded-sm" style={{ background: row.fill }} />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(--ink-muted)">
              {row.name}
            </span>
            <strong className="font-semibold tabular-nums">
              {metric === "cost"
                ? money(row.actualCost)
                : `${tokens(row.tokens)} · ${row.percentage.toFixed(1)}%`}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelDistribution({ rows }: { rows: UsageRow[] }) {
  const [metric, setMetric] = useState<DistributionMetric>("cost");
  return (
    <div>
      <Tabs
        value={metric}
        onValueChange={(value) => setMetric(value as DistributionMetric)}
      >
        <TabsList className="mb-2" aria-label="Model distribution metric">
          <TabsTrigger value="cost">Actual cost</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
        </TabsList>
      </Tabs>
      <DistributionChart
        rows={rows}
        metric={metric}
        label="Model distribution"
      />
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload.reduce<Record<string, number>>((result, item) => {
    if (item.name && typeof item.value === "number")
      result[item.name] = item.value;
    return result;
  }, {});
  const names: Array<[string, string]> = [
    ["inputTokens", "Input"],
    ["outputTokens", "Output"],
    ["cacheCreationTokens", "Cache creation"],
    ["cacheReadTokens", "Cache read"],
  ];
  const cacheRequests = (point.cacheReadTokens ?? 0) + (point.inputTokens ?? 0);
  const cacheHitRate = cacheRequests
    ? ((point.cacheReadTokens ?? 0) / cacheRequests) * 100
    : 0;
  return (
    <div className="relative z-50 min-w-48 rounded-lg border border-(--line-strong) bg-(--canvas) p-2 text-[10px] shadow-lg">
      <strong className="mb-1 block">{label}</strong>
      {names.map(([key, name]) => (
        <div className="flex justify-between gap-4" key={key}>
          <span className="text-(--ink-muted)">{name}</span>
          <strong>{tokens(point[key] ?? 0)}</strong>
        </div>
      ))}
      <div className="flex justify-between gap-4">
        <span className="text-(--ink-muted)">Cache hit rate</span>
        <strong>{cacheHitRate.toFixed(1)}%</strong>
      </div>
      <div className="mt-1 border-t border-(--line) pt-1">
        <div className="flex justify-between gap-4">
          <span className="text-(--ink-muted)">Actual cost</span>
          <strong>{money(point.actualCost ?? 0)}</strong>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-(--ink-muted)">Standard cost</span>
          <strong>{money(point.standardCost ?? 0)}</strong>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ rows }: { rows: SnapshotEnvelope["dailyTrend"] }) {
  if (!rows.length)
    return (
      <Empty
        title="No trend data"
        message="Try a wider date range or fewer filters."
        compact
      />
    );
  const data = rows.map((row) => ({
    ...row,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    cacheCreationTokens: row.cacheCreationTokens ?? 0,
    cacheReadTokens: row.cacheReadTokens ?? 0,
  }));
  return (
    <div
      className="h-56 min-w-0"
      role="img"
      aria-label="Daily token usage trend"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            stroke="var(--line)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--ink-faint)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            width={44}
            tick={{ fill: "var(--ink-faint)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => tokens(Number(value))}
          />
          <Tooltip
            wrapperStyle={{ zIndex: 50 }}
            content={(props) => (
              <TrendTooltip
                active={props.active}
                payload={
                  props.payload as unknown as ReadonlyArray<{
                    name?: string;
                    value?: number;
                    color?: string;
                  }>
                }
                label={String(props.label ?? "")}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="inputTokens"
            name="inputTokens"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="outputTokens"
            name="outputTokens"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="cacheCreationTokens"
            name="cacheCreationTokens"
            stroke="var(--chart-3)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="cacheReadTokens"
            name="cacheReadTokens"
            stroke="var(--chart-4)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatLocation(log: UsageLog) {
  return log.location && (log.location.city || log.location.country)
    ? [log.location.city, log.location.region, log.location.countryCode]
        .filter(Boolean)
        .join(", ")
    : log.ipAddress;
}

function openIpLocation(ip: string) {
  window.dispatchEvent(new CustomEvent("cavoti-open-ip", { detail: ip }));
}

function timestamp(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function UsageLogTable({
  logs,
  pageInfo,
  onPageChange,
}: {
  logs: UsageLog[];
  pageInfo: PageInfo;
  onPageChange: (page: number) => void;
}) {
  return logs.length ? (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <Table className="min-w-295 text-[10px]">
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>API key</TableHead>
              <TableHead>Reasoning</TableHead>
              <TableHead>Location / IP</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>TTFT</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>User agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">
                  {timestamp(log.createdAt)}
                </TableCell>
                <TableCell className="max-w-40 truncate font-medium">
                  {log.model}
                </TableCell>
                <TableCell>{log.apiKeyName}</TableCell>
                <TableCell>{log.reasoningEffort}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="max-w-44 truncate text-left text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    title={`Look up ${log.ipAddress}`}
                    onClick={() => openIpLocation(log.ipAddress)}
                  >
                    {formatLocation(log)}
                  </button>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {tokens(log.totalTokens)}{" "}
                  <span className="text-(--ink-faint)">
                    ({tokens(log.inputTokens)} in / {tokens(log.outputTokens)}{" "}
                    out / {tokens(log.cacheCreationTokens)} created /{" "}
                    {tokens(log.cacheReadTokens)} read)
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <strong>{money(log.actualCost)}</strong>
                  <span className="block text-(--ink-faint)">
                    std {money(log.standardCost)}
                  </span>
                </TableCell>
                <TableCell>
                  {log.timeToFirstTokenMs
                    ? `${integer(log.timeToFirstTokenMs)} ms`
                    : "-"}
                </TableCell>
                <TableCell>
                  {log.durationMs
                    ? `${(log.durationMs / 1000).toFixed(1)} s`
                    : "-"}
                </TableCell>
                <TableCell className="max-w-52 truncate" title={log.userAgent}>
                  {log.userAgent}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-(--line) pt-2 text-[10px] text-(--ink-muted)">
        <span>
          Showing {(pageInfo.page - 1) * pageInfo.pageSize + 1}-
          {Math.min(pageInfo.total, pageInfo.page * pageInfo.pageSize)} of{" "}
          {integer(pageInfo.total)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous usage page"
            disabled={pageInfo.page <= 1}
            onClick={() => onPageChange(pageInfo.page - 1)}
          >
            <CaretLeft />
          </Button>
          <span className="min-w-12 text-center tabular-nums">
            {pageInfo.page} / {pageInfo.pages}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next usage page"
            disabled={pageInfo.page >= pageInfo.pages}
            onClick={() => onPageChange(pageInfo.page + 1)}
          >
            <CaretRight />
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <Empty
      title="No usage logs"
      message="Recent request details will appear here after the next refresh."
      compact
    />
  );
}

function ActivityPanel({
  snapshot,
  onPageChange,
}: {
  snapshot: SnapshotEnvelope;
  onPageChange: (page: number) => void;
}) {
  const [tab, setTab] = useState<"usage" | "errors">("usage");
  return (
    <Card className="rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
      <CardHeader className="mb-3 flex items-center justify-between gap-3 p-0">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
            Recent requests
          </span>
          <CardTitle className="text-lg font-semibold leading-7">
            Usage activity
          </CardTitle>
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "usage" | "errors")}
        >
          <TabsList aria-label="Usage activity type">
            <TabsTrigger value="usage">
              Usage ({snapshot.usageLogs.length})
            </TabsTrigger>
            <TabsTrigger value="errors">
              Errors ({snapshot.errors.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="min-w-0 p-0">
        {tab === "usage" ? (
          <UsageLogTable
            logs={snapshot.usageLogs}
            pageInfo={snapshot.usagePageInfo}
            onPageChange={onPageChange}
          />
        ) : snapshot.errors.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-205 text-[10px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.errors.map((error) => (
                  <TableRow key={error.id}>
                    <TableCell className="whitespace-nowrap">
                      {timestamp(error.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning">
                        {integer(error.statusCode)}
                      </Badge>
                    </TableCell>
                    <TableCell>{error.model}</TableCell>
                    <TableCell>{error.endpoint}</TableCell>
                    <TableCell>{error.category}</TableCell>
                    <TableCell>{error.keyName}</TableCell>
                    <TableCell
                      className="max-w-80 truncate"
                      title={error.message}
                    >
                      {error.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty
            title="No usage errors"
            message="No errors were returned for this range."
            compact
          />
        )}
      </CardContent>
    </Card>
  );
}

function DistributionCard({
  title,
  eyebrow,
  icon,
  rows,
}: {
  title: string;
  eyebrow: string;
  icon: ReactNode;
  rows: UsageRow[];
}) {
  return (
    <Card className="min-w-0 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
      <CardHeader className="mb-3 flex items-start justify-between gap-3 p-0">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
            {eyebrow}
          </span>
          <CardTitle className="text-lg font-semibold leading-7">
            {title}
          </CardTitle>
        </div>
        {icon}
      </CardHeader>
      <CardContent className="min-w-0 p-0">
        <DistributionChart rows={rows} metric="cost" label={`${title} cost`} />
      </CardContent>
    </Card>
  );
}

function UsageWide({
  snapshot,
  filters,
  onChange,
  onRefresh,
  onReset,
  onPageChange,
}: {
  snapshot: SnapshotEnvelope;
  filters: UsageFilterState;
  onChange: (filters: UsageFilterState) => void;
  onRefresh: () => void;
  onReset: () => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex w-full max-w-370 flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
            Usage dashboard
          </span>
          <h1 className="m-0 text-3xl font-semibold leading-9 tracking-tight">
            Usage
          </h1>
        </div>
        <Badge variant="outline">
          {filters.startDate} to {filters.endDate}
        </Badge>
      </div>
      <UsageFilters
        snapshot={snapshot}
        filters={filters}
        onChange={onChange}
        onRefresh={onRefresh}
        onReset={onReset}
      />
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(240px,.85fr)]">
        <Card className="min-w-0 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
          <CardHeader className="mb-3 flex items-start justify-between gap-3 p-0">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
                Token volume
              </span>
              <CardTitle className="text-lg font-semibold leading-7">
                Daily trend
              </CardTitle>
            </div>
            <ChartBar className="size-5 text-accent" />
          </CardHeader>
          <CardContent className="min-w-0 p-0">
            <TrendChart rows={snapshot.dailyTrend} />
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
          <CardHeader className="mb-3 flex items-start justify-between gap-3 p-0">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
                Model share
              </span>
              <CardTitle className="text-lg font-semibold leading-7">
                By model
              </CardTitle>
            </div>
            <Stack className="size-5 text-accent" />
          </CardHeader>
          <CardContent className="min-w-0 p-0">
            <ModelDistribution rows={snapshot.models} />
          </CardContent>
        </Card>
      </div>
      <StatRail snapshot={snapshot} />
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-2">
        <DistributionCard
          title="Endpoints"
          eyebrow="Cost centers"
          icon={<ChartBar className="size-5 text-accent" />}
          rows={snapshot.stats.endpoints}
        />
        <DistributionCard
          title="Groups"
          eyebrow="Billing groups"
          icon={<UsersThree className="size-5 text-accent" />}
          rows={snapshot.groups}
        />
      </div>
      <ActivityPanel snapshot={snapshot} onPageChange={onPageChange} />
    </div>
  );
}

export function Usage({ snapshot }: { snapshot: SnapshotEnvelope }) {
  const [filters, setFilters] = useState(defaultUsageFilterState);
  const [usagePage, setUsagePage] = useState(1);
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const refresh = (next: UsageFilterState, page = 1) => {
    setFilters(next);
    setUsagePage(page);
    window.dispatchEvent(
      new CustomEvent("cavoti-usage-refresh", {
        detail: { filters: next, usagePage: page },
      }),
    );
  };
  const apply = () => refresh(filters, usagePage);
  const changeFilters = (next: UsageFilterState) => refresh(next);
  const changeUsagePage = (page: number) => refresh(filters, page);
  const reset = () => {
    const next = defaultUsageFilterState();
    refresh(next);
  };
  if (!compact)
    return (
      <UsageWide
        snapshot={snapshot}
        filters={filters}
        onChange={changeFilters}
        onRefresh={apply}
        onReset={reset}
        onPageChange={changeUsagePage}
      />
    );
  const pageCount = 6;
  const pageLabel =
    [
      "Filters",
      "Daily trend",
      "Model distribution",
      "Groups",
      "Endpoints",
      "Usage activity",
    ][page] ?? "Usage";
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
              {pageLabel}
            </span>
            <h1>Usage</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline">
              {filters.startDate} to {filters.endDate}
            </Badge>
            <TilePager
              page={page}
              count={pageCount}
              onChange={setPage}
              label="Usage screen"
            />
          </div>
        </div>
        {page === 0 ? (
          <>
            <UsageFilters
              snapshot={snapshot}
              filters={filters}
              onChange={changeFilters}
              onRefresh={apply}
              onReset={reset}
            />
            <StatRail snapshot={snapshot} />
          </>
        ) : page === 1 ? (
          <Card className="rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-3 flex items-start justify-between gap-3 p-0">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
                  Token volume
                </span>
                <CardTitle className="text-lg font-semibold leading-7">
                  Daily trend
                </CardTitle>
              </div>
              <ChartBar className="size-5 text-accent" />
            </CardHeader>
            <CardContent className="min-w-0 p-0">
              <TrendChart rows={snapshot.dailyTrend} />
            </CardContent>
          </Card>
        ) : page === 2 ? (
          <Card className="rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-3 p-0">
              <CardTitle className="text-lg font-semibold leading-7">
                Model distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 p-0">
              <ModelDistribution rows={snapshot.models} />
            </CardContent>
          </Card>
        ) : page === 3 ? (
          <DistributionCard
            title="Groups"
            eyebrow="Billing groups"
            icon={<UsersThree className="size-5 text-accent" />}
            rows={snapshot.groups}
          />
        ) : page === 4 ? (
          <DistributionCard
            title="Endpoints"
            eyebrow="Cost centers"
            icon={<ChartBar className="size-5 text-accent" />}
            rows={snapshot.stats.endpoints}
          />
        ) : (
          <ActivityPanel snapshot={snapshot} onPageChange={changeUsagePage} />
        )}
      </div>
    </div>
  );
}
