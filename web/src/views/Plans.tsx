import { useState } from "react";
import { ArrowSquareOutIcon as ArrowSquareOut, TimerIcon as Timer } from "@phosphor-icons/react";
import type { SnapshotEnvelope } from "../domain/snapshot";
import { date, resetLabel } from "../app/formatters";
import { Badge, Empty, TilePager, UsageMeter, useCompactTiles } from "../components/app/shared";
import { Button } from "../components/ui/button";

export function Plans({ snapshot, onConnect }: { snapshot: SnapshotEnvelope; onConnect: () => void }) {
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
