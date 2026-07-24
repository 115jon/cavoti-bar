import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  ChartBarIcon as ChartBar,
  CheckCircleIcon as CheckCircle,
  CornersInIcon as CornersIn,
  CornersOutIcon as CornersOut,
  GearSixIcon as GearSix,
  HouseIcon as House,
  InfoIcon as Info,
  KeyIcon as Key,
  LightningIcon as Lightning,
  LockKeyOpenIcon as LockKeyOpen,
  MinusIcon as Minus,
  PulseIcon as Pulse,
  StackIcon as Stack,
  TimerIcon as Timer,
  UsersThreeIcon as UsersThree,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import {
  normalizeSnapshot,
  type SnapshotEnvelope,
  type Subscription,
  type UsageFilters as UsageFilterState,
  type UsageUnit,
  type UsageWindow,
  usagePercent,
} from "./domain/snapshot";
import type { HostBridge } from "./bridge/host";
import { parseHostMessage } from "./bridge/protocol";
import { Badge as BadgePrimitive } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Skeleton } from "./components/ui/skeleton";
import { Switch } from "./components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { isCompactViewport } from "./domain/responsive";
import { relativeAge } from "./domain/relative-time";

type View = "overview" | "usage" | "plans" | "status" | "settings" | "about";
type BridgeState = "loading" | "auth-required" | "offline" | "error" | "live";
type AppProps = { bridge: HostBridge };
type ActionProps = { icon: ReactNode; label: string; onClick: () => void };

function Badge(props: ComponentProps<typeof BadgePrimitive>) {
  const limited = typeof props.children === "string" && props.children.toLowerCase() === "limited";
  return <BadgePrimitive {...props} variant={limited ? "warning" : props.variant} />;
}

const views: Array<{ id: Exclude<View, "about">; label: string; icon: typeof House }> = [
  { id: "overview", label: "Overview", icon: House },
  { id: "usage", label: "Usage", icon: ChartBar },
  { id: "plans", label: "Plans", icon: Stack },
  { id: "status", label: "Status", icon: Pulse },
  { id: "settings", label: "Settings", icon: GearSix },
];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const integer = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
const tokens = (value: number) =>
  value >= 1e9
    ? `${(value / 1e9).toFixed(2).replace(/\.00$/, "")}B`
    : value >= 1e6
      ? `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`
      : value >= 1e3
        ? `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K`
        : integer(value);
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value))
    : "Not provided";
const usageAmount = (value: number, unit: UsageUnit) => (unit === "points" ? `${quantity(value)} pts` : money(value));

function useRelativeAge(value: string | null, showSeconds: boolean): string {
  const [age, setAge] = useState(() => relativeAge(value, Date.now(), showSeconds));
  useEffect(() => {
    const update = () => setAge(relativeAge(value, Date.now(), showSeconds));
    update();
    const timer = window.setInterval(update, showSeconds ? 1000 : 30000);
    return () => window.clearInterval(timer);
  }, [value, showSeconds]);
  return age;
}

function useCompactTiles(): boolean {
  const [compact, setCompact] = useState(() => isCompactViewport(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const update = () => setCompact(isCompactViewport(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    const query = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 500px), (max-height: 700px)") : null;
    query?.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      query?.removeEventListener("change", update);
    };
  }, []);
  return compact;
}

function TilePager({
  page,
  count,
  onChange,
  label = "Screen",
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  const compact = useCompactTiles();
  if (count <= 1 || !compact) return null;
  return (
    <fieldset className="tile-pager" aria-label={`${label} ${page + 1} of ${count}`}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Previous ${label.toLowerCase()}`}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <CaretLeft />
      </Button>
      <span>
        {page + 1} / {count}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Next ${label.toLowerCase()}`}
        disabled={page === count - 1}
        onClick={() => onChange(page + 1)}
      >
        <CaretRight />
      </Button>
    </fieldset>
  );
}

