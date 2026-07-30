import { useEffect, useState, type ReactNode } from "react";
import type { ComponentProps } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowsClockwiseIcon as ArrowsClockwise,
  LockKeyOpenIcon as LockKeyOpen,
  StackIcon as Stack,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import {
  usagePercent,
  type Subscription,
  type UsageWindow,
} from "../../domain/snapshot";
import { isCompactViewport } from "../../domain/responsive";
import { relativeAge } from "../../domain/relative-time";
import { Badge as BadgePrimitive } from "../ui/badge";
import { Button } from "../ui/button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  Empty as EmptyPrimitive,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Progress } from "../ui/progress";
import { Skeleton } from "../ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { planVariant, resetLabel, usageAmount } from "../../app/formatters";
import type { BridgeState } from "../../app/types";

export function Badge(props: ComponentProps<typeof BadgePrimitive>) {
  const limited =
    typeof props.children === "string" &&
    props.children.toLowerCase() === "limited";
  return (
    <BadgePrimitive {...props} variant={limited ? "warning" : props.variant} />
  );
}

export function useRelativeAge(
  value: string | null,
  showSeconds: boolean,
): string {
  const [age, setAge] = useState(() =>
    relativeAge(value, Date.now(), showSeconds),
  );
  useEffect(() => {
    const update = () => setAge(relativeAge(value, Date.now(), showSeconds));
    update();
    const timer = window.setInterval(update, showSeconds ? 1000 : 30000);
    return () => window.clearInterval(timer);
  }, [value, showSeconds]);
  return age;
}

export function useCompactTiles(): boolean {
  const [compact, setCompact] = useState(() =>
    isCompactViewport(window.innerWidth, window.innerHeight),
  );
  useEffect(() => {
    const update = () =>
      setCompact(isCompactViewport(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    const query =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 720px)")
        : null;
    query?.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      query?.removeEventListener("change", update);
    };
  }, []);
  return compact;
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
    <div className="flex min-h-14 items-center gap-2 border-b border-(--line) px-1 py-3 text-(--ink-muted) group-data-[layout=wide]/app:min-h-16 group-data-[layout=wide]/app:rounded-xl group-data-[layout=wide]/app:border group-data-[layout=wide]/app:bg-white/70 group-data-[layout=wide]/app:px-5 group-data-[layout=wide]/app:py-4">
      <span className="text-xs font-medium group-data-[layout=wide]/app:text-sm">
        {age}
      </span>
      <Button
        className="ml-auto text-(--ink-muted) group-data-[layout=wide]/app:size-10"
        variant="ghost"
        size="icon"
        aria-label="Refresh usage data"
        onClick={onRefresh}
      >
        <ArrowsClockwise weight="bold" />
      </Button>
    </div>
  );
}

