import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  LockKeyOpenIcon as LockKeyOpen,
  StackIcon as Stack,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { usagePercent, type Subscription, type UsageWindow } from "../../domain/snapshot";
import { isCompactViewport } from "../../domain/responsive";
import { relativeAge } from "../../domain/relative-time";
import { Badge as BadgePrimitive } from "../ui/badge";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Skeleton } from "../ui/skeleton";
import { usageAmount, resetLabel } from "../../app/formatters";
import type { BridgeState } from "../../app/types";

export function Badge(props: ComponentProps<typeof BadgePrimitive>) {
  const limited = typeof props.children === "string" && props.children.toLowerCase() === "limited";
  return <BadgePrimitive {...props} variant={limited ? "warning" : props.variant} />;
}

export function useRelativeAge(value: string | null, showSeconds: boolean): string {
  const [age, setAge] = useState(() => relativeAge(value, Date.now(), showSeconds));
  useEffect(() => {
    const update = () => setAge(relativeAge(value, Date.now(), showSeconds));
    update();
    const timer = window.setInterval(update, showSeconds ? 1000 : 30000);
    return () => window.clearInterval(timer);
  }, [value, showSeconds]);
  return age;
}

export function useCompactTiles(): boolean {
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

export function TilePager({
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

export function SourceStrip({
  capturedAt,
  showSeconds,
  onRefresh,
}: {
  capturedAt: string | null;
  showSeconds: boolean;
  onRefresh: () => void;
}) {
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

export function PlanTabs({
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

export function UsageMeter({ label, window, tone = "accent" }: { label: string; window: UsageWindow; tone?: "accent" | "good" }) {
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

export function Empty({
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

export function Loading() {
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

export function Boundary({ state, onConnect }: { state: BridgeState; onConnect: () => void }) {
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