function resetLabel(value: string | null): string {
  if (!value) return "Reset time unavailable";
  const remaining = Date.parse(value) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Resetting soon";
  const minutes = Math.floor(remaining / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${rest}m`;
  return `Resets in ${Math.max(1, rest)}m`;
}

function SourceStrip({ capturedAt, showSeconds, onRefresh }: { capturedAt: string | null; showSeconds: boolean; onRefresh: () => void }) {
  const age = useRelativeAge(capturedAt, showSeconds);
  return (
    <div className="source-strip live">
      <span className="freshness-text">{age}</span>
      <Button variant="ghost" size="icon" aria-label="Refresh usage data" onClick={onRefresh}>
        <ArrowsClockwise weight="bold" />
      </Button>
    </div>
  );
}

function PlanTabs({
  plans,
  selected,
  onSelect,
}: {
  plans: Subscription[];
  selected: Subscription | undefined;
  onSelect: (name: string) => void;
}) {
  if (plans.length < 2) return null;
  return (
    <div className="plan-tabs plan-catalog" role="tablist" aria-label="Plans">
      {plans.map((plan) => (
        <button
          type="button"
          key={plan.name}
          role="tab"
          aria-selected={selected?.name === plan.name}
          className={`${selected?.name === plan.name ? "active" : ""} ${plan.quotaState === "limited" ? "limited" : ""}`}
          onClick={() => onSelect(plan.name)}
        >
          <Stack className="plan-tab-icon" weight={selected?.name === plan.name ? "fill" : "regular"} />
          <span>{plan.name}</span>
          <small>
            {plan.billingKind} | {plan.status}
          </small>
        </button>
      ))}
    </div>
  );
}

function UsageMeter({ label, window, tone = "accent" }: { label: string; window: UsageWindow; tone?: "accent" | "good" }) {
  const configured = window.configured && window.limit > 0;
  const percent = configured ? usagePercent(window) : 0;
  const displayLabel = label === "Daily" ? "5 hour" : label;
  const urgency = !configured
    ? "unconfigured"
    : percent >= 100
      ? "exhausted"
      : percent >= 90
        ? "critical"
        : percent >= 75
          ? "warning"
          : "healthy";
  const progressTone: "accent" | "good" | "warning" | "critical" =
    urgency === "critical" || urgency === "exhausted" ? "critical" : urgency === "warning" ? "warning" : tone;
  return (
    <div className={`usage-meter urgency-${urgency}`}>
      <div className="meter-label">
        <span>{displayLabel}</span>
        <strong>{configured ? (urgency === "exhausted" ? "Exhausted" : `${percent.toFixed(1)}% used`) : "Not configured"}</strong>
      </div>
      <Progress value={percent} tone={progressTone} />
      <div className="meter-meta">
        <span>
          {configured ? `${usageAmount(window.used, window.unit)} of ${usageAmount(window.limit, window.unit)}` : "No quota configured"}
        </span>
        <span>{configured ? resetLabel(window.resetAt) : "No quota configured"}</span>
      </div>
    </div>
  );
}

function CostSummary({ snapshot }: { snapshot: SnapshotEnvelope }) {
  const today = snapshot.dailyTrend[snapshot.dailyTrend.length - 1] ?? { actualCost: 0, tokens: 0 };
  return (
    <section className="utility-section cost-section">
      <div className="section-top">
        <div>
          <span className="eyebrow">Spend and volume</span>
          <h2>Cost</h2>
        </div>
        <ArrowSquareOut className="section-icon" />
      </div>
      <p>
        Today: {money(today.actualCost)} | {tokens(today.tokens)} tokens
      </p>
      <p>
        Last 30 days: {money(snapshot.stats.actualCost)} | {tokens(snapshot.stats.totalTokens)} tokens
      </p>
    </section>
  );
}

function UtilityAction({ icon, label, onClick }: ActionProps) {
  return (
    <button type="button" className="utility-action" onClick={onClick}>
      <span>{icon}</span>
      <strong>{label}</strong>
      <ArrowSquareOut className="utility-action-arrow" />
    </button>
  );
}

function UtilityActions({
  onNavigate,
  onOpenStatus,
  onQuit,
}: {
  onNavigate: (view: View) => void;
  onOpenStatus: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="utility-actions">
      <UtilityAction icon={<ChartBar />} label="Usage dashboard" onClick={() => onNavigate("usage")} />
      <UtilityAction icon={<Pulse />} label="Status page" onClick={onOpenStatus} />
      <div className="utility-divider" />
      <UtilityAction icon={<GearSix />} label="Settings..." onClick={() => onNavigate("settings")} />
      <UtilityAction icon={<Info />} label="About Cavoti Bar" onClick={() => onNavigate("about")} />
      <UtilityAction icon={<X />} label="Quit" onClick={onQuit} />
    </div>
  );
}

type OverviewProps = {
  snapshot: SnapshotEnvelope;
  onNavigate: (view: View) => void;
  onConnect: () => void;
  onOpenStatus: () => void;
  onQuit: () => void;
  showSeconds: boolean;
};

function DesktopPlanCard({ plan, selected, onSelect }: { plan: Subscription; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`plan-card ${selected ? "selected" : ""} ${plan.quotaState === "limited" ? "limited" : "available"}`}
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
    >
      <div className="plan-card-head">
        <div>
          <span className="eyebrow">{plan.billingKind}</span>
          <h2>{plan.name}</h2>
        </div>
        <Badge variant={plan.quotaState === "limited" ? "warning" : selected ? "success" : "outline"}>{plan.status}</Badge>
      </div>
      <div className="plan-card-meters">
        <UsageMeter label="Daily" window={plan.usage.fiveHour} />
        <UsageMeter label="Weekly" window={plan.usage.weekly} tone="good" />
        <UsageMeter label="Monthly" window={plan.usage.monthly} tone="good" />
      </div>
      <div className="plan-card-foot">
        <span>{plan.expiresAt ? `Renews ${date(plan.expiresAt)}` : "No renewal date"}</span>
        <span>View details</span>
      </div>
    </button>
  );
}

function DesktopOverview({
  snapshot,
  selectedName,
  onSelect,
  onNavigate,
  onOpenStatus,
  onQuit,
  refresh,
  showSeconds,
}: OverviewProps & { selectedName: string | undefined; onSelect: (name: string) => void; refresh: () => void }) {
  return (
    <div className="view-stack wide-overview flex h-full min-h-0 flex-col gap-6 overflow-auto">
      <div className="desktop-view-heading">
        <div>
          <span className="eyebrow">Account overview</span>
          <h1>Overview</h1>
        </div>
        <span className="desktop-view-caption">{snapshot.subscriptions.length} plans | usage, limits, and shortcuts</span>
      </div>
      <SourceStrip capturedAt={snapshot.capturedAt} showSeconds={showSeconds} onRefresh={refresh} />
      <div className="desktop-overview-layout">
        <section className="desktop-plan-area">
          <div className="section-top desktop-section-heading">
            <div>
              <span className="eyebrow">All plans</span>
              <h2>Quota monitor</h2>
            </div>
            <Badge variant="outline">{snapshot.subscriptions.length} total</Badge>
          </div>
          <div className="plan-grid" role="tablist" aria-label="All plans">
            {snapshot.subscriptions.map((item) => (
              <DesktopPlanCard key={item.name} plan={item} selected={selectedName === item.name} onSelect={() => onSelect(item.name)} />
            ))}
          </div>
        </section>
        <aside className="desktop-insight-rail">
          <CostSummary snapshot={snapshot} />
          <UtilityActions onNavigate={onNavigate} onOpenStatus={onOpenStatus} onQuit={onQuit} />
        </aside>
      </div>
    </div>
  );
}

function CompactOverview({
  snapshot,
  selectedName,
  onSelect,
  onNavigate,
  onConnect,
  onOpenStatus,
  onQuit,
  refresh,
  showSeconds,
}: OverviewProps & { selectedName: string | undefined; onSelect: (name: string) => void; refresh: () => void }) {
  const plan = snapshot.subscriptions.find((item) => item.name === selectedName) ?? snapshot.subscriptions[0];
  return (
    <div className="view-stack compact-overview compact-dashboard tile-stack">
      <SourceStrip capturedAt={snapshot.capturedAt} showSeconds={showSeconds} onRefresh={refresh} />
      <div className="compact-plan-heading">
        <div>
          <span className="eyebrow">Selected plan</span>
          <h1>{plan?.name ?? "No active plan"}</h1>
        </div>
        {plan ? <Badge variant={plan.status === "limited" ? "warning" : "success"}>{plan.status}</Badge> : null}
      </div>
      <PlanTabs plans={snapshot.subscriptions} selected={plan} onSelect={onSelect} />
      {snapshot.banner ? (
        <div className="signal-note">
          <Lightning weight="fill" />
          <div>
            <strong>{snapshot.banner.title}</strong>
            <span>{snapshot.banner.message}</span>
          </div>
        </div>
      ) : null}
      {plan ? (
        <section className="primary-usage">
          <div className="section-top">
            <div>
              <span className="eyebrow">Quota overview</span>
              <h2>{plan.billingKind}</h2>
            </div>
          </div>
          <div className="usage-columns">
            <UsageMeter label="Daily" window={plan.usage.daily} />
            <UsageMeter label="Weekly" window={plan.usage.weekly} tone="good" />
            <UsageMeter label="Monthly" window={plan.usage.monthly} tone="good" />
          </div>
        </section>
      ) : (
        <Empty title="No active plan" message="Cavoti did not return an active subscription for this session." onAction={onConnect} />
      )}
      <CostSummary snapshot={snapshot} />
      <UtilityActions onNavigate={onNavigate} onOpenStatus={onOpenStatus} onQuit={onQuit} />
    </div>
  );
}

function Overview({ snapshot, onNavigate, onConnect, onOpenStatus, onQuit, showSeconds }: OverviewProps) {
  const activePlan = snapshot.subscriptions.find((item) => item.status === "active") ?? snapshot.subscriptions[0];
  const [selectedName, setSelectedName] = useState(activePlan?.name);
  const compact = useCompactTiles();
  const refresh = () => window.dispatchEvent(new CustomEvent("cavoti-refresh"));
  return compact ? (
    <CompactOverview
      snapshot={snapshot}
      selectedName={selectedName}
      onSelect={setSelectedName}
      onNavigate={onNavigate}
      onConnect={onConnect}
      onOpenStatus={onOpenStatus}
      onQuit={onQuit}
      refresh={refresh}
      showSeconds={showSeconds}
    />
  ) : (
    <DesktopOverview
      snapshot={snapshot}
      selectedName={selectedName}
      onSelect={setSelectedName}
      onNavigate={onNavigate}
      onConnect={onConnect}
      onOpenStatus={onOpenStatus}
      onQuit={onQuit}
      refresh={refresh}
      showSeconds={showSeconds}
    />
  );
}

function StatRail({ snapshot }: { snapshot: SnapshotEnvelope }) {
  return (
    <div className="stat-rail">
      <div>
        <span>Requests</span>
        <strong>{integer(snapshot.stats.requests)}</strong>
      </div>
      <div>
        <span>Total tokens</span>
        <strong>{tokens(snapshot.stats.totalTokens)}</strong>
      </div>
      <div>
        <span>Actual cost</span>
        <strong>{money(snapshot.stats.actualCost)}</strong>
      </div>
    </div>
  );
}

function ModelRows({ rows }: { rows: Array<{ name: string; requests: number; tokens: number; actualCost: number }> }) {
  return rows.length ? (
    <div className="model-rows">
      {rows.map((row) => (
        <div className="model-row" key={row.name}>
          <span>
            <i className="model-dot" />
            {row.name}
          </span>
          <strong>{money(row.actualCost)}</strong>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No model detail" message="The connected session returned no model breakdown." compact />
  );
}

function DataRows({ rows, empty }: { rows: Array<{ name: string; requests: number; tokens: number; actualCost: number }>; empty: string }) {
  return rows.length ? (
    <div className="data-rows">
      {rows.map((row) => (
        <div className="data-row" key={row.name}>
          <span className="row-name">{row.name}</span>
          <span>{integer(row.requests)} req</span>
          <span>{tokens(row.tokens)}</span>
          <strong>{money(row.actualCost)}</strong>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No rows" message={empty} compact />
  );
}

function localDateInput(dateValue: Date): string {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultUsageFilterState(): UsageFilterState {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return {
    startDate: localDateInput(start),
    endDate: localDateInput(end),
    apiKeyId: null,
    model: "",
    groupId: null,
    requestType: "",
    billingType: null,
    billingMode: "",
  };
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
  return (
    <label className="usage-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.value} key={`${label}-${option.value}`}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  const update = (patch: Partial<UsageFilterState>) => onChange({ ...filters, ...patch });
  return (
    <section className="usage-filters">
      <div className="usage-filter-grid">
        <label className="usage-filter-field">
          <span>Date range</span>
          <div className="usage-date-pair">
            <input type="date" value={filters.startDate} onChange={(event) => update({ startDate: event.target.value })} />
            <input type="date" value={filters.endDate} onChange={(event) => update({ endDate: event.target.value })} />
          </div>
        </label>
        <FilterSelect
          label="API key"
          value={filters.apiKeyId === null ? "" : String(filters.apiKeyId)}
          options={[
            { value: "", label: "All API keys" },
            ...snapshot.apiKeys.map((item) => ({ value: String(item.id), label: item.name })),
          ]}
          onChange={(value) => update({ apiKeyId: value ? Number(value) : null })}
        />
        <FilterSelect
          label="Model"
          value={filters.model}
          options={[{ value: "", label: "All models" }, ...models.map((model) => ({ value: model, label: model }))]}
          onChange={(model) => update({ model })}
        />
        <FilterSelect
          label="Group"
          value={filters.groupId === null ? "" : String(filters.groupId)}
          options={[
            { value: "", label: "All groups" },
            ...snapshot.groupOptions.map((item) => ({ value: String(item.id), label: item.name })),
          ]}
          onChange={(value) => update({ groupId: value ? Number(value) : null })}
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
          value={filters.billingType === null ? "" : String(filters.billingType)}
          options={[
            { value: "", label: "All billing types" },
            { value: "0", label: "Balance" },
            { value: "1", label: "Subscription" },
          ]}
          onChange={(value) => update({ billingType: value ? Number(value) : null })}
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
      <div className="usage-filter-actions">
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

function TrendChart({ rows }: { rows: SnapshotEnvelope["dailyTrend"] }) {
  if (!rows.length) return <Empty title="No trend data" message="Try a wider date range or fewer filters." compact />;
  const width = 640;
  const height = 190;
  const pad = 18;
  const max = Math.max(...rows.map((row) => row.actualCost), 0.01);
  const points = rows
    .map(
      (row, index) =>
        `${pad + (index / Math.max(rows.length - 1, 1)) * (width - pad * 2)},${height - pad - (row.actualCost / max) * (height - pad * 2)}`,
    )
    .join(" ");
  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily actual cost trend" preserveAspectRatio="none">
        <path d={`M ${pad} ${height - pad} H ${width - pad}`} className="chart-axis" />
        <polyline points={points} className="chart-line" />
        <circle cx={points.split(" ")[0]?.split(",")[0]} cy={points.split(" ")[0]?.split(",")[1]} r="3" className="chart-point" />
      </svg>
      <div className="chart-labels">
        <span>{rows[0]?.date}</span>
        <span>{rows[rows.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function DistributionChart({ rows }: { rows: Array<{ name: string; actualCost: number }> }) {
  const values = rows.filter((row) => row.actualCost > 0).slice(0, 5);
  const total = values.reduce((sum, row) => sum + row.actualCost, 0);
  if (!total) return <Empty title="No distribution data" message="No cost distribution returned for these filters." compact />;
  let cursor = 0;
  const colors = ["#8f4a22", "#2f6b3f", "#956412", "#7b628e", "#536b7f"];
  const stops = values
    .map((row, index) => {
      const start = cursor;
      cursor += (row.actualCost / total) * 100;
      return `${colors[index]} ${start}% ${cursor}%`;
    })
    .join(", ");
  return (
    <div className="distribution-chart">
      <div className="donut-chart" style={{ background: `conic-gradient(${stops})` }}>
        <span>{money(total)}</span>
      </div>
      <div className="distribution-legend">
        {values.map((row, index) => (
          <div key={row.name}>
            <i style={{ background: colors[index] }} />
            <span>{row.name}</span>
            <strong>{money(row.actualCost)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageWide({
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
  return (
    <div className="view-stack wide-usage">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Usage dashboard</span>
          <h1>Usage</h1>
        </div>
        <Badge variant="outline">
          {filters.startDate} to {filters.endDate}
        </Badge>
      </div>
      <UsageFilters snapshot={snapshot} filters={filters} onChange={onChange} onRefresh={onRefresh} onReset={onReset} />
      <div className="usage-chart-grid">
        <section className="surface-section chart-section">
          <div className="section-top">
            <div>
              <span className="eyebrow">Actual cost</span>
              <h2>Daily trend</h2>
            </div>
            <ChartBar className="section-icon" />
          </div>
          <TrendChart rows={snapshot.dailyTrend} />
        </section>
        <section className="surface-section chart-section">
          <div className="section-top">
            <div>
              <span className="eyebrow">Share of spend</span>
              <h2>By model</h2>
            </div>
            <Stack className="section-icon" />
          </div>
          <DistributionChart rows={snapshot.models} />
        </section>
      </div>
      <StatRail snapshot={snapshot} />
      <div className="wide-data-grid">
        <section className="surface-section">
          <div className="section-top">
            <h2>Endpoints</h2>
          </div>
          <DataRows rows={snapshot.stats.endpoints.slice(0, 5)} empty="No endpoint data returned." />
        </section>
        <section className="surface-section">
          <div className="section-top">
            <h2>Groups</h2>
          </div>
          <DataRows rows={snapshot.groups.slice(0, 5)} empty="No group data returned." />
        </section>
      </div>
    </div>
  );
}

function Usage({ snapshot }: { snapshot: SnapshotEnvelope }) {
  const [filters, setFilters] = useState(defaultUsageFilterState);
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const apply = () => window.dispatchEvent(new CustomEvent("cavoti-usage-refresh", { detail: filters }));
  const reset = () => {
    const next = defaultUsageFilterState();
    setFilters(next);
    window.dispatchEvent(new CustomEvent("cavoti-usage-refresh", { detail: next }));
  };
  if (!compact) return <UsageWide snapshot={snapshot} filters={filters} onChange={setFilters} onRefresh={apply} onReset={reset} />;
  const pageCount = 6;
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">
              {page === 0
                ? "Filters"
                : page === 1
                  ? "Daily trend"
                  : page === 2
                    ? "Model distribution"
                    : page === 3
                      ? "Endpoints"
                      : page === 4
                        ? "Groups"
                        : "Models"}
            </span>
            <h1>Usage</h1>
          </div>
          <div className="tile-heading-actions">
            <Badge variant="outline">
              {filters.startDate} to {filters.endDate}
            </Badge>
            <TilePager page={page} count={pageCount} onChange={setPage} label="Usage screen" />
          </div>
        </div>
        {page === 0 ? (
          <>
            <UsageFilters snapshot={snapshot} filters={filters} onChange={setFilters} onRefresh={apply} onReset={reset} />
            <StatRail snapshot={snapshot} />
          </>
        ) : page === 1 ? (
          <section className="surface-section chart-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Daily trend</h2>
              </div>
              <ChartBar className="section-icon" />
            </div>
            <TrendChart rows={snapshot.dailyTrend} />
          </section>
        ) : page === 2 ? (
          <section className="surface-section chart-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Share of spend</span>
                <h2>By model</h2>
              </div>
              <Stack className="section-icon" />
            </div>
            <DistributionChart rows={snapshot.models} />
          </section>
        ) : page === 3 ? (
          <section className="surface-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Cost centers</h2>
              </div>
              <span className="muted-label">endpoints</span>
            </div>
            <DataRows rows={snapshot.stats.endpoints.slice(0, 8)} empty="No endpoint data returned." />
          </section>
        ) : page === 4 ? (
          <section className="surface-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Billing groups</h2>
              </div>
              <UsersThree className="section-icon" />
            </div>
            <DataRows rows={snapshot.groups.slice(0, 8)} empty="No group data returned." />
          </section>
        ) : (
          <section className="surface-section tile-fill">
            <div className="section-top">
              <div>
                <span className="eyebrow">Actual cost</span>
                <h2>Model spend</h2>
              </div>
              <ChartBar className="section-icon" />
            </div>
            <ModelRows rows={snapshot.models.slice(0, 8)} />
          </section>
        )}
        <TilePager page={page} count={pageCount} onChange={setPage} label="Usage screen" />
      </div>
    </div>
  );
}

function Plans({ snapshot, onConnect }: { snapshot: SnapshotEnvelope; onConnect: () => void }) {
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const safePage = Math.min(page, Math.max(snapshot.subscriptions.length - 1, 0));
  const plan = snapshot.subscriptions[safePage];
  if (!compact)
    return (
      <div className="view-stack wide-plans">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Entitlements</span>
            <h1>Plans</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onConnect}>
            Manage on Cavoti <ArrowSquareOut data-icon="inline-end" />
          </Button>
        </div>
        <div className="wide-plan-list">
          {snapshot.subscriptions.map((item) => (
            <section className="plan-row" key={item.name}>
              <div className="plan-head">
                <div>
                  <Badge variant={item.status === "active" ? "success" : "outline"}>{item.status}</Badge>
                  <h2>{item.name}</h2>
                  <span className="plan-subtitle">{item.billingKind}</span>
                </div>
              </div>
              <div className="plan-meters">
                <UsageMeter label="5 hour" window={item.usage.fiveHour} />
                <UsageMeter label="Weekly" window={item.usage.weekly} tone="good" />
                <UsageMeter label="Monthly" window={item.usage.monthly} tone="good" />
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Entitlements</span>
            <h1>Plans</h1>
          </div>
          <div className="tile-heading-actions">
            <Button variant="outline" size="sm" onClick={onConnect}>
              Manage on Cavoti <ArrowSquareOut data-icon="inline-end" />
            </Button>
            <TilePager page={safePage} count={snapshot.subscriptions.length} onChange={setPage} label="Plan screen" />
          </div>
        </div>
        {plan ? (
          <section className="plan-row featured">
            <div className="plan-head">
              <div>
                <Badge variant={plan.status === "active" ? "success" : "outline"}>{plan.status}</Badge>
                <h2>{plan.name}</h2>
                <span className="plan-subtitle">{plan.billingKind}</span>
              </div>
              <span className="plan-index">{String(safePage + 1).padStart(2, "0")}</span>
            </div>
            <div className="plan-meters">
              <UsageMeter label="Daily" window={plan.usage.daily} />
              <UsageMeter label="Weekly" window={plan.usage.weekly} tone="good" />
              <UsageMeter label="Monthly" window={plan.usage.monthly} tone="good" />
            </div>
            <div className="plan-foot">
              <span>Renews {date(plan.expiresAt)}</span>
              <span>{plan.usage.daily.unit === "points" ? "Points" : "USD"}</span>
            </div>
          </section>
        ) : (
          <Empty title="No plan records" message="Connect Cavoti to read your current entitlements." onAction={onConnect} />
        )}
        {snapshot.quotaResetCards.length ? (
          <div className="signal-note">
            <Timer />
            <div>
              <strong>Quota resets</strong>
              <span>
                {snapshot.quotaResetCards.map((card) => `${card.label}${card.resetAt ? ` | ${resetLabel(card.resetAt)}` : ""}`).join(" | ")}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function monitorVariant(status: string): "success" | "warning" | "outline" {
  return status === "operational" ? "success" : status === "degraded" || status === "outage" ? "warning" : "outline";
}

function MonitorRows({ monitors }: { monitors: SnapshotEnvelope["channelMonitors"] }) {
  return monitors.length ? (
    <div className="monitor-list">
      {monitors.map((monitor) => (
        <div className="monitor-row" key={`${monitor.provider}-${monitor.name}`}>
          <div>
            <strong>{monitor.name}</strong>
            <small>
              {monitor.provider}
              {monitor.model ? ` | ${monitor.model}` : ""}
            </small>
          </div>
          <div className="monitor-metrics">
            <Badge variant={monitorVariant(monitor.status)}>{monitor.status}</Badge>
            <span>{monitor.latencyMs === null ? "No latency" : `${Math.round(monitor.latencyMs)} ms`}</span>
            <span>{monitor.availability7d === null ? "-" : `${monitor.availability7d.toFixed(1)}% / 7d`}</span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No channel monitors" message="Cavoti did not return channel health data." compact />
  );
}

function Status({
  snapshot,
  state,
  onConnect,
  onOpenStatus = () => window.dispatchEvent(new CustomEvent("cavoti-open-status")),
}: {
  snapshot?: SnapshotEnvelope;
  state: BridgeState;
  onConnect: () => void;
  onOpenStatus?: () => void;
}) {
  const monitors = snapshot?.channelMonitors ?? [];
  const healthy = monitors.length > 0 && monitors.every((monitor) => monitor.status === "operational");
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const pageCount = monitors.length + 1;
  const safePage = Math.min(page, pageCount - 1);
  if (!compact)
    return (
      <div className="view-stack wide-status">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Connection monitor</span>
            <h1>Status</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenStatus}>
            Open monitor <ArrowSquareOut data-icon="inline-end" />
          </Button>
        </div>
        <div className="status-summary">
          <div className="status-orb">{state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}</div>
          <div>
            <span className="eyebrow">Cavoti channels</span>
            <h2>{healthy ? "All channels operational" : "Channel attention needed"}</h2>
            <p>
              {monitors.length} channels reported. Last received {date(snapshot?.capturedAt ?? null)}.
            </p>
          </div>
        </div>
        <MonitorRows monitors={monitors} />
      </div>
    );
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Connection monitor</span>
            <h1>Status</h1>
          </div>
          <div className="tile-heading-actions">
            <Button variant="outline" size="sm" onClick={onOpenStatus}>
              Open monitor <ArrowSquareOut data-icon="inline-end" />
            </Button>
            <TilePager page={safePage} count={pageCount} onChange={setPage} label="Status screen" />
          </div>
        </div>
        {safePage === 0 ? (
          <>
            {
              <div className="status-summary">
                <div className="status-orb">
                  {state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
                </div>
                <div>
                  <span className="eyebrow">Cavoti channels</span>
                  <h2>{state === "live" ? (healthy ? "All channels operational" : "Channel attention needed") : "No live snapshot yet"}</h2>
                  <p>
                    {state === "live"
                      ? `${monitors.length} channels reported. Last received ${date(snapshot?.capturedAt ?? null)}.`
                      : "The overlay only receives sanitized aggregate JSON from the authenticated browser profile."}
                  </p>
                </div>
              </div>
            }
            {snapshot ? (
              <div className="check-list">
                <CheckRow label="Account record" value={snapshot.account.status} good />
                <CheckRow
                  label="Plan records"
                  value={`${snapshot.subscriptions.length} returned`}
                  good={snapshot.subscriptions.length > 0}
                />
                <CheckRow
                  label="Usage aggregates"
                  value={`${snapshot.models.length} models | ${snapshot.stats.endpoints.length} endpoints`}
                  good={snapshot.models.length > 0}
                />
              </div>
            ) : (
              <Empty
                title="Live session required"
                message="Sign in through the Cavoti connection window to populate this view."
                onAction={onConnect}
              />
            )}
          </>
        ) : (
          <section className="surface-section monitor-tile">
            <div className="section-top">
              <div>
                <span className="eyebrow">Channel {safePage}</span>
                <h2>{monitors[safePage - 1]?.name ?? "Unknown channel"}</h2>
              </div>
              <Pulse className="section-icon" />
            </div>
            <MonitorRows monitors={monitors.slice(safePage - 1, safePage)} />
          </section>
        )}
        <TilePager page={safePage} count={pageCount} onChange={setPage} label="Status screen" />
        {snapshot?.announcements.length ? (
          <div className="signal-note">
            <Info />
            <div>
              <strong>{snapshot.announcements[0].title}</strong>
              <span>{snapshot.announcements[0].message}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CheckRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="check-row">
      <span className={good ? "check-dot good" : "check-dot"}>{good ? <CheckCircle weight="fill" /> : <Info weight="regular" />}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const refreshOptions = [
  { value: 0, label: "Manual only" },
  { value: 15, label: "Every 15 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
];

function RefreshSettings({
  refreshIntervalSeconds,
  onRefreshInterval,
  showFreshnessSeconds,
  onShowFreshnessSeconds,
}: {
  refreshIntervalSeconds: number;
  onRefreshInterval: (seconds: number) => void;
  showFreshnessSeconds: boolean;
  onShowFreshnessSeconds: (value: boolean) => void;
}) {
  return (
    <div className="refresh-settings">
      <div className="setting-row">
        <div>
          <strong>Refresh interval</strong>
          <small>Choose how often usage refreshes automatically.</small>
        </div>
        <select
          aria-label="Refresh interval"
          value={refreshIntervalSeconds}
          onChange={(event) => onRefreshInterval(Number(event.target.value))}
        >
          {refreshOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <strong>Show seconds</strong>
          <small>Show seconds for recent update timing.</small>
        </div>
        <Switch checked={showFreshnessSeconds} onCheckedChange={onShowFreshnessSeconds} aria-label="Show seconds in freshness" />
      </div>
    </div>
  );
}

function Settings({
  topmost,
  onTopmost,
  onClear,
  onConnect,
  refreshIntervalSeconds,
  onRefreshInterval,
  showFreshnessSeconds,
  onShowFreshnessSeconds,
}: {
  topmost: boolean;
  onTopmost: (value: boolean) => void;
  onClear: () => void;
  onConnect: () => void;
  refreshIntervalSeconds: number;
  onRefreshInterval: (seconds: number) => void;
  showFreshnessSeconds: boolean;
  onShowFreshnessSeconds: (value: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  if (!compact)
    return (
      <div className="view-stack wide-settings">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Application</span>
            <h1>Settings</h1>
          </div>
          <Badge variant="outline">Local</Badge>
        </div>
        <div className="settings-grid">
          <section className="surface-section settings-section">
            <span className="eyebrow">Window behavior</span>
            <div className="setting-row">
              <div>
                <strong>Keep on top</strong>
                <small>Keep the popover above other windows.</small>
              </div>
              <Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" />
            </div>
            <RefreshSettings
              refreshIntervalSeconds={refreshIntervalSeconds}
              onRefreshInterval={onRefreshInterval}
              showFreshnessSeconds={showFreshnessSeconds}
              onShowFreshnessSeconds={onShowFreshnessSeconds}
            />
            <div className="setting-row">
              <div>
                <strong>Connection profile</strong>
                <small>Session cookies stay inside the WebView2 profile.</small>
              </div>
              <Button variant="outline" size="sm" onClick={onConnect}>
                Open sign in
              </Button>
            </div>
          </section>
          <section className="surface-section settings-section">
            <span className="eyebrow">Privacy boundary</span>
            <div className="privacy-note">
              <Key />
              <div>
                <strong>Credentials never reach this UI</strong>
                <small>Only normalized usage, plan, and account status data are forwarded.</small>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear local preferences
            </Button>
          </section>
        </div>
      </div>
    );
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Application</span>
            <h1>Settings</h1>
          </div>
          <div className="tile-heading-actions">
            <Badge variant="outline">Local</Badge>
            <TilePager page={page} count={2} onChange={setPage} label="Settings screen" />
          </div>
        </div>
        {page === 0 ? (
          <section className="surface-section settings-section">
            <span className="eyebrow">Window behavior</span>
            <div className="setting-row">
              <div>
                <strong>Keep on top</strong>
                <small>Keep the popover above other windows.</small>
              </div>
              <Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" />
            </div>
            <RefreshSettings
              refreshIntervalSeconds={refreshIntervalSeconds}
              onRefreshInterval={onRefreshInterval}
              showFreshnessSeconds={showFreshnessSeconds}
              onShowFreshnessSeconds={onShowFreshnessSeconds}
            />
            <div className="setting-row">
              <div>
                <strong>Connection profile</strong>
                <small>Session cookies stay inside the WebView2 profile.</small>
              </div>
              <Button variant="outline" size="sm" onClick={onConnect}>
                Open sign in
              </Button>
            </div>
          </section>
        ) : (
          <section className="surface-section settings-section">
            <span className="eyebrow">Privacy boundary</span>
            <div className="privacy-note">
              <Key />
              <div>
                <strong>Credentials never reach this UI</strong>
                <small>Only normalized usage, plan, and account status data are forwarded.</small>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear local preferences
            </Button>
          </section>
        )}
        <TilePager page={page} count={2} onChange={setPage} label="Settings screen" />
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="view-stack">
      <div className="view-heading">
        <div>
          <span className="eyebrow">About</span>
          <h1>Cavoti Bar</h1>
        </div>
        <Badge variant="outline">Baseline</Badge>
      </div>
      <section className="surface-section about-section">
        <img src="./cavoti-logo.png" alt="" />
        <div>
          <h2>Private usage at a glance</h2>
          <p>
            Cavoti Bar reads aggregate plan and usage data through an authenticated Cavoti browser profile. Credentials never enter the
            renderer.
          </p>
        </div>
        <div className="about-meta">
          <span>Built for Cavoti</span>
          <span>Local WebView2 session</span>
        </div>
      </section>
    </div>
  );
}

function Empty({
  title,
  message,
  onAction,
  compact = false,
}: {
  title: string;
  message: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <img src="./cavoti-logo.png" alt="" />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {onAction ? (
          <Button size="sm" variant="secondary" onClick={onAction}>
            Connect Cavoti <ArrowSquareOut data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function App({ bridge }: AppProps) {
  const [state, setState] = useState<BridgeState>("loading");
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope>();
  const [view, setView] = useState<View>("overview");
  const [topmost, setTopmost] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(60);
  const [showFreshnessSeconds, setShowFreshnessSeconds] = useState(false);
  const compact = useCompactTiles();
  const hasSnapshot = useRef(false);
  const connect = () => bridge.post({ action: "connect" });
  const refresh = useCallback(() => bridge.post({ action: "refresh" }), [bridge]);
  const openStatus = useCallback(() => bridge.post({ action: "open-status" }), [bridge]);
  const setWindowTopmost = (enabled: boolean) => {
    setTopmost(enabled);
    bridge.post({ action: "setting", value: { name: "topmost", enabled } });
  };
  const setRefreshInterval = (seconds: number) => {
    setRefreshIntervalSeconds(seconds);
    bridge.post({ action: "setting", value: { name: "refresh-interval", seconds } });
  };
  const setFreshnessSeconds = (enabled: boolean) => {
    setShowFreshnessSeconds(enabled);
    bridge.post({ action: "setting", value: { name: "freshness-seconds", enabled } });
  };

  useEffect(() => {
    const unsubscribe = bridge.subscribe((raw) => {
      const message = parseHostMessage(raw);
      if (!message) return;
      if (message.type === "snapshot") {
        const next = normalizeSnapshot(message.snapshot);
        if (next) {
          hasSnapshot.current = true;
          setSnapshot(next);
          setState("live");
          if (message.settings) {
            setTopmost(message.settings.topmost);
            setMaximized(message.settings.maximized);
            setRefreshIntervalSeconds(message.settings.refreshIntervalSeconds);
            setShowFreshnessSeconds(message.settings.showFreshnessSeconds);
          }
        }
      } else if (message.type === "settings") {
        setTopmost(message.settings.topmost);
        setMaximized(message.settings.maximized);
        setRefreshIntervalSeconds(message.settings.refreshIntervalSeconds);
        setShowFreshnessSeconds(message.settings.showFreshnessSeconds);
      } else if (message.state !== "loading" || !hasSnapshot.current) setState(message.state);
    });
    bridge.post({ action: "bootstrap" });
    const usageRefresh = (event: Event) =>
      bridge.post({ action: "refresh", value: { filters: (event as CustomEvent<UsageFilterState>).detail } });
    window.addEventListener("cavoti-refresh", refresh);
    window.addEventListener("cavoti-open-status", openStatus);
    window.addEventListener("cavoti-usage-refresh", usageRefresh);
    return () => {
      unsubscribe();
      window.removeEventListener("cavoti-refresh", refresh);
      window.removeEventListener("cavoti-open-status", openStatus);
      window.removeEventListener("cavoti-usage-refresh", usageRefresh);
    };
  }, [bridge, openStatus, refresh]);

  const title = useMemo(() => (view === "about" ? "About" : (views.find((item) => item.id === view)?.label ?? "Overview")), [view]);
  const beginDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    bridge.post({ action: "drag" });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell" data-layout={compact ? "compact" : "wide"}>
        <header className="titlebar" data-drag-region onMouseDown={beginDrag}>
          <button type="button" className="brand-button" onClick={() => setView("overview")}>
            <img src="./favicon.png" alt="Cavoti" />
            <span>
              <strong>Cavoti</strong>
            </span>
          </button>
          <div className="window-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label={maximized ? "Restore window" : "Maximize window"}
              onClick={() => bridge.post({ action: "maximize" })}
            >
              {maximized ? <CornersIn /> : <CornersOut />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Minimize window" onClick={() => bridge.post({ action: "minimize" })}>
              <Minus />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close window" onClick={() => bridge.post({ action: "close" })}>
              <X />
            </Button>
          </div>
        </header>
        <div className="shell-body">
          <nav className="nav-rail" aria-label="Primary navigation">
            {views.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="tab"
                    className={`nav-button ${view === id ? "active" : ""}`}
                    aria-label={label}
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                  >
                    <Icon weight={view === id ? "fill" : "regular"} />
                    <span className="nav-label">{label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
            <div className="nav-spacer" />
          </nav>
          <main className="content" aria-live="polite">
            <div className="mobile-heading">
              <span>{title}</span>
              <span className="mobile-state">{state}</span>
            </div>
            {state === "loading" ? (
              <Loading />
            ) : state !== "live" || !snapshot ? (
              <Boundary state={state} onConnect={connect} />
            ) : view === "overview" ? (
              <Overview
                snapshot={snapshot}
                onNavigate={setView}
                onConnect={connect}
                onOpenStatus={openStatus}
                onQuit={() => bridge.post({ action: "close" })}
                showSeconds={showFreshnessSeconds}
              />
            ) : view === "usage" ? (
              <Usage snapshot={snapshot} />
            ) : view === "plans" ? (
              <Plans snapshot={snapshot} onConnect={connect} />
            ) : view === "status" ? (
              <Status snapshot={snapshot} state={state} onConnect={connect} />
            ) : view === "about" ? (
              <About />
            ) : (
              <Settings
                topmost={topmost}
                onTopmost={setWindowTopmost}
                onClear={() => bridge.post({ action: "clear" })}
                onConnect={connect}
                refreshIntervalSeconds={refreshIntervalSeconds}
                onRefreshInterval={setRefreshInterval}
                showFreshnessSeconds={showFreshnessSeconds}
                onShowFreshnessSeconds={setFreshnessSeconds}
              />
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Loading() {
  return (
    <div className="view-stack loading-stack" aria-busy="true" role="status" aria-label="Loading Cavoti snapshot">
      <span className="sr-only">Loading Cavoti snapshot</span>
      <div className="view-heading loading-heading">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-36" />
        </div>
        <Skeleton className="size-8" />
      </div>
      <Skeleton className="h-14 w-full" />
      <section className="primary-usage loading-surface">
        <div className="section-top">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-28" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="usage-columns">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </section>
      <Skeleton className="h-16 w-full" />
      <div className="split-grid">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}

function Boundary({ state, onConnect }: { state: BridgeState; onConnect: () => void }) {
  const copy =
    state === "offline"
      ? ["Cavoti is offline", "The authenticated profile could not reach Cavoti. Try again when the site is available."]
      : state === "error"
        ? ["The bridge needs attention", "The local host could not produce a safe snapshot."]
        : ["Live session required", "Sign in through the Cavoti connection window."];
  return (
    <div className="boundary">
      <div className="boundary-icon">{state === "auth-required" ? <LockKeyOpen /> : <WarningCircle />}</div>
      <span className="eyebrow">{state === "auth-required" ? "Authentication" : "Connection"}</span>
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <Button onClick={onConnect}>
        {state === "auth-required" ? "Connect Cavoti" : "Try again"} <ArrowSquareOut data-icon="inline-end" />
      </Button>
    </div>
  );
}
