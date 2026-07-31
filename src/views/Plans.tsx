import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowsClockwiseIcon as ArrowsClockwise,
  CaretDownIcon as CaretDown,
  TimerIcon as Timer,
} from "@phosphor-icons/react";
import { memo, useState } from "react";
import { useCompactTiles } from "../components/app/shared";
import type { SnapshotEnvelope, Subscription } from "../domain/snapshot";
import { date, planVariant, resetLabel } from "../app/formatters";
import { Badge, Empty, SignalNote, UsageMeter } from "../components/app/shared";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "../components/ui/card";
function PlanIdentity({ plan }: { plan: Subscription }) {
  return (
    <div className="min-w-0">
      <h2 className="m-0 truncate text-xl font-semibold leading-7">
        {plan.name}
      </h2>
      <p className="mt-1 text-xs text-(--ink-muted)">
        Billing: {plan.billingKind}
      </p>
    </div>
  );
}

function PlanMeters({ plan }: { plan: Subscription }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
      <UsageMeter
        label="5 hour"
        window={plan.usage.fiveHour}
        className="rounded-lg border border-(--line) bg-(--canvas) p-3"
      />
      <UsageMeter
        label="Weekly"
        window={plan.usage.weekly}
        tone="good"
        className="rounded-lg border border-(--line) bg-(--canvas) p-3"
      />
      <UsageMeter
        label="Monthly"
        window={plan.usage.monthly}
        tone="good"
        className="rounded-lg border border-(--line) bg-(--canvas) p-3"
      />
    </div>
  );
}

function PlanFooter({ plan }: { plan: Subscription }) {
  return (
    <div className="flex w-full items-center justify-between gap-3 border-t bg-transparent pt-3 text-xs text-(--ink-muted)">
      <span>
        {plan.expiresAt ? `Renews ${date(plan.expiresAt)}` : "No renewal date"}
      </span>
      <span className="font-medium text-(--accent-ink)">
        {plan.quotaState === "limited"
          ? "Quota needs attention"
          : "Within limits"}
      </span>
    </div>
  );
}

function PlanCard({
  plan,
  compact,
  initiallyOpen = false,
}: {
  plan: Subscription;
  compact: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const limited = plan.quotaState === "limited";
  if (compact) {
    return (
      <details
        className={`rounded-xl border shadow-sm ${
          limited
            ? "border-(--warning) bg-(--warning-soft)"
            : "border-(--line) bg-white/75"
        }`}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <PlanIdentity plan={plan} />
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              className="capitalize"
              variant={planVariant(plan.status, plan.quotaState)}
            >
              {plan.status}
            </Badge>
            <CaretDown className="size-4 text-(--ink-muted)" />
          </div>
        </summary>
        <div className="flex flex-col gap-3 border-t border-inherit p-3">
          <PlanMeters plan={plan} />
          <PlanFooter plan={plan} />
        </div>
      </details>
    );
  }
  return (
    <Card
      className={`min-w-0 gap-0 rounded-xl border p-4 shadow-sm ${
        limited
          ? "border-(--warning) bg-(--warning-soft)"
          : "border-(--line) bg-white/75"
      }`}
    >
      <CardHeader className="flex items-start justify-between gap-3 p-0">
        <PlanIdentity plan={plan} />
        <Badge
          className="capitalize"
          variant={planVariant(plan.status, plan.quotaState)}
        >
          {plan.status}
        </Badge>
      </CardHeader>
      <CardContent className="mt-4 p-0">
        <PlanMeters plan={plan} />
      </CardContent>
      <CardFooter className="mt-4 p-0">
        <PlanFooter plan={plan} />
      </CardFooter>
    </Card>
  );
}

export const Plans = memo(function Plans({
  snapshot,
  onConnect,
}: {
  snapshot: SnapshotEnvelope;
  onConnect: () => void;
}) {
  const compact = useCompactTiles();
  return (
    <div className="flex w-full max-w-370 flex-col gap-4">
      <div className="flex justify-end gap-2">
        {!compact ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh plans"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("cavoti-refresh"))
            }
          >
            <ArrowsClockwise />
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onConnect}>
          Manage on Cavoti <ArrowSquareOut data-icon="inline-end" />
        </Button>
      </div>
      {snapshot.subscriptions.length ? (
        <div
          className={
            compact
              ? "flex flex-col gap-2"
              : "grid grid-cols-1 gap-3 xl:grid-cols-2"
          }
        >
          {snapshot.subscriptions.map((plan, index) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              compact={compact}
              initiallyOpen={index === 0}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="No plan records"
          message="Connect Cavoti to read your current entitlements."
          onAction={onConnect}
        />
      )}
      {snapshot.quotaResetCards.length ? (
        <SignalNote
          icon={<Timer />}
          title="Quota resets"
          message={snapshot.quotaResetCards
            .map(
              (card) =>
                `${card.label}${card.resetAt ? ` | ${resetLabel(card.resetAt)}` : ""}`,
            )
            .join(" | ")}
        />
      ) : null}
    </div>
  );
});
