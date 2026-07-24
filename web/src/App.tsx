import { useEffect, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { ArrowSquareOut, ArrowsClockwise, ChartBar, CheckCircle, GearSix, House, Info, Key, Lightning, LockKeyOpen, Minus, Pulse, Stack, Timer, UsersThree, WarningCircle, X } from "@phosphor-icons/react";
import { normalizeSnapshot, type SnapshotEnvelope, type Subscription, type UsageUnit, type UsageWindow, usagePercent } from "./domain/snapshot";
import type { HostBridge } from "./bridge/host";
import { parseHostMessage } from "./bridge/protocol";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { Skeleton } from "./components/ui/skeleton";
import { Switch } from "./components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";

type View = "overview" | "usage" | "plans" | "status" | "settings" | "about";
type BridgeState = "loading" | "auth-required" | "offline" | "error" | "live";
type AppProps = { bridge: HostBridge };
type ActionProps = { icon: ReactNode; label: string; onClick: () => void };

const views: Array<{ id: Exclude<View, "about">; label: string; icon: typeof House }> = [
  { id: "overview", label: "Overview", icon: House },
  { id: "usage", label: "Usage", icon: ChartBar },
  { id: "plans", label: "Plans", icon: Stack },
  { id: "status", label: "Status", icon: Pulse },
  { id: "settings", label: "Settings", icon: GearSix },
];

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const integer = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
const tokens = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(2).replace(/\.00$/, "")}B` : value >= 1e6 ? `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1).replace(/\.0$/, "")}K` : integer(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "Not provided";
const usageAmount = (value: number, unit: UsageUnit) => unit === "points" ? `${quantity(value)} pts` : money(value);

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

function SourceStrip({ capturedAt, onRefresh }: { capturedAt: string | null; onRefresh: () => void }) {
  return <div className="source-strip live"><span className="source-mark"><CheckCircle weight="fill" /></span><div><strong>Live Cavoti session</strong><span>Updated {date(capturedAt)}</span></div><Button variant="ghost" size="icon" aria-label="Refresh snapshot" onClick={onRefresh}><ArrowsClockwise weight="bold" /></Button></div>;
}

function PlanTabs({ plans, selected, onSelect }: { plans: Subscription[]; selected: Subscription | undefined; onSelect: (name: string) => void }) {
  if (plans.length < 2) return null;
  return <div className="plan-tabs" role="tablist" aria-label="Plans">{plans.map((plan) => <button key={plan.name} role="tab" aria-selected={selected?.name === plan.name} className={selected?.name === plan.name ? "active" : ""} onClick={() => onSelect(plan.name)}><Stack weight={selected?.name === plan.name ? "fill" : "regular"} /><span>{plan.name}</span><small>{plan.billingKind}</small></button>)}</div>;
}

function UsageMeter({ label, window, tone = "accent" }: { label: string; window: UsageWindow; tone?: "accent" | "good" }) {
  const percent = usagePercent(window);
  return <div className="usage-meter"><div className="meter-label"><span>{label}</span><strong>{percent.toFixed(1)}% used</strong></div><Progress value={percent} tone={tone} /><div className="meter-meta"><span>{usageAmount(window.used, window.unit)} of {usageAmount(window.limit, window.unit)}</span><span>{resetLabel(window.resetAt)}</span></div></div>;
}

function CostSummary({ snapshot }: { snapshot: SnapshotEnvelope }) {
  const today = snapshot.dailyTrend[snapshot.dailyTrend.length - 1] ?? { actualCost: 0, tokens: 0 };
  return <section className="utility-section cost-section"><div className="section-top"><div><span className="eyebrow">Spend and volume</span><h2>Cost</h2></div><ArrowSquareOut className="section-icon" /></div><p>Today: {money(today.actualCost)} | {tokens(today.tokens)} tokens</p><p>Last 30 days: {money(snapshot.stats.actualCost)} | {tokens(snapshot.stats.totalTokens)} tokens</p></section>;
}

function UtilityAction({ icon, label, onClick }: ActionProps) {
  return <button className="utility-action" onClick={onClick}><span>{icon}</span><strong>{label}</strong><ArrowSquareOut className="utility-action-arrow" /></button>;
}

function UtilityActions({ onConnect, onNavigate, onOpenStatus, onQuit }: { onConnect: () => void; onNavigate: (view: View) => void; onOpenStatus: () => void; onQuit: () => void }) {
  return <div className="utility-actions"><UtilityAction icon={<Key />} label="Add account..." onClick={onConnect} /><UtilityAction icon={<ChartBar />} label="Usage dashboard" onClick={() => onNavigate("usage")} /><UtilityAction icon={<Pulse />} label="Status page" onClick={onOpenStatus} /><div className="utility-divider" /><UtilityAction icon={<GearSix />} label="Settings..." onClick={() => onNavigate("settings")} /><UtilityAction icon={<Info />} label="About Cavoti Bar" onClick={() => onNavigate("about")} /><UtilityAction icon={<X />} label="Quit" onClick={onQuit} /></div>;
}

function Overview({ snapshot, onNavigate, onConnect, onOpenStatus, onQuit }: { snapshot: SnapshotEnvelope; onNavigate: (view: View) => void; onConnect: () => void; onOpenStatus: () => void; onQuit: () => void }) {
  const activePlan = snapshot.subscriptions.find((item) => item.status === "active") ?? snapshot.subscriptions[0];
  const [selectedName, setSelectedName] = useState(activePlan?.name);
  const plan = snapshot.subscriptions.find((item) => item.name === selectedName) ?? activePlan;
  const refresh = () => window.dispatchEvent(new CustomEvent("cavoti-refresh"));
  return <div className="view-stack compact-overview"><SourceStrip capturedAt={snapshot.capturedAt} onRefresh={refresh} /><PlanTabs plans={snapshot.subscriptions} selected={plan} onSelect={setSelectedName} />{snapshot.banner ? <div className="signal-note"><Lightning weight="fill" /><div><strong>{snapshot.banner.title}</strong><span>{snapshot.banner.message}</span></div></div> : null}{plan ? <section className="primary-usage"><div className="section-top"><div><h1>{plan.name}</h1><span className="plan-subtitle">{plan.billingKind}</span></div><Badge variant="success">{plan.status}</Badge></div><div className="usage-columns"><UsageMeter label="Daily" window={plan.usage.daily} /><UsageMeter label="Weekly" window={plan.usage.weekly} tone="good" /><UsageMeter label="Monthly" window={plan.usage.monthly} tone="good" /></div></section> : <Empty title="No active plan" message="Cavoti did not return an active subscription for this session." onAction={onConnect} />}<CostSummary snapshot={snapshot} /><UtilityActions onConnect={onConnect} onNavigate={onNavigate} onOpenStatus={onOpenStatus} onQuit={onQuit} /></div>;
}

function StatRail({ snapshot }: { snapshot: SnapshotEnvelope }) {
  return <div className="stat-rail"><div><span>Requests</span><strong>{integer(snapshot.stats.requests)}</strong></div><div><span>Total tokens</span><strong>{tokens(snapshot.stats.totalTokens)}</strong></div><div><span>Actual cost</span><strong>{money(snapshot.stats.actualCost)}</strong></div></div>;
}

function ModelRows({ rows }: { rows: Array<{ name: string; requests: number; tokens: number; actualCost: number }> }) {
  return rows.length ? <div className="model-rows">{rows.map((row) => <div className="model-row" key={row.name}><span><i className="model-dot" />{row.name}</span><strong>{money(row.actualCost)}</strong></div>)}</div> : <Empty title="No model detail" message="The connected session returned no model breakdown." compact />;
}

function DataRows({ rows, empty }: { rows: Array<{ name: string; requests: number; tokens: number; actualCost: number }>; empty: string }) {
  return rows.length ? <div className="data-rows">{rows.map((row) => <div className="data-row" key={row.name}><span className="row-name">{row.name}</span><span>{integer(row.requests)} req</span><span>{tokens(row.tokens)}</span><strong>{money(row.actualCost)}</strong></div>)}</div> : <Empty title="No rows" message={empty} compact />;
}

function Usage({ snapshot }: { snapshot: SnapshotEnvelope }) {
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">Usage dashboard</span><h1>Usage</h1></div><Badge variant="outline">30 day range</Badge></div><StatRail snapshot={snapshot} /><div className="surface-section"><div className="section-top"><div><span className="eyebrow">By endpoint</span><h2>Cost centers</h2></div><span className="muted-label">actual cost</span></div><DataRows rows={snapshot.stats.endpoints} empty="No endpoint data returned." /></div><div className="surface-section"><div className="section-top"><div><span className="eyebrow">By group</span><h2>Billing groups</h2></div><UsersThree className="section-icon" /></div><DataRows rows={snapshot.groups} empty="No group data returned." /></div><div className="surface-section"><div className="section-top"><div><span className="eyebrow">Top models</span><h2>Model spend</h2></div><ChartBar className="section-icon" /></div><ModelRows rows={snapshot.models.slice(0, 8)} /></div></div>;
}

function Plans({ snapshot, onConnect }: { snapshot: SnapshotEnvelope; onConnect: () => void }) {
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">Entitlements</span><h1>Plans</h1></div><Button variant="outline" size="sm" onClick={onConnect}>Manage on Cavoti <ArrowSquareOut data-icon="inline-end" /></Button></div>{snapshot.subscriptions.length ? <div className="plan-list">{snapshot.subscriptions.map((plan, index) => <section className={`plan-row ${index === 0 ? "featured" : ""}`} key={`${plan.name}-${index}`}><div className="plan-head"><div><Badge variant={plan.status === "active" ? "success" : "outline"}>{plan.status}</Badge><h2>{plan.name}</h2><span className="plan-subtitle">{plan.billingKind}</span></div><span className="plan-index">{String(index + 1).padStart(2, "0")}</span></div><div className="plan-meters"><UsageMeter label="Daily" window={plan.usage.daily} /><UsageMeter label="Weekly" window={plan.usage.weekly} tone="good" /><UsageMeter label="Monthly" window={plan.usage.monthly} tone="good" /></div><div className="plan-foot"><span>Renews {date(plan.expiresAt)}</span><span>{plan.usage.daily.unit === "points" ? "Points" : "USD"}</span></div></section>)}</div> : <Empty title="No plan records" message="Connect Cavoti to read your current entitlements." onAction={onConnect} />}{snapshot.quotaResetCards.length ? <div className="signal-note"><Timer /><div><strong>Quota resets</strong><span>{snapshot.quotaResetCards.map((card) => `${card.label}${card.resetAt ? ` | ${resetLabel(card.resetAt)}` : ""}`).join(" | ")}</span></div></div> : null}</div>;
}

function monitorVariant(status: string): "success" | "warning" | "outline" {
  return status === "operational" ? "success" : status === "degraded" || status === "outage" ? "warning" : "outline";
}

function MonitorRows({ monitors }: { monitors: SnapshotEnvelope["channelMonitors"] }) {
  return monitors.length ? <div className="monitor-list">{monitors.map((monitor) => <div className="monitor-row" key={`${monitor.provider}-${monitor.name}`}><div><strong>{monitor.name}</strong><small>{monitor.provider}{monitor.model ? ` | ${monitor.model}` : ""}</small></div><div className="monitor-metrics"><Badge variant={monitorVariant(monitor.status)}>{monitor.status}</Badge><span>{monitor.latencyMs === null ? "No latency" : `${Math.round(monitor.latencyMs)} ms`}</span><span>{monitor.availability7d === null ? "-" : `${monitor.availability7d.toFixed(1)}% / 7d`}</span></div></div>)}</div> : <Empty title="No channel monitors" message="Cavoti did not return channel health data." compact />;
}

function Status({ snapshot, state, onConnect, onOpenStatus = () => window.dispatchEvent(new CustomEvent("cavoti-open-status")) }: { snapshot?: SnapshotEnvelope; state: BridgeState; onConnect: () => void; onOpenStatus?: () => void }) {
  const monitors = snapshot?.channelMonitors ?? [];
  const healthy = monitors.length > 0 && monitors.every((monitor) => monitor.status === "operational");
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">Connection monitor</span><h1>Status</h1></div><Button variant="outline" size="sm" onClick={onOpenStatus}>Open monitor <ArrowSquareOut data-icon="inline-end" /></Button></div><div className="status-summary"><div className="status-orb">{state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}</div><div><span className="eyebrow">Cavoti channels</span><h2>{state === "live" ? healthy ? "All channels operational" : "Channel attention needed" : "No live snapshot yet"}</h2><p>{state === "live" ? `${monitors.length} channels reported. Last received ${date(snapshot?.capturedAt ?? null)}.` : "The overlay only receives sanitized aggregate JSON from the authenticated browser profile."}</p></div></div>{snapshot ? <><div className="check-list"><CheckRow label="Account record" value={snapshot.account.status} good /><CheckRow label="Plan records" value={`${snapshot.subscriptions.length} returned`} good={snapshot.subscriptions.length > 0} /><CheckRow label="Usage aggregates" value={`${snapshot.models.length} models | ${snapshot.stats.endpoints.length} endpoints`} good={snapshot.models.length > 0} /></div><MonitorRows monitors={monitors} /></> : <Empty title="Live session required" message="Sign in through the Cavoti connection window to populate this view." onAction={onConnect} />}{snapshot?.announcements.length ? <div className="signal-note"><Info /><div><strong>{snapshot.announcements[0].title}</strong><span>{snapshot.announcements[0].message}</span></div></div> : null}</div>;
}

function CheckRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="check-row"><span className={good ? "check-dot good" : "check-dot"}>{good ? <CheckCircle weight="fill" /> : <Info weight="regular" />}</span><span>{label}</span><strong>{value}</strong></div>;
}

function Settings({ topmost, onTopmost, onClear, onConnect }: { topmost: boolean; onTopmost: (value: boolean) => void; onClear: () => void; onConnect: () => void }) {
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">Application</span><h1>Settings</h1></div><Badge variant="outline">Local</Badge></div><section className="surface-section settings-section"><span className="eyebrow">Window behavior</span><div className="setting-row"><div><strong>Keep on top</strong><small>Keep the popover above other windows.</small></div><Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" /></div><div className="setting-row"><div><strong>Connection profile</strong><small>Session cookies stay inside the WebView2 profile.</small></div><Button variant="outline" size="sm" onClick={onConnect}>Open sign in</Button></div></section><section className="surface-section settings-section"><span className="eyebrow">Privacy boundary</span><div className="privacy-note"><Key /><div><strong>Credentials never reach this UI</strong><small>Only normalized usage, plan, and account status data are forwarded.</small></div></div><Button variant="ghost" size="sm" onClick={onClear}>Clear local preferences</Button></section></div>;
}

function About() {
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">About</span><h1>Cavoti Bar</h1></div><Badge variant="outline">Baseline</Badge></div><section className="surface-section about-section"><img src="./cavoti-logo.png" alt="" /><div><h2>Private usage at a glance</h2><p>Cavoti Bar reads aggregate plan and usage data through an authenticated Cavoti browser profile. Credentials never enter the renderer.</p></div><div className="about-meta"><span>Built for Cavoti</span><span>Local WebView2 session</span></div></section></div>;
}

function Empty({ title, message, onAction, compact = false }: { title: string; message: string; onAction?: () => void; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><img src="./cavoti-logo.png" alt="" /><div><strong>{title}</strong><p>{message}</p>{onAction ? <Button size="sm" variant="secondary" onClick={onAction}>Connect Cavoti <ArrowSquareOut data-icon="inline-end" /></Button> : null}</div></div>;
}

export function App({ bridge }: AppProps) {
  const [state, setState] = useState<BridgeState>("loading");
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope>();
  const [view, setView] = useState<View>("overview");
  const [topmost, setTopmost] = useState(false);
  const connect = () => bridge.post({ action: "connect" });
  const refresh = () => bridge.post({ action: "refresh" });
  const openStatus = () => bridge.post({ action: "open-status" });
  const setWindowTopmost = (enabled: boolean) => { setTopmost(enabled); bridge.post({ action: "setting", value: { name: "topmost", enabled } }); };

  useEffect(() => {
    const unsubscribe = bridge.subscribe((raw) => {
      const message = parseHostMessage(raw);
      if (!message) return;
      if (message.type === "snapshot") {
        const next = normalizeSnapshot(message.snapshot);
        if (next) { setSnapshot(next); setState("live"); if (message.settings) setTopmost(message.settings.topmost); }
      } else if (message.type === "settings") setTopmost(message.settings.topmost);
      else setState(message.state);
    });
    bridge.post({ action: "bootstrap" });
    window.addEventListener("cavoti-refresh", refresh);
    window.addEventListener("cavoti-open-status", openStatus);
    return () => { unsubscribe(); window.removeEventListener("cavoti-refresh", refresh); window.removeEventListener("cavoti-open-status", openStatus); };
  }, [bridge]);

  const title = useMemo(() => view === "about" ? "About" : views.find((item) => item.id === view)?.label ?? "Overview", [view]);
  const beginDrag = (event: MouseEvent<HTMLElement>) => { if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return; bridge.post({ action: "drag" }); };

  return <TooltipProvider delayDuration={300}><div className="app-shell"><header className="titlebar" data-drag-region onMouseDown={beginDrag}><button className="brand-button" onClick={() => setView("overview")}><img src="./favicon.png" alt="Cavoti" /><span><strong>Cavoti</strong><small>{state === "live" ? "live usage" : "session bridge"}</small></span></button><div className="titlebar-status"><span className={`status-dot ${state === "live" ? "good" : "warning"}`} />{state === "live" ? "Connected" : "Not connected"}</div><div className="window-actions"><Button variant="ghost" size="icon" aria-label="Minimize window" onClick={() => bridge.post({ action: "minimize" })}><Minus /></Button><Button variant="ghost" size="icon" aria-label="Close window" onClick={() => bridge.post({ action: "close" })}><X /></Button></div></header><div className="shell-body"><nav className="nav-rail" aria-label="Primary navigation" role="tablist">{views.map(({ id, label, icon: Icon }) => <Tooltip key={id}><TooltipTrigger asChild><button role="tab" className={`nav-button ${view === id ? "active" : ""}`} aria-label={label} aria-selected={view === id} onClick={() => setView(id)}><Icon weight={view === id ? "fill" : "regular"} /></button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>)}<div className="nav-spacer" /><Tooltip><TooltipTrigger asChild><button className="avatar-button" aria-label="Account settings" onClick={() => setView("settings")}>C</button></TooltipTrigger><TooltipContent>Account settings</TooltipContent></Tooltip></nav><main className="content" aria-live="polite"><div className="mobile-heading"><span>{title}</span><span className="mobile-state">{state}</span></div>{state === "loading" ? <Loading /> : state !== "live" || !snapshot ? <Boundary state={state} onConnect={connect} /> : view === "overview" ? <Overview snapshot={snapshot} onNavigate={setView} onConnect={connect} onOpenStatus={openStatus} onQuit={() => bridge.post({ action: "close" })} /> : view === "usage" ? <Usage snapshot={snapshot} /> : view === "plans" ? <Plans snapshot={snapshot} onConnect={connect} /> : view === "status" ? <Status snapshot={snapshot} state={state} onConnect={connect} /> : view === "about" ? <About /> : <Settings topmost={topmost} onTopmost={setWindowTopmost} onClear={() => bridge.post({ action: "clear" })} onConnect={connect} />}</main></div></div></TooltipProvider>;
}

function Loading() {
  return <div className="view-stack loading-stack" aria-busy="true" aria-label="Loading Cavoti snapshot"><span className="sr-only">Loading Cavoti snapshot</span><div className="view-heading loading-heading"><div><Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-7 w-36" /></div><Skeleton className="size-8" /></div><Skeleton className="h-14 w-full" /><section className="primary-usage loading-surface"><div className="section-top"><div><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-6 w-28" /></div><Skeleton className="h-5 w-16" /></div><div className="usage-columns"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div></section><Skeleton className="h-16 w-full" /><div className="split-grid"><Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" /></div></div>;
}

function Boundary({ state, onConnect }: { state: BridgeState; onConnect: () => void }) {
  const copy = state === "offline" ? ["Cavoti is offline", "The authenticated profile could not reach Cavoti. Try again when the site is available."] : state === "error" ? ["The bridge needs attention", "The local host could not produce a safe snapshot."] : ["Live session required", "Sign in through the Cavoti connection window."];
  return <div className="boundary"><div className="boundary-icon">{state === "auth-required" ? <LockKeyOpen /> : <WarningCircle />}</div><span className="eyebrow">{state === "auth-required" ? "Authentication" : "Connection"}</span><h2>{copy[0]}</h2><p>{copy[1]}</p><Button onClick={onConnect}>{state === "auth-required" ? "Connect Cavoti" : "Try again"} <ArrowSquareOut data-icon="inline-end" /></Button></div>;
}
