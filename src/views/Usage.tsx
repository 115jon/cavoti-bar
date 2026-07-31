import { Fragment, memo, useEffect, useState, type ReactNode } from "react";
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretLeftIcon as CaretLeft,
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  CaretUpIcon as CaretUp,
  ChartBarIcon as ChartBar,
  CaretUpDownIcon as CaretUpDown,
  FunnelSimpleIcon as FunnelSimple,
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
  UsageError,
  UsageFilters as UsageFilterState,
  UsageLog,
  UsageRow,
} from "../domain/snapshot";
import {
  modelFamily,
  modelFamilyTone,
  modelLogoUrl,
  multiplierTone,
} from "../domain/model-logos";
import {
  dateRangeForPreset,
  dateRangeOptions,
  defaultUsageFilterState,
  integer,
  money,
  tokens,
  type DateRangePreset,
} from "../app/formatters";
import { Badge, Empty, useCompactTiles } from "../components/app/shared";
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
import {
  Tooltip as HoverTooltip,
  TooltipContent as HoverTooltipContent,
  TooltipTrigger as HoverTooltipTrigger,
} from "../components/ui/tooltip";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../components/ui/drawer";

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
            ? `${(snapshot.stats.averageDurationMs / 1000).toFixed(2)} s`
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
  compact = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const fieldId = `usage-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        value={value || "__all__"}
        onValueChange={(next) => onChange(next === "__all__" ? "" : next)}
      >
        <SelectTrigger
          id={fieldId}
          size={compact ? "default" : "sm"}
          className={compact ? "h-12 w-full px-3 text-base" : "w-full"}
          aria-label={label}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                value={option.value || "__all__"}
                key={`${label}-${option.value}`}
                className={compact ? "py-3 text-base" : undefined}
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
  compact = false,
}: {
  filters: UsageFilterState;
  onChange: (
    filters: Pick<UsageFilterState, "startDate" | "endDate"> &
      Partial<Pick<UsageFilterState, "granularity">>,
  ) => void;
  compact?: boolean;
}) {
  const preset = dateRangeOptions.find(({ value }) => {
    const range = dateRangeForPreset(value);
    return (
      range.startDate === filters.startDate && range.endDate === filters.endDate
    );
  })?.value;
  const [customRange, setCustomRange] = useState(preset === undefined);
  useEffect(() => setCustomRange(preset === undefined), [preset]);
  const value = customRange ? "custom" : (preset ?? "custom");
  return (
    <>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next === "custom") {
            setCustomRange(true);
            return;
          }
          setCustomRange(false);
          onChange({
            ...dateRangeForPreset(next as DateRangePreset),
            granularity:
              next === "today" || next === "yesterday" ? "hour" : "day",
          });
        }}
      >
        <SelectTrigger
          id="usage-date-range"
          size={compact ? "default" : "sm"}
          className={compact ? "h-12 w-full px-3 text-base" : "w-full"}
          aria-label="Date range"
        >
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
            className={compact ? "h-12" : undefined}
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
            className={compact ? "h-12" : undefined}
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const update = (patch: Partial<UsageFilterState>) =>
    onChange({ ...filters, ...patch });
  const compact = useCompactTiles();
  const activeFilters = [
    filters.apiKeyId !== null,
    Boolean(filters.model),
    filters.groupId !== null,
    Boolean(filters.requestType),
    filters.billingType !== null,
    Boolean(filters.billingMode),
  ].filter(Boolean).length;
  const fields = (
    <UsageFilterFields
      snapshot={snapshot}
      filters={filters}
      update={update}
      compact={compact}
    />
  );
  const setDrawerOpen = (open: boolean) => {
    setFiltersOpen(open);
    window.dispatchEvent(
      new CustomEvent("cavoti-native-refresh-lock", {
        detail: { locked: open },
      }),
    );
  };
  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent("cavoti-native-refresh-lock", {
          detail: { locked: false },
        }),
      );
    },
    [],
  );
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-(--line) bg-white/60 p-3">
      {compact ? (
        <Drawer open={filtersOpen} onOpenChange={setDrawerOpen}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block text-sm font-semibold">Filters</strong>
              <span className="block truncate text-xs text-(--ink-muted)">
                {activeFilters
                  ? `${activeFilters} filters active`
                  : "All requests"}
              </span>
            </div>
            <DrawerTrigger asChild>
              <Button variant="outline" size="sm">
                <FunnelSimple data-icon="inline-start" />
                Adjust
              </Button>
            </DrawerTrigger>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto text-xs text-(--ink-muted)">
            <Badge variant="outline" className="shrink-0">
              {filters.startDate} to {filters.endDate}
            </Badge>
            {filters.model ? (
              <Badge variant="outline" className="shrink-0">
                {filters.model}
              </Badge>
            ) : null}
            {filters.requestType ? (
              <Badge variant="outline" className="shrink-0">
                {filters.requestType}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRefresh}>
              <ArrowsClockwise data-icon="inline-start" /> Refresh
            </Button>
            {activeFilters ? (
              <Button size="sm" variant="ghost" onClick={onReset}>
                <X data-icon="inline-start" /> Reset
              </Button>
            ) : null}
          </div>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Usage filters</DrawerTitle>
              <DrawerDescription>
                Narrow the requests shown in the dashboard.
              </DrawerDescription>
            </DrawerHeader>
            <div className="grid max-h-[52dvh] grid-cols-1 gap-4 overflow-y-auto px-4">
              {fields}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="h-12 w-full text-base">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <>
          {fields}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onRefresh}>
              <ArrowsClockwise data-icon="inline-start" /> Refresh usage
            </Button>
            <Button size="sm" variant="ghost" onClick={onReset}>
              <X data-icon="inline-start" /> Reset filters
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function UsageFilterFields({
  snapshot,
  filters,
  update,
  compact,
}: {
  snapshot: SnapshotEnvelope;
  filters: UsageFilterState;
  update: (patch: Partial<UsageFilterState>) => void;
  compact: boolean;
}) {
  const models = snapshot.models
    .map((model) => model.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();
  return (
    <div
      className={
        compact
          ? "grid grid-cols-1 gap-3"
          : "grid grid-cols-2 gap-2 xl:grid-cols-[minmax(180px,1.25fr)_repeat(3,minmax(130px,1fr))]"
      }
    >
      <div className="col-span-full flex min-w-0 flex-col gap-1 xl:col-auto">
        <Label htmlFor="usage-start-date">Date range</Label>
        <DateRangeSelect
          filters={filters}
          onChange={update}
          compact={compact}
        />
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
        onChange={(value) => update({ apiKeyId: value ? Number(value) : null })}
        compact={compact}
      />
      <FilterSelect
        label="Model"
        value={filters.model}
        options={[
          { value: "", label: "All models" },
          ...models.map((model) => ({ value: model, label: model })),
        ]}
        onChange={(model) => update({ model })}
        compact={compact}
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
        onChange={(value) => update({ groupId: value ? Number(value) : null })}
        compact={compact}
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
        compact={compact}
      />
      <FilterSelect
        label="Billing type"
        value={filters.billingType === null ? "" : String(filters.billingType)}
        options={[
          { value: "", label: "All billing types" },
          { value: "0", label: "Balance" },
          { value: "1", label: "Subscription" },
        ]}
        onChange={(value) =>
          update({ billingType: value ? Number(value) : null })
        }
        compact={compact}
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
        compact={compact}
      />
      <FilterSelect
        label="Granularity"
        value={filters.granularity}
        options={[
          { value: "day", label: "Daily" },
          { value: "hour", label: "Hourly" },
        ]}
        onChange={(granularity) =>
          update({
            granularity: granularity as UsageFilterState["granularity"],
          })
        }
        compact={compact}
      />
      <FilterSelect
        label="Sort by"
        value={filters.sortBy}
        options={[
          { value: "created_at", label: "Time" },
          { value: "model", label: "Model" },
        ]}
        onChange={(sortBy) =>
          update({ sortBy: sortBy as UsageFilterState["sortBy"] })
        }
        compact={compact}
      />
      <FilterSelect
        label="Order"
        value={filters.sortOrder}
        options={[
          { value: "desc", label: "Descending" },
          { value: "asc", label: "Ascending" },
        ]}
        onChange={(sortOrder) =>
          update({ sortOrder: sortOrder as UsageFilterState["sortOrder"] })
        }
        compact={compact}
      />
    </div>
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
  const compact = useCompactTiles();
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
  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-(--ink-muted)">Total</span>
          <strong className="text-base font-semibold tabular-nums">
            {metric === "cost" ? money(total) : tokens(total)}
          </strong>
        </div>
        <div className="flex flex-col gap-3">
          {points.map((row) => (
            <div className="min-w-0" key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-(--ink-muted)">
                  {modelLogoUrl(row.name, "") ? (
                    <img
                      className="size-4 object-contain"
                      src={modelLogoUrl(row.name, "") ?? undefined}
                      alt=""
                    />
                  ) : null}
                  <span
                    className={`shrink-0 rounded-md border px-1 py-0.5 text-[9px] font-medium ${modelFamilyTone(modelFamily(row.name, ""))}`}
                  >
                    {modelFamily(row.name, "")}
                  </span>
                  <span className="truncate">{row.name}</span>
                </span>
                <strong className="shrink-0 font-semibold tabular-nums">
                  {metric === "cost"
                    ? money(row.actualCost)
                    : `${tokens(row.tokens)} · ${row.percentage.toFixed(1)}%`}
                </strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-(--line)">
                <div
                  className="h-full rounded-full"
                  style={{ background: row.fill, width: `${row.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
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
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-(--ink-muted)">
              {modelLogoUrl(row.name, "") ? (
                <img
                  className="size-4 object-contain"
                  src={modelLogoUrl(row.name, "") ?? undefined}
                  alt=""
                />
              ) : null}
              <span
                className={`shrink-0 rounded-md border px-1 py-0.5 text-[9px] font-medium ${modelFamilyTone(modelFamily(row.name, ""))}`}
              >
                {modelFamily(row.name, "")}
              </span>
              <span className="truncate">{row.name}</span>
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

type TrendTooltipPayload = {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: {
    actualCost?: number;
    standardCost?: number;
  };
};

const trendTooltipKeys: Record<string, string> = {
  "Input tokens": "inputTokens",
  "Output tokens": "outputTokens",
  "Cache created": "cacheCreationTokens",
  "Cache read": "cacheReadTokens",
  "Total tokens": "totalTokens",
};

export function trendTooltipData(
  payload: ReadonlyArray<TrendTooltipPayload>,
): Record<string, number> {
  return payload.reduce<Record<string, number>>((result, item) => {
    const key =
      item.dataKey ?? (item.name ? trendTooltipKeys[item.name] : null);
    if (key && typeof item.value === "number") result[key] = item.value;
    return result;
  }, {});
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TrendTooltipPayload>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = trendTooltipData(payload);
  const allNames: Array<[string, string]> = [
    ["inputTokens", "Input"],
    ["outputTokens", "Output"],
    ["cacheCreationTokens", "Cache creation"],
    ["cacheReadTokens", "Cache read"],
  ];
  const names: Array<[string, string]> =
    point.totalTokens !== undefined
      ? [["totalTokens", "Total tokens"]]
      : allNames.filter(([key]) => point[key] !== undefined);
  const row = payload[0]?.payload;
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
          <strong>{money(row?.actualCost ?? 0)}</strong>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-(--ink-muted)">Standard cost</span>
          <strong>{money(row?.standardCost ?? row?.actualCost ?? 0)}</strong>
        </div>
      </div>
    </div>
  );
}

