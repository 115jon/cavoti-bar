import { useState } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ChartBarIcon as ChartBar,
  GearSixIcon as GearSix,
  InfoIcon as Info,
  LightningIcon as Lightning,
  PulseIcon as Pulse,
  XIcon as X,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope, Subscription } from "../domain/snapshot";
import { date, money, tokens } from "../app/formatters";
import type { ActionProps, View } from "../app/types";
import { Badge, Empty, PlanTabs, SourceStrip, UsageMeter, useCompactTiles } from "../components/app/shared";

type OverviewProps = {
  snapshot: SnapshotEnvelope;
  onNavigate: (view: View) => void;
  onConnect: () => void;
  onOpenStatus: () => void;
  onQuit: () => void;
  showSeconds: boolean;
};

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

export function Overview({ snapshot, onNavigate, onConnect, onOpenStatus, onQuit, showSeconds }: OverviewProps) {
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