export function PlanSelector({
  plans,
  selected,
  onSelect,
}: {
  plans: Subscription[];
  selected: Subscription | undefined;
  onSelect: (name: string) => void;
}) {
  const compact = useCompactTiles();
  if (plans.length < 2) return null;
  if (compact) {
    return (
      <Select value={selected?.name ?? ""} onValueChange={onSelect}>
        <SelectTrigger className="h-12 w-full px-3 text-base" aria-label="Plan">
          <SelectValue placeholder="Select plan" />
        </SelectTrigger>
        <SelectContent>
          {plans.map((plan) => (
            <SelectItem value={plan.name} key={plan.name}>
              <span className="font-medium">{plan.name}</span>
              <span className="ml-2 text-xs text-(--ink-muted)">
                {plan.status}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Tabs
      value={selected?.name ?? ""}
      onValueChange={onSelect}
      className="flex h-auto w-full min-w-0 rounded-lg border border-(--line) bg-white/45 p-1"
      aria-label="Plans"
    >
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1 bg-transparent p-0">
        {plans.map((plan) => {
          const windows = [
            { label: "5 hour", value: plan.usage.fiveHour },
            { label: "Weekly", value: plan.usage.weekly },
            { label: "Monthly", value: plan.usage.monthly },
          ];
          return (
            <TabsTrigger
              type="button"
              value={plan.name}
              key={plan.name}
              className={`grid min-h-20 min-w-0 w-full flex-none grid-cols-[1rem_minmax(0,1fr)] grid-rows-[auto_auto_auto] items-center justify-items-start gap-x-2 gap-y-0 overflow-hidden rounded-md px-2 py-2 text-left ${
                plan.quotaState === "limited"
                  ? "border-[color-mix(in_srgb,var(--warning)_36%,transparent)] bg-(--warning-soft)"
                  : ""
              }`}
              title={`${plan.name}: ${plan.billingKind}, ${plan.status}`}
            >
              <Stack
                className="row-span-2 mb-0 size-4 text-accent"
                weight={selected?.name === plan.name ? "fill" : "regular"}
              />
              <div className="flex min-w-0 max-w-full items-center gap-2">
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold leading-5">
                  {plan.name}
                </span>
                <Badge
                  className="shrink-0 text-[10px] capitalize"
                  variant={planVariant(plan.status, plan.quotaState)}
                >
                  {plan.status}
                </Badge>
              </div>
              <small className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-4 text-(--ink-muted)">
                Billing: {plan.billingKind}
              </small>
              <div
                className="col-start-2 flex w-full min-w-0 gap-0.5 pt-0.5"
                title={`${plan.name} quota usage`}
              >
                {windows.map(({ label, value }) => {
                  const percent = value.configured ? usagePercent(value) : 0;
                  const tone =
                    percent >= 100
                      ? "bg-[var(--bad)]"
                      : percent >= 75
                        ? "bg-[var(--warning)]"
                        : "bg-[var(--good)]";
                  return (
                    <span
                      className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-black/10"
                      key={label}
                      title={`${label}: ${value.configured ? `${percent}% used` : "not configured"}`}
                    >
                      <span
                        className={`block h-full rounded-full ${tone}`}
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                  );
                })}
              </div>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export function UsageMeter({
  label,
  window,
  tone = "accent",
  className = "",
}: {
  label: string;
  window: UsageWindow;
  tone?: "accent" | "good";
  className?: string;
}) {
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
    urgency === "critical" || urgency === "exhausted"
      ? "critical"
      : urgency === "warning"
        ? "warning"
        : tone;
  const urgencyClass =
    urgency === "exhausted"
      ? "rounded-md border border-(--bad) bg-(--bad-soft) p-2"
      : "";
  const valueClass =
    urgency === "warning"
      ? "text-[var(--warning)]"
      : urgency === "critical" || urgency === "exhausted"
        ? "text-[var(--bad)]"
        : "text-[var(--accent-ink)]";
  return (
    <div className={`min-w-0 ${urgencyClass} ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span>{displayLabel}</span>
        <strong className={`font-semibold tabular-nums ${valueClass}`}>
          {configured
            ? urgency === "exhausted"
              ? "Exhausted"
              : `${percent.toFixed(1)}% used`
            : "Not configured"}
        </strong>
      </div>
      <Progress value={percent} tone={progressTone} />
      <div className="mt-1 grid grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] items-start gap-2 text-[10px] leading-3.5 text-(--ink-muted) [&_span]:min-w-0 [&_span]:wrap-anywhere [&_span:last-child]:text-right">
        {configured ? (
          <>
            <span>
              {usageAmount(window.used, window.unit)} of{" "}
              {usageAmount(window.limit, window.unit)}
            </span>
            <span>{resetLabel(window.resetAt)}</span>
          </>
        ) : (
          <span className="col-span-2 text-center">No quota configured</span>
        )}
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
    <EmptyPrimitive
      className={`flex min-h-36 w-full flex-col items-center justify-center gap-2 p-3 text-center ${compact ? "min-h-22" : ""}`}
    >
      <EmptyHeader className="flex max-w-sm flex-col items-center gap-1">
        <EmptyMedia
          className="mb-1 size-8 bg-transparent opacity-50"
          variant="default"
        >
          <img
            className="size-8 object-contain"
            src="./cavoti-logo.png"
            alt=""
          />
        </EmptyMedia>
        <EmptyTitle className="text-xs font-medium tracking-normal">
          {title}
        </EmptyTitle>
        <EmptyDescription className="max-w-57.5 text-[10px] leading-3.5 text-(--ink-muted)">
          {message}
        </EmptyDescription>
      </EmptyHeader>
      {onAction ? (
        <EmptyContent className="flex w-full max-w-sm flex-col items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onAction}>
            Connect Cavoti <ArrowSquareOut data-icon="inline-end" />
          </Button>
        </EmptyContent>
      ) : null}
    </EmptyPrimitive>
  );
}

export function SignalNote({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <Alert className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] border-l-[3px] border-l-accent bg-(--accent-soft) px-2.5 py-2 text-left text-(--accent-ink) [&>svg]:size-4.25">
      {icon}
      <div>
        <AlertTitle className="text-[10px] font-semibold">{title}</AlertTitle>
        <AlertDescription className="mt-0.5 text-[9px] text-(--ink-muted)">
          {message}
        </AlertDescription>
      </div>
    </Alert>
  );
}

export function Loading() {
  return (
    <div
      className="flex min-h-full flex-col gap-3"
      aria-busy="true"
      role="status"
      aria-label="Loading Cavoti snapshot"
    >
      <span className="sr-only">Loading Cavoti snapshot</span>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-36" />
        </div>
        <Skeleton className="size-8" />
      </div>
      <Skeleton className="h-14 w-full" />
      <section className="flex min-h-40 flex-col gap-4 rounded-lg border border-(--line) bg-white/70 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-28" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </section>
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.15fr_.85fr]">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}

export function Boundary({
  state,
  onConnect,
}: {
  state: BridgeState;
  onConnect: () => void;
}) {
  const copy =
    state === "offline"
      ? [
          "Cavoti is offline",
          "The authenticated profile could not reach Cavoti. Try again when the site is available.",
        ]
      : state === "error"
        ? [
            "The bridge needs attention",
            "The local host could not produce a safe snapshot.",
          ]
        : [
            "Live session required",
            "Sign in through the Cavoti connection window.",
          ];
  return (
    <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center">
      <div className="text-2xl text-(--warning)">
        {state === "auth-required" ? <LockKeyOpen /> : <WarningCircle />}
      </div>
      <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-(--ink-faint)">
        {state === "auth-required" ? "Authentication" : "Connection"}
      </span>
      <h2 className="my-1.5 text-lg font-semibold">{copy[0]}</h2>
      <p className="mb-3 max-w-62.5 text-[10px] leading-3.5 text-(--ink-muted)">
        {copy[1]}
      </p>
      <Button onClick={onConnect}>
        {state === "auth-required" ? "Connect Cavoti" : "Try again"}{" "}
        <ArrowSquareOut data-icon="inline-end" />
      </Button>
    </div>
  );
}