export function trendChartData(rows: SnapshotEnvelope["dailyTrend"]) {
  const hasBreakdown = rows.some((row) =>
    [
      row.inputTokens,
      row.outputTokens,
      row.cacheCreationTokens,
      row.cacheReadTokens,
    ].some((value) => value !== undefined),
  );
  return rows.map((row) => ({
    ...row,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    cacheCreationTokens: row.cacheCreationTokens ?? 0,
    cacheReadTokens: row.cacheReadTokens ?? 0,
    totalTokens: hasBreakdown ? undefined : row.tokens,
  }));
}

function TrendChart({
  rows,
  granularity,
}: {
  rows: SnapshotEnvelope["dailyTrend"];
  granularity: UsageFilterState["granularity"];
}) {
  const compact = useCompactTiles();
  if (!rows.length)
    return (
      <Empty
        title="No trend data"
        message="Try a wider date range or fewer filters."
        compact
      />
    );
  const data = trendChartData(rows);
  const aggregateOnly = data.some((row) => row.totalTokens !== undefined);
  const series = aggregateOnly
    ? [{ label: "Total tokens", color: "var(--chart-1)" }]
    : compact
      ? [
          { label: "Input tokens", color: "var(--chart-1)" },
          { label: "Output tokens", color: "var(--chart-2)" },
        ]
      : [
          { label: "Input tokens", color: "var(--chart-1)" },
          { label: "Output tokens", color: "var(--chart-2)" },
          { label: "Cache created", color: "var(--chart-3)" },
          { label: "Cache read", color: "var(--chart-4)" },
        ];
  return (
    <div
      className="min-w-0"
      role="img"
      aria-label={`${granularity === "hour" ? "Hourly" : "Daily"} token usage trend`}
    >
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-(--ink-muted)">
        {series.map(({ label, color }) => (
          <span className="inline-flex items-center gap-1" key={label}>
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>
      <div className="h-56">
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
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 50 }}
              content={(props) => (
                <TrendTooltip
                  active={props.active}
                  payload={
                    props.payload as unknown as ReadonlyArray<TrendTooltipPayload>
                  }
                  label={String(props.label ?? "")}
                />
              )}
            />
            {aggregateOnly ? (
              <Line
                type="monotone"
                dataKey="totalTokens"
                name="Total tokens"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ) : (
              <>
                <Line
                  type="monotone"
                  dataKey="inputTokens"
                  name="Input tokens"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="outputTokens"
                  name="Output tokens"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </>
            )}
            {!aggregateOnly && !compact ? (
              <Line
                type="monotone"
                dataKey="cacheCreationTokens"
                name="Cache created"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ) : null}
            {!aggregateOnly && !compact ? (
              <Line
                type="monotone"
                dataKey="cacheReadTokens"
                name="Cache read"
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
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

function preserveMainScroll(action: () => void) {
  const main = document.querySelector<HTMLElement>("main");
  const scrollTop = main?.scrollTop;
  action();
  if (!main || scrollTop === undefined) return;
  const restore = () => {
    main.scrollTop = scrollTop;
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(restore);
  } else {
    restore();
  }
}

function TokenBreakdown({ log }: { log: UsageLog }) {
  const parts = [
    { label: "Input tokens", value: log.inputTokens },
    { label: "Output tokens", value: log.outputTokens },
    { label: "Cache created", value: log.cacheCreationTokens },
    { label: "Cache read", value: log.cacheReadTokens },
  ].filter((part) => part.value > 0);
  return (
    <HoverTooltip>
      <HoverTooltipTrigger asChild>
        <button
          type="button"
          className="font-semibold tabular-nums underline decoration-dotted underline-offset-2 hover:text-accent"
          aria-label={`Token breakdown for ${log.model}`}
        >
          {tokens(log.totalTokens)}
        </button>
      </HoverTooltipTrigger>
      <HoverTooltipContent>
        <div className="grid min-w-44 grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
          {parts.map((part) => (
            <Fragment key={part.label}>
              <span className="text-(--ink-muted)">{part.label}</span>
              <strong>{tokens(part.value)}</strong>
            </Fragment>
          ))}
          <div className="col-span-2 mt-1 flex items-center justify-between gap-4 border-t border-current/20 pt-1">
            <span className="text-(--ink-muted)">Total tokens</span>
            <strong>{tokens(log.totalTokens)}</strong>
          </div>
        </div>
      </HoverTooltipContent>
    </HoverTooltip>
  );
}

function CostBreakdown({ log }: { log: UsageLog }) {
  const costs = [
    { label: "Input cost", value: log.inputCost },
    { label: "Output cost", value: log.outputCost },
    { label: "Cache creation cost", value: log.cacheCreationCost },
    { label: "Cache read cost", value: log.cacheReadCost },
  ].filter((cost) => cost.value > 0);
  return (
    <HoverTooltip>
      <HoverTooltipTrigger asChild>
        <button
          type="button"
          className="font-semibold tabular-nums underline decoration-dotted underline-offset-2 hover:text-accent"
          aria-label={`Cost breakdown for ${log.model}`}
        >
          {money(log.actualCost)}
        </button>
      </HoverTooltipTrigger>
      <HoverTooltipContent>
        <div className="grid min-w-52 grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
          {costs.map((cost) => (
            <Fragment key={cost.label}>
              <span className="text-(--ink-muted)">{cost.label}</span>
              <strong>{money(cost.value)}</strong>
            </Fragment>
          ))}
          {log.groupName ? (
            <>
              <span className="text-(--ink-muted)">Service tier</span>
              <strong className="max-w-32 truncate text-right">
                {log.groupName}
              </strong>
            </>
          ) : null}
          {typeof log.rateMultiplier === "number" && log.rateMultiplier > 0 ? (
            <>
              <span className="text-(--ink-muted)">Rate multiplier</span>
              <strong className={multiplierTone(log.rateMultiplier)}>
                {log.rateMultiplier.toFixed(2)}x
              </strong>
            </>
          ) : null}
          {log.subscriptionCost > 0 ? (
            <>
              <span className="text-(--ink-muted)">Subscription billed</span>
              <strong>{money(log.subscriptionCost)}</strong>
            </>
          ) : null}
          {log.balanceCost > 0 ? (
            <>
              <span className="text-(--ink-muted)">Balance billed</span>
              <strong>{money(log.balanceCost)}</strong>
            </>
          ) : null}
          {log.unchargedCost > 0 ? (
            <>
              <span className="text-(--ink-muted)">Uncharged</span>
              <strong>{money(log.unchargedCost)}</strong>
            </>
          ) : null}
          <div className="col-span-2 mt-1 flex items-center justify-between gap-4 border-t border-current/20 pt-1">
            <span className="text-(--ink-muted)">Original cost</span>
            <strong className="text-(--ink-muted)">
              {money(log.standardCost)}
            </strong>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-4">
            <span className="text-(--ink-muted)">Billed cost</span>
            <strong className="text-accent">{money(log.actualCost)}</strong>
          </div>
        </div>
      </HoverTooltipContent>
    </HoverTooltip>
  );
}

function PerformanceCell({ log }: { log: UsageLog }) {
  const ttft = log.timeToFirstTokenMs;
  const duration = log.durationMs;
  if (!ttft && !duration) return <span>-</span>;
  const ratio =
    duration > 0 ? Math.min(100, Math.max(0, (ttft / duration) * 100)) : 0;
  const tone =
    ttft >= 30_000
      ? "bg-(--bad)"
      : ttft >= 10_000
        ? "bg-(--warning)"
        : "bg-(--good)";
  const toneText =
    ttft >= 30_000
      ? "text-(--bad)"
      : ttft >= 10_000
        ? "text-(--warning)"
        : "text-(--good)";
  return (
    <div
      className="min-w-0 w-full"
      title={`Time to first token ${integer(ttft)} ms; total duration ${(duration / 1000).toFixed(2)} s; TTFT is ${ratio.toFixed(1)}% of total duration`}
    >
      <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[10px] tabular-nums">
        <span className={toneText}>
          TTFT {ttft ? `${(ttft / 1000).toFixed(2)} s` : "-"}
        </span>
        <strong>
          Total {duration ? `${(duration / 1000).toFixed(2)} s` : "-"}
        </strong>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--line)">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${ratio}%` }}
        />
      </div>
      <span className="mt-1 block text-[9px] text-(--ink-muted)">
        TTFT share of duration: {ratio.toFixed(1)}%
      </span>
    </div>
  );
}

function SortableTableHead({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: UsageFilterState["sortBy"];
  sortBy: UsageFilterState["sortBy"];
  sortOrder: UsageFilterState["sortOrder"];
  onSort: (column: UsageFilterState["sortBy"]) => void;
}) {
  const active = sortBy === column;
  return (
    <TableHead>
      <button
        type="button"
        className={`inline-flex items-center gap-1 font-medium ${active ? "text-(--ink)" : "text-(--ink-muted)"}`}
        aria-label={`${label}, ${active ? (sortOrder === "desc" ? "descending" : "ascending") : "not sorted"}`}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          <span aria-hidden="true">
            {sortOrder === "desc" ? <CaretDown /> : <CaretUp />}
          </span>
        ) : (
          <CaretUpDown className="size-3" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}

function UsageLogTable({
  logs,
  pageInfo,
  onPageChange,
  sortBy,
  sortOrder,
  onSort,
  onSelect,
  compact = false,
}: {
  logs: UsageLog[];
  pageInfo: PageInfo;
  onPageChange: (page: number) => void;
  sortBy: UsageFilterState["sortBy"];
  sortOrder: UsageFilterState["sortOrder"];
  onSort: (column: UsageFilterState["sortBy"]) => void;
  onSelect: (log: UsageLog) => void;
  compact?: boolean;
}) {
  if (compact) {
    return logs.length ? (
      <div className="flex flex-col gap-2">
        {logs.map((log) => (
          <UsageLogCard log={log} key={log.id} onSelect={onSelect} />
        ))}
        <ActivityPagination pageInfo={pageInfo} onPageChange={onPageChange} />
      </div>
    ) : (
      <Empty
        title="No usage logs"
        message="Recent request details will appear here after the next refresh."
        compact
      />
    );
  }
  return logs.length ? (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <Table className="min-w-295 text-[10px]">
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label="Time"
                column="created_at"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <SortableTableHead
                label="Model"
                column="model"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
              />
              <TableHead>API key</TableHead>
              <TableHead>Reasoning</TableHead>
              <TableHead>Location / IP</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Performance</TableHead>
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
                  <button
                    type="button"
                    className="truncate text-left hover:text-accent"
                    onClick={() => onSelect(log)}
                  >
                    {log.model}
                  </button>
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
                  <TokenBreakdown log={log} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <CostBreakdown log={log} />
                </TableCell>
                <TableCell>
                  <PerformanceCell log={log} />
                </TableCell>
                <TableCell className="max-w-52 truncate" title={log.userAgent}>
                  {log.userAgent}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ActivityPagination pageInfo={pageInfo} onPageChange={onPageChange} />
    </div>
  ) : (
    <Empty
      title="No usage logs"
      message="Recent request details will appear here after the next refresh."
      compact
    />
  );
}

function ActivityPagination({
  pageInfo,
  onPageChange,
  label = "usage",
}: {
  pageInfo: PageInfo;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  const start = pageInfo.total
    ? (pageInfo.page - 1) * pageInfo.pageSize + 1
    : 0;
  const end = Math.min(pageInfo.total, pageInfo.page * pageInfo.pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-(--line) pt-2 text-xs text-(--ink-muted)">
      <span>
        Showing {start}-{end} of {integer(pageInfo.total)}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Previous ${label} page`}
          disabled={pageInfo.page <= 1}
          onClick={() =>
            preserveMainScroll(() => onPageChange(pageInfo.page - 1))
          }
        >
          <CaretLeft />
        </Button>
        <span className="min-w-12 text-center tabular-nums">
          {pageInfo.page} / {pageInfo.pages}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Next ${label} page`}
          disabled={pageInfo.page >= pageInfo.pages}
          onClick={() =>
            preserveMainScroll(() => onPageChange(pageInfo.page + 1))
          }
        >
          <CaretRight />
        </Button>
      </div>
    </div>
  );
}

function UsageLogCard({
  log,
  onSelect,
}: {
  log: UsageLog;
  onSelect: (log: UsageLog) => void;
}) {
  return (
    <article className="rounded-lg border border-(--line) bg-white/70 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block truncate text-sm font-semibold">
            <button
              type="button"
              className="block truncate text-left text-sm font-semibold hover:text-accent"
              onClick={() => onSelect(log)}
            >
              {log.model}
            </button>
          </strong>
          <span className="mt-0.5 block text-xs text-(--ink-muted)">
            {timestamp(log.createdAt)} · {log.endpoint}
          </span>
        </div>
        <CostBreakdown log={log} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Tokens" value={<TokenBreakdown log={log} />} />
        <Metric label="Performance" value={<PerformanceCell log={log} />} />
        <Metric label="API key" value={log.apiKeyName || "Unknown"} />
        <Metric label="Endpoint" value={log.endpoint || "-"} />
        <Metric label="Reasoning" value={log.reasoningEffort || "-"} />
        <Metric label="Type" value={log.requestType || "-"} />
      </div>
      <button
        type="button"
        className="mt-3 block max-w-full truncate text-left text-xs text-accent underline decoration-accent/40 underline-offset-2"
        title={`Look up ${log.ipAddress}`}
        onClick={() => openIpLocation(log.ipAddress)}
      >
        {formatLocation(log)}
      </button>
    </article>
  );
}

function UsageErrorCard({
  error,
  onSelect,
}: {
  error: UsageError;
  onSelect: (error: UsageError) => void;
}) {
  return (
    <article className="rounded-lg border border-(--line) bg-white/70 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block truncate text-sm font-semibold">
            <button
              type="button"
              className="block truncate text-left text-sm font-semibold hover:text-accent"
              onClick={() => onSelect(error)}
            >
              {error.model || error.endpoint}
            </button>
          </strong>
          <span className="mt-0.5 block text-xs text-(--ink-muted)">
            {timestamp(error.createdAt)} · {error.category || "Error"}
          </span>
        </div>
        <Badge variant="warning">{integer(error.statusCode)}</Badge>
      </div>
      <p className="mt-3 line-clamp-3 text-xs text-(--ink-muted)">
        {error.message}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Endpoint" value={error.endpoint || "-"} />
        <Metric label="Key" value={error.keyName || "Unknown"} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-(--panel) px-2 py-1.5">
      <span className="block text-[10px] text-(--ink-muted)">{label}</span>
      <strong className="block truncate font-semibold tabular-nums">
        {value}
      </strong>
    </div>
  );
}

function UsageDetailDrawer({
  log,
  error,
  open,
  onOpenChange,
}: {
  log: UsageLog | null;
  error: UsageError | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {log?.model ?? error?.model ?? "Request detail"}
          </DrawerTitle>
          <DrawerDescription>
            {log
              ? `${timestamp(log.createdAt)} | ${log.requestId || "No request ID"}`
              : error
                ? `${timestamp(error.createdAt)} | ${error.category}`
                : ""}
          </DrawerDescription>
        </DrawerHeader>
        {log ? (
          <div className="grid max-h-[58vh] grid-cols-2 gap-2 overflow-y-auto px-4 text-xs">
            <Metric label="Endpoint" value={log.endpoint} />
            <Metric label="Request type" value={log.requestType || "-"} />
            <Metric label="API key" value={log.apiKeyName} />
            <Metric label="Service tier" value={log.groupName} />
            <Metric label="Tokens" value={tokens(log.totalTokens)} />
            <Metric label="Billed cost" value={money(log.actualCost)} />
            <Metric label="Original cost" value={money(log.standardCost)} />
            <Metric label="Performance" value={<PerformanceCell log={log} />} />
            <Metric label="Location" value={formatLocation(log)} />
            <div className="col-span-2 rounded-md border border-(--line) p-2">
              <strong className="block text-xs">User agent</strong>
              <p className="mt-1 break-words text-[10px] text-(--ink-muted)">
                {log.userAgent}
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="grid max-h-[58vh] grid-cols-2 gap-2 overflow-y-auto px-4 text-xs">
            <Metric label="Status" value={integer(error.statusCode)} />
            <Metric label="Platform" value={error.platform} />
            <Metric label="Endpoint" value={error.endpoint} />
            <Metric label="API key" value={error.keyName} />
            <div className="col-span-2 rounded-md border border-(--line) p-2">
              <strong className="block text-xs">Message</strong>
              <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-(--ink-muted)">
                {error.message}
              </p>
            </div>
            {error.errorBody ? (
              <div className="col-span-2 rounded-md border border-(--line) p-2">
                <strong className="block text-xs">Response body</strong>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-(--ink-muted)">
                  {error.errorBody}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
        <DrawerFooter>
          <DrawerClose asChild>
            <Button className="w-full">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ActivityPanel({
  snapshot,
  onUsagePageChange,
  onErrorPageChange,
  sortBy,
  sortOrder,
  onSort,
  compact = false,
}: {
  snapshot: SnapshotEnvelope;
  onUsagePageChange: (page: number) => void;
  onErrorPageChange: (page: number) => void;
  sortBy: UsageFilterState["sortBy"];
  sortOrder: UsageFilterState["sortOrder"];
  onSort: (column: UsageFilterState["sortBy"]) => void;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<"usage" | "errors">("usage");
  const [selectedLog, setSelectedLog] = useState<UsageLog | null>(null);
  const [selectedError, setSelectedError] = useState<UsageError | null>(null);
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
          onValueChange={(value) =>
            preserveMainScroll(() => setTab(value as "usage" | "errors"))
          }
        >
          <TabsList aria-label="Usage activity type">
            <TabsTrigger value="usage">
              Usage ({integer(snapshot.usagePageInfo.total)})
            </TabsTrigger>
            <TabsTrigger value="errors">
              Errors ({integer(snapshot.errorPageInfo.total)})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="min-w-0 p-0">
        {tab === "usage" ? (
          <UsageLogTable
            logs={snapshot.usageLogs}
            pageInfo={snapshot.usagePageInfo}
            onPageChange={onUsagePageChange}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={onSort}
            onSelect={setSelectedLog}
            compact={compact}
          />
        ) : compact && snapshot.errors.length ? (
          <div className="flex flex-col gap-2">
            {snapshot.errors.map((error) => (
              <UsageErrorCard
                error={error}
                key={error.id}
                onSelect={setSelectedError}
              />
            ))}
            <ActivityPagination
              pageInfo={snapshot.errorPageInfo}
              onPageChange={onErrorPageChange}
              label="error"
            />
          </div>
        ) : snapshot.errors.length ? (
          <div className="flex flex-col gap-2">
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
                      <TableCell>
                        <button
                          type="button"
                          className="text-left hover:text-accent"
                          onClick={() => setSelectedError(error)}
                        >
                          {error.model}
                        </button>
                      </TableCell>
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
            <ActivityPagination
              pageInfo={snapshot.errorPageInfo}
              onPageChange={onErrorPageChange}
              label="error"
            />
          </div>
        ) : (
          <Empty
            title="No usage errors"
            message="No errors were returned for this range."
            compact
          />
        )}
        <UsageDetailDrawer
          log={selectedLog}
          error={selectedError}
          open={selectedLog !== null || selectedError !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedLog(null);
              setSelectedError(null);
            }
          }}
        />
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
  onUsagePageChange,
  onErrorPageChange,
  sortBy,
  sortOrder,
  onSort,
}: {
  snapshot: SnapshotEnvelope;
  filters: UsageFilterState;
  onChange: (filters: UsageFilterState) => void;
  onRefresh: () => void;
  onReset: () => void;
  onUsagePageChange: (page: number) => void;
  onErrorPageChange: (page: number) => void;
  sortBy: UsageFilterState["sortBy"];
  sortOrder: UsageFilterState["sortOrder"];
  onSort: (column: UsageFilterState["sortBy"]) => void;
}) {
  return (
    <div className="flex w-full max-w-370 flex-col gap-6">
      <UsageFilters
        snapshot={snapshot}
        filters={filters}
        onChange={onChange}
        onRefresh={onRefresh}
        onReset={onReset}
      />
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(240px,.85fr)]">
        <Card className="min-w-0 overflow-visible rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
          <CardHeader className="mb-3 flex items-start justify-between gap-3 p-0">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
                Token volume
              </span>
              <CardTitle className="text-lg font-semibold leading-7">
                {filters.granularity === "hour"
                  ? "Hourly trend"
                  : "Daily trend"}
              </CardTitle>
            </div>
            <ChartBar className="size-5 text-accent" />
          </CardHeader>
          <CardContent className="min-w-0 p-0">
            <TrendChart
              rows={snapshot.dailyTrend}
              granularity={filters.granularity}
            />
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
      <ActivityPanel
        snapshot={snapshot}
        onUsagePageChange={onUsagePageChange}
        onErrorPageChange={onErrorPageChange}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={onSort}
      />
    </div>
  );
}

export const Usage = memo(function Usage({
  snapshot,
}: {
  snapshot: SnapshotEnvelope;
}) {
  const [filters, setFilters] = useState(defaultUsageFilterState);
  const [usagePage, setUsagePage] = useState(1);
  const [errorPage, setErrorPage] = useState(1);
  const compact = useCompactTiles();
  const refresh = (
    next: UsageFilterState,
    page = 1,
    nextErrorPage = 1,
    scope: "full" | "usage" | "activity" = "full",
  ) => {
    console.info("[cavoti-usage] dispatching refresh", {
      startDate: next.startDate,
      endDate: next.endDate,
      usagePage: page,
      errorPage: nextErrorPage,
      scope,
    });
    setFilters(next);
    setUsagePage(page);
    setErrorPage(nextErrorPage);
    window.dispatchEvent(
      new CustomEvent("cavoti-usage-refresh", {
        detail: {
          filters: next,
          usagePage: page,
          errorPage: nextErrorPage,
          scope,
        },
      }),
    );
  };
  const apply = () => refresh(filters, usagePage, errorPage, "usage");
  const changeFilters = (next: UsageFilterState) =>
    refresh(next, 1, 1, "usage");
  const changeUsagePage = (page: number) =>
    refresh(filters, page, errorPage, "activity");
  const changeErrorPage = (page: number) =>
    refresh(filters, usagePage, page, "activity");
  const changeSort = (column: UsageFilterState["sortBy"]) => {
    const sortOrder =
      filters.sortBy === column && filters.sortOrder === "desc"
        ? "asc"
        : "desc";
    refresh({ ...filters, sortBy: column, sortOrder }, 1, errorPage, "usage");
  };
  const reset = () => {
    const next = defaultUsageFilterState();
    refresh(next, 1, 1, "usage");
  };
  if (!compact)
    return (
      <UsageWide
        snapshot={snapshot}
        filters={filters}
        onChange={changeFilters}
        onRefresh={apply}
        onReset={reset}
        onUsagePageChange={changeUsagePage}
        onErrorPageChange={changeErrorPage}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSort={changeSort}
      />
    );
  return (
    <div className="flex min-h-full flex-col gap-3">
      <UsageFilters
        snapshot={snapshot}
        filters={filters}
        onChange={changeFilters}
        onRefresh={apply}
        onReset={reset}
      />
      <StatRail snapshot={snapshot} />
      <Card className="overflow-visible rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
        <CardHeader className="mb-3 flex items-start justify-between gap-3 p-0">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
              Token volume
            </span>
            <CardTitle className="text-lg font-semibold leading-7">
              {filters.granularity === "hour" ? "Hourly trend" : "Daily trend"}
            </CardTitle>
          </div>
          <ChartBar className="size-5 text-accent" />
        </CardHeader>
        <CardContent className="min-w-0 p-0">
          <TrendChart
            rows={snapshot.dailyTrend}
            granularity={filters.granularity}
          />
        </CardContent>
      </Card>
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
      <DistributionCard
        title="Groups"
        eyebrow="Billing groups"
        icon={<UsersThree className="size-5 text-accent" />}
        rows={snapshot.groups}
      />
      <DistributionCard
        title="Endpoints"
        eyebrow="Cost centers"
        icon={<ChartBar className="size-5 text-accent" />}
        rows={snapshot.stats.endpoints}
      />
      <ActivityPanel
        snapshot={snapshot}
        onUsagePageChange={changeUsagePage}
        onErrorPageChange={changeErrorPage}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSort={changeSort}
        compact
      />
    </div>
  );
});
