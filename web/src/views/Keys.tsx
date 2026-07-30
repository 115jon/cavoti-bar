import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretDownIcon as CaretDown,
  GaugeIcon as Gauge,
  KeyIcon as Key,
} from "@phosphor-icons/react";
import { memo } from "react";
import type { ApiKey, SnapshotEnvelope } from "../domain/snapshot";
import { groupTone, multiplierTone } from "../domain/model-logos";
import { date, money, resetLabel } from "../app/formatters";
import { Badge, Empty, useCompactTiles } from "../components/app/shared";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Progress } from "../components/ui/progress";

function UsageBar({
  label,
  used,
  limit,
  resetAt,
}: {
  label: string;
  used?: number;
  limit?: number;
  resetAt?: string | null;
}) {
  const hasUsage = typeof used === "number";
  const hasLimit = typeof limit === "number";
  const configured = hasLimit && limit > 0;
  const percent = configured
    ? Math.min(100, Math.max(0, ((used ?? 0) / limit) * 100))
    : 0;
  return (
    <div className="rounded-lg border border-(--line) bg-(--canvas) p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>{label}</span>
        <strong className="tabular-nums">
          {!hasLimit && !hasUsage
            ? "Unavailable"
            : configured
              ? `${percent.toFixed(1)}% used`
              : "Unlimited"}
        </strong>
      </div>
      <Progress
        className="mt-2"
        value={percent}
        tone={percent >= 90 ? "critical" : percent >= 75 ? "warning" : "good"}
      />
      <div className="mt-1 text-[10px] text-(--ink-muted)">
        {!hasLimit && !hasUsage
          ? "No rate data returned"
          : !hasLimit
            ? `${money(used ?? 0)} used | No limit configured`
            : configured
              ? `${money(used ?? 0)} of ${money(limit)}${resetAt ? ` | ${resetLabel(resetAt)}` : ""}`
              : "No limit configured"}
      </div>
    </div>
  );
}

function KeySummary({ item }: { item: ApiKey }) {
  const hasRateData = [
    item.rateLimit5h,
    item.rateLimit1d,
    item.rateLimit7d,
    item.usage5h,
    item.usage1d,
    item.usage7d,
  ].some((value) => typeof value === "number");
  const quotaSummary =
    typeof item.quota !== "number"
      ? "Quota unavailable"
      : item.quota > 0
        ? `${money(item.quotaUsed ?? 0)} / ${money(item.quota)}`
        : `${money(item.quotaUsed ?? 0)} used · no limit`;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-(--line) bg-(--canvas) text-(--accent-ink)">
          <Key />
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-base font-semibold">
            {item.name}
          </strong>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              className={`inline-flex max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${groupTone(item.groupId ?? item.id)}`}
            >
              {item.groupName || "No group"}
            </span>
            <span className="truncate text-[10px] tabular-nums text-(--ink-muted)">
              {quotaSummary}
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasRateData ? (
          <Gauge
            className="size-4 text-(--accent-ink)"
            aria-label="Rate limits present"
          />
        ) : null}
        <Badge variant={item.status === "active" ? "success" : "outline"}>
          {item.status ?? "Unknown"}
        </Badge>
        <CaretDown className="size-4 text-(--ink-muted)" />
      </div>
    </div>
  );
}

function KeyDetails({ item }: { item: ApiKey }) {
  const finiteQuota = typeof item.quota === "number" && item.quota > 0;
  const quotaKnown = typeof item.quota === "number";
  const quotaUsageKnown = typeof item.quotaUsed === "number";
  const quotaLimit = item.quota ?? 0;
  const quotaPercent = finiteQuota
    ? Math.min(100, Math.max(0, ((item.quotaUsed ?? 0) / quotaLimit) * 100))
    : 0;
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
      <div className="rounded-lg border border-(--line) bg-(--canvas) p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span>Quota</span>
          <strong className="tabular-nums">
            {!quotaKnown
              ? "Unavailable"
              : finiteQuota
                ? quotaUsageKnown
                  ? `${quotaPercent.toFixed(1)}% used`
                  : "Usage unavailable"
                : "Unlimited"}
          </strong>
        </div>
        <Progress
          className="mt-2"
          value={quotaPercent}
          tone={
            quotaPercent >= 90
              ? "critical"
              : quotaPercent >= 75
                ? "warning"
                : "good"
          }
        />
        <div className="mt-1 text-[10px] text-(--ink-muted)">
          {!quotaKnown
            ? "No quota data returned"
            : finiteQuota
              ? quotaUsageKnown
                ? `${money(item.quotaUsed ?? 0)} of ${money(item.quota ?? 0)}`
                : "Quota limit returned without usage"
              : `${money(item.quotaUsed ?? 0)} used | No limit configured`}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-(--ink-muted)">
          Rate limits
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <UsageBar
            label="5 hour rate"
            used={item.usage5h}
            limit={item.rateLimit5h}
            resetAt={item.reset5hAt}
          />
          <UsageBar
            label="1 day rate"
            used={item.usage1d}
            limit={item.rateLimit1d}
            resetAt={item.reset1dAt}
          />
          <UsageBar
            label="7 day rate"
            used={item.usage7d}
            limit={item.rateLimit7d}
            resetAt={item.reset7dAt}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-(--ink-muted)">
        <span>
          {item.expiresAt ? `Expires ${date(item.expiresAt)}` : "No expiry"}
        </span>
        {item.rateMultiplier ? (
          <span
            className={`rounded-md border px-1.5 py-0.5 font-medium ${groupTone(item.groupId ?? item.id)}`}
          >
            <span className={multiplierTone(item.rateMultiplier)}>
              {item.rateMultiplier.toFixed(2)}x group rate
            </span>
          </span>
        ) : null}
        {item.rpmLimit ? <span>{item.rpmLimit} RPM</span> : null}
      </div>
    </div>
  );
}

function KeyCard({ item, compact }: { item: ApiKey; compact: boolean }) {
  if (compact) {
    return (
      <details className="rounded-xl border border-(--line) bg-white/75 shadow-sm">
        <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
          <KeySummary item={item} />
        </summary>
        <KeyDetails item={item} />
      </details>
    );
  }
  return (
    <Card className="rounded-xl border border-(--line) bg-white/75 shadow-sm">
      <CardHeader className="p-4">
        <KeySummary item={item} />
      </CardHeader>
      <CardContent className="p-0">
        <KeyDetails item={item} />
      </CardContent>
    </Card>
  );
}

export const Keys = memo(function Keys({
  snapshot,
}: {
  snapshot: SnapshotEnvelope;
}) {
  const compact = useCompactTiles();
  return (
    <div className="flex w-full max-w-370 flex-col gap-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-semibold">API keys</h1>
            <p className="mt-1 text-sm text-(--ink-muted)">
              Key-level quotas when supplied, plus API rate limits and access
              status.
            </p>
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-(--line) text-(--ink-muted) hover:bg-(--canvas)"
            aria-label="Refresh API keys"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("cavoti-refresh"))
            }
          >
            <ArrowsClockwise />
          </button>
        </div>
      </div>
      {snapshot.apiKeys.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {snapshot.apiKeys.map((item) => (
            <KeyCard item={item} compact={compact} key={item.id} />
          ))}
        </div>
      ) : (
        <Empty
          title="No API keys"
          message="Connect Cavoti to read your API keys."
        />
      )}
    </div>
  );
});
