import { memo, useState } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowsClockwiseIcon as ArrowsClockwise,
  ChartBarIcon as ChartBar,
  DownloadSimpleIcon as DownloadSimple,
  GearSixIcon as GearSix,
  InfoIcon as Info,
  LightningIcon as Lightning,
  PulseIcon as Pulse,
  XIcon as X,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope, Subscription } from "../domain/snapshot";
import { date, money, planVariant, tokens } from "../app/formatters";
import type { ActionProps, View } from "../app/types";
import {
  Badge,
  Empty,
  PlanSelector,
  SignalNote,
  SourceStrip,
  UsageMeter,
  useCompactTiles,
} from "../components/app/shared";
import { Button } from "../components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Separator } from "../components/ui/separator";

type OverviewProps = {
  snapshot: SnapshotEnvelope;
  onNavigate: (view: View) => void;
  onConnect: () => void;
  onOpenStatus: () => void;
  onQuit: () => void;
  onRestart: () => void;
  updateReady: boolean;
  showSeconds: boolean;
  showShortcuts: boolean;
  showRefresh: boolean;
};

function CostSummary({
  snapshot,
  onOpenUsage,
}: {
  snapshot: SnapshotEnvelope;
  onOpenUsage: () => void;
}) {
  const today = snapshot.dailyTrend[snapshot.dailyTrend.length - 1] ?? {
    actualCost: 0,
    tokens: 0,
  };
  return (
    <Card className="gap-0 rounded-xl border border-(--line) bg-white/70 px-5 py-4 text-(--ink) shadow-sm">
      <CardHeader className="mb-2 flex items-start justify-between gap-3 p-0">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
            Spend and volume
          </span>
          <CardTitle className="m-0 text-xl font-semibold leading-7">
            Cost
          </CardTitle>
        </div>
        <CardAction className="-mr-1 -mt-1">
          <Button
            className="text-accent"
            variant="ghost"
            size="icon"
            aria-label="Open usage dashboard"
            onClick={onOpenUsage}
          >
            <ArrowSquareOut className="size-5" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-w-0 p-0 text-sm leading-5 text-(--ink-muted) [&_p]:m-0 [&_p+p]:mt-1.5 [&_p:first-of-type]:text-(--ink)">
        <p>
          Today: {money(today.actualCost)} | {tokens(today.tokens)} tokens
        </p>
        <p>
          Last 30 days: {money(snapshot.stats.actualCost)} |{" "}
          {tokens(snapshot.stats.totalTokens)} tokens
        </p>
      </CardContent>
    </Card>
  );
}

