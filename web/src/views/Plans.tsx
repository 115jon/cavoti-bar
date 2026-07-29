import { useState } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  TimerIcon as Timer,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope } from "../domain/snapshot";
import { date, resetLabel } from "../app/formatters";
import {
  Badge,
  Empty,
  SignalNote,
  TilePager,
  UsageMeter,
  useCompactTiles,
} from "../components/app/shared";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

export function Plans({
  snapshot,
  onConnect,
}: {
  snapshot: SnapshotEnvelope;
  onConnect: () => void;
}) {
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const safePage = Math.min(
    page,
    Math.max(snapshot.subscriptions.length - 1, 0),
  );
  const plan = snapshot.subscriptions[safePage];
  if (!compact)
    return (
      <div className="flex w-full max-w-370 flex-col gap-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onConnect}>
            Manage on Cavoti <ArrowSquareOut data-icon="inline-end" />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {snapshot.subscriptions.map((item) => (
            <Card
              className="min-w-0 gap-0 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm"
              key={item.name}
            >
              <CardHeader className="flex items-start justify-between gap-3 p-0">
                <div>
                  <Badge
                    variant={item.status === "active" ? "success" : "outline"}
                  >
                    {item.status}
                  </Badge>
                  <CardTitle className="m-0 text-lg font-semibold leading-7">
                    {item.name}
                  </CardTitle>
                  <span className="mt-0.5 block text-xs leading-4 text-(--ink-muted)">
                    {item.billingKind}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="mt-3 grid grid-cols-3 gap-2 p-0">
                <UsageMeter
                  label="5 hour"
                  window={item.usage.fiveHour}
                  className="rounded-lg border border-(--line) bg-(--canvas) p-4"
                />
                <UsageMeter
                  label="Weekly"
                  window={item.usage.weekly}
                  tone="good"
                  className="rounded-lg border border-(--line) bg-(--canvas) p-4"
                />
                <UsageMeter
                  label="Monthly"
                  window={item.usage.monthly}
                  tone="good"
                  className="rounded-lg border border-(--line) bg-(--canvas) p-4"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-end gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onConnect}>
              Manage on Cavoti <ArrowSquareOut data-icon="inline-end" />
            </Button>
            <TilePager
              page={safePage}
              count={snapshot.subscriptions.length}
              onChange={setPage}
              label="Plan screen"
            />
          </div>
        </div>
        {plan ? (
          <Card className="min-w-0 gap-0 rounded-xl border border-(--line) bg-(--accent-soft) p-3 shadow-sm">
            <CardHeader className="flex items-start justify-between gap-3 p-0">
              <div>
                <Badge
                  variant={plan.status === "active" ? "success" : "outline"}
                >
                  {plan.status}
                </Badge>
                <CardTitle className="m-0 text-lg font-semibold leading-7">
                  {plan.name}
                </CardTitle>
                <span className="mt-0.5 block text-xs leading-4 text-(--ink-muted)">
                  {plan.billingKind}
                </span>
              </div>
              <span className="text-lg tabular-nums text-(--ink-faint)">
                {String(safePage + 1).padStart(2, "0")}
              </span>
            </CardHeader>
            <CardContent className="mt-3 grid grid-cols-1 gap-3 p-0">
              <UsageMeter label="Daily" window={plan.usage.daily} />
              <UsageMeter
                label="Weekly"
                window={plan.usage.weekly}
                tone="good"
              />
              <UsageMeter
                label="Monthly"
                window={plan.usage.monthly}
                tone="good"
              />
            </CardContent>
            <CardFooter className="mt-3 flex items-center justify-between border-t bg-transparent p-0 pt-3 text-xs text-(--ink-muted)">
              <span>Renews {date(plan.expiresAt)}</span>
              <span>
                {plan.usage.daily.unit === "points" ? "Points" : "USD"}
              </span>
            </CardFooter>
          </Card>
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
    </div>
  );
}
