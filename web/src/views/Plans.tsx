import {
  ArrowSquareOutIcon as ArrowSquareOut,
  TimerIcon as Timer,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope, Subscription } from "../domain/snapshot";
import { date, resetLabel } from "../app/formatters";
import { Badge, Empty, SignalNote, UsageMeter } from "../components/app/shared";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

function PlanCard({ plan }: { plan: Subscription }) {
  const limited = plan.quotaState === "limited";
  return (
    <Card
      className={`min-w-0 gap-0 rounded-xl border p-4 shadow-sm ${
        limited
          ? "border-(--warning) bg-(--warning-soft)"
          : "border-(--line) bg-white/75"
      }`}
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
        <Badge className="capitalize" variant={limited ? "warning" : "success"}>
          {plan.status}
        </Badge>
      </CardHeader>
      <CardContent className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2 p-0">
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
      </CardContent>
      <CardFooter className="mt-4 flex items-center justify-between gap-3 border-t bg-transparent p-0 pt-3 text-xs text-(--ink-muted)">
        <span>
          {plan.expiresAt
            ? `Renews ${date(plan.expiresAt)}`
            : "No renewal date"}
        </span>
        <span className="font-medium text-(--accent-ink)">
          {limited ? "Quota needs attention" : "Within limits"}
        </span>
      </CardFooter>
    </Card>
  );
}

export function Plans({
  snapshot,
  onConnect,
}: {
  snapshot: SnapshotEnvelope;
  onConnect: () => void;
}) {
  return (
    <div className="flex w-full max-w-370 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-xs font-medium text-(--ink-muted)">
            Entitlements
          </span>
          <h1 className="m-0 text-2xl font-semibold leading-8">Plans</h1>
        </div>
        <Button variant="outline" size="sm" onClick={onConnect}>
          Manage on Cavoti <ArrowSquareOut data-icon="inline-end" />
        </Button>
      </div>
      {snapshot.subscriptions.length ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {snapshot.subscriptions.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
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
}