function UtilityAction({
  icon,
  label,
  shortcut,
  onClick,
}: ActionProps & { shortcut?: string }) {
  return (
    <button
      type="button"
      className="flex min-h-9 w-full items-center justify-start gap-2.5 rounded-md border-0 bg-transparent px-1 py-1.5 text-left text-sm text-(--ink) transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-white/40 hover:text-(--accent-ink) hover:shadow-sm active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={onClick}
    >
      <span className="grid w-5.5 shrink-0 place-items-center text-(--ink-muted) [&_svg]:size-4.25">
        {icon}
      </span>
      <strong className="font-medium">{label}</strong>
      {shortcut ? (
        <kbd className="ml-auto min-w-11 rounded border border-(--line-strong) bg-white/50 px-1.5 py-0.5 text-center text-[10px] leading-4 text-(--ink-muted) tabular-nums">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}

function UtilityActions({
  onNavigate,
  onOpenStatus,
  onQuit,
  onRestart,
  updateReady,
  showShortcuts,
}: {
  onNavigate: (view: View) => void;
  onOpenStatus: () => void;
  onQuit: () => void;
  onRestart: () => void;
  updateReady: boolean;
  showShortcuts: boolean;
}) {
  return (
    <div className="flex flex-col gap-0 pt-2">
      <UtilityAction
        icon={<ChartBar />}
        label="Usage dashboard"
        onClick={() => onNavigate("usage")}
      />
      <UtilityAction
        icon={<Pulse />}
        label="Status page"
        onClick={onOpenStatus}
      />
      <Separator className="my-2 h-px w-full bg-(--line)" />
      {updateReady ? (
        <UtilityAction
          icon={<DownloadSimple />}
          label="Update ready, restart now?"
          onClick={onRestart}
        />
      ) : null}
      <UtilityAction
        icon={<ArrowsClockwise />}
        label="Refresh"
        shortcut={showShortcuts ? "Ctrl+R" : undefined}
        onClick={() => window.dispatchEvent(new CustomEvent("cavoti-refresh"))}
      />
      <UtilityAction
        icon={<GearSix />}
        label="Settings..."
        shortcut={showShortcuts ? "Ctrl+," : undefined}
        onClick={() => onNavigate("settings")}
      />
      <UtilityAction
        icon={<Info />}
        label="About Cavoti Bar"
        onClick={() => onNavigate("about")}
      />
      <UtilityAction
        icon={<X />}
        label="Quit"
        shortcut={showShortcuts ? "Ctrl+Q" : undefined}
        onClick={onQuit}
      />
    </div>
  );
}

function DesktopPlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: Subscription;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={`min-w-0 gap-0 cursor-pointer rounded-xl border border-(--line) bg-white/75 p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-(--accent-soft-strong) hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        selected ? "border-accent bg-white" : ""
      } ${plan.quotaState === "limited" ? "border-(--warning) bg-(--warning-soft)" : ""}`}
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <CardHeader className="flex items-start justify-between gap-3 p-0">
        <div className="min-w-0">
          <CardTitle className="m-0 truncate text-xl font-semibold leading-7">
            {plan.name}
          </CardTitle>
          <p className="mt-1 text-xs text-(--ink-muted)">
            Billing: {plan.billingKind}
          </p>
        </div>
        <CardAction className="self-start">
          <Badge
            className="capitalize"
            variant={planVariant(plan.status, plan.quotaState)}
          >
            {plan.status}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="mt-5 flex flex-col gap-4 p-0">
        <UsageMeter
          label="Daily"
          window={plan.usage.fiveHour}
          className="rounded-lg border border-(--line) bg-(--canvas) p-4"
        />
        <UsageMeter
          label="Weekly"
          window={plan.usage.weekly}
          tone="good"
          className="rounded-lg border border-(--line) bg-(--canvas) p-4"
        />
        <UsageMeter
          label="Monthly"
          window={plan.usage.monthly}
          tone="good"
          className="rounded-lg border border-(--line) bg-(--canvas) p-4"
        />
      </CardContent>
      <CardFooter className="mt-5 flex items-center justify-between gap-3 border-t bg-transparent p-0 pt-3 text-xs text-(--ink-muted)">
        <span>
          {plan.expiresAt
            ? `Renews ${date(plan.expiresAt)}`
            : "No renewal date"}
        </span>
        <span className="font-medium text-(--accent-ink)">View details</span>
      </CardFooter>
    </Card>
  );
}

function DesktopOverview({
  snapshot,
  selectedName,
  onSelect,
  onNavigate,
  onOpenStatus,
  onQuit,
  onRestart,
  updateReady,
  refresh,
  showSeconds,
  showShortcuts,
  showRefresh,
}: OverviewProps & {
  selectedName: string | undefined;
  onSelect: (name: string) => void;
  refresh: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full max-w-370 flex-col gap-6 overflow-auto">
      <SourceStrip
        capturedAt={snapshot.capturedAt}
        showSeconds={showSeconds}
        showRefresh={showRefresh}
        onRefresh={refresh}
      />
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_18rem] items-start gap-6">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
                All plans
              </span>
              <h2 className="m-0 text-xl font-semibold leading-7">
                Quota monitor
              </h2>
            </div>
            <Badge variant="outline">
              {snapshot.subscriptions.length} total
            </Badge>
          </div>
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
            {snapshot.subscriptions.map((item) => (
              <DesktopPlanCard
                key={item.name}
                plan={item}
                selected={selectedName === item.name}
                onSelect={() => onSelect(item.name)}
              />
            ))}
          </div>
        </section>
        <aside className="sticky top-0 flex min-w-0 flex-col gap-4">
          <CostSummary
            snapshot={snapshot}
            onOpenUsage={() => onNavigate("usage")}
          />
          <UtilityActions
            onNavigate={onNavigate}
            onOpenStatus={onOpenStatus}
            onQuit={onQuit}
            onRestart={onRestart}
            updateReady={updateReady}
            showShortcuts={showShortcuts}
          />
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
  onRestart,
  updateReady,
  refresh,
  showSeconds,
  showShortcuts,
  showRefresh,
}: OverviewProps & {
  selectedName: string | undefined;
  onSelect: (name: string) => void;
  refresh: () => void;
}) {
  const plan =
    snapshot.subscriptions.find((item) => item.name === selectedName) ??
    snapshot.subscriptions[0];
  return (
    <div className="flex min-h-full flex-col gap-4 overflow-visible">
      <SourceStrip
        capturedAt={snapshot.capturedAt}
        showSeconds={showSeconds}
        showRefresh={showRefresh}
        onRefresh={refresh}
      />
      {snapshot.subscriptions.length < 2 && plan ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="m-0 text-xl font-semibold leading-7">{plan.name}</h2>
          <Badge
            className="capitalize"
            variant={planVariant(plan.status, plan.quotaState)}
          >
            {plan.status}
          </Badge>
        </div>
      ) : null}
      <PlanSelector
        plans={snapshot.subscriptions}
        selected={plan}
        onSelect={onSelect}
      />
      {snapshot.banner ? (
        <SignalNote
          icon={<Lightning weight="fill" />}
          title={snapshot.banner.title}
          message={snapshot.banner.message}
        />
      ) : null}
      {plan ? (
        <section className="rounded-lg border border-(--line) bg-white/70 px-3 py-4 shadow-sm">
          <div className="mb-3">
            <div>
              <span className="block text-xs font-medium text-(--ink-muted)">
                Quota overview
              </span>
              <h2 className="m-0 text-lg font-semibold leading-7">
                {plan.name}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <UsageMeter label="Daily" window={plan.usage.daily} />
            <UsageMeter label="Weekly" window={plan.usage.weekly} tone="good" />
            <UsageMeter
              label="Monthly"
              window={plan.usage.monthly}
              tone="good"
            />
          </div>
        </section>
      ) : (
        <Empty
          title="No active plan"
          message="Cavoti did not return an active subscription for this session."
          onAction={onConnect}
        />
      )}
      <CostSummary
        snapshot={snapshot}
        onOpenUsage={() => onNavigate("usage")}
      />
      <UtilityActions
        onNavigate={onNavigate}
        onOpenStatus={onOpenStatus}
        onQuit={onQuit}
        onRestart={onRestart}
        updateReady={updateReady}
        showShortcuts={showShortcuts}
      />
    </div>
  );
}

export const Overview = memo(function Overview({
  snapshot,
  onNavigate,
  onConnect,
  onOpenStatus,
  onQuit,
  onRestart,
  updateReady,
  showSeconds,
  showShortcuts,
  showRefresh,
}: OverviewProps) {
  const activePlan =
    snapshot.subscriptions.find((item) => item.status === "active") ??
    snapshot.subscriptions[0];
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
      onRestart={onRestart}
      updateReady={updateReady}
      refresh={refresh}
      showSeconds={showSeconds}
      showShortcuts={showShortcuts}
      showRefresh={showRefresh}
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
      onRestart={onRestart}
      updateReady={updateReady}
      refresh={refresh}
      showSeconds={showSeconds}
      showShortcuts={showShortcuts}
      showRefresh={showRefresh}
    />
  );
});
