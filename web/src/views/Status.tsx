import { useState } from "react";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  CheckCircleIcon as CheckCircle,
  InfoIcon as Info,
  PulseIcon as Pulse,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope } from "../domain/snapshot";
import { date, monitorVariant } from "../app/formatters";
import type { BridgeState } from "../app/types";
import { Badge, Empty, TilePager, useCompactTiles } from "../components/app/shared";
import { Button } from "../components/ui/button";

function MonitorRows({ monitors }: { monitors: SnapshotEnvelope["channelMonitors"] }) {
  return monitors.length ? (
    <div className="monitor-list">
      {monitors.map((monitor) => (
        <div className="monitor-row" key={`${monitor.provider}-${monitor.name}`}>
          <div>
            <strong>{monitor.name}</strong>
            <small>
              {monitor.provider}
              {monitor.model ? ` | ${monitor.model}` : ""}
            </small>
          </div>
          <div className="monitor-metrics">
            <Badge variant={monitorVariant(monitor.status)}>{monitor.status}</Badge>
            <span>{monitor.latencyMs === null ? "No latency" : `${Math.round(monitor.latencyMs)} ms`}</span>
            <span>{monitor.availability7d === null ? "-" : `${monitor.availability7d.toFixed(1)}% / 7d`}</span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="No channel monitors" message="Cavoti did not return channel health data." compact />
  );
}

function CheckRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="check-row">
      <span className={good ? "check-dot good" : "check-dot"}>{good ? <CheckCircle weight="fill" /> : <Info weight="regular" />}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Status({
  snapshot,
  state,
  onConnect,
  onOpenStatus = () => window.dispatchEvent(new CustomEvent("cavoti-open-status")),
}: {
  snapshot?: SnapshotEnvelope;
  state: BridgeState;
  onConnect: () => void;
  onOpenStatus?: () => void;
}) {
  const monitors = snapshot?.channelMonitors ?? [];
  const healthy = monitors.length > 0 && monitors.every((monitor) => monitor.status === "operational");
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  const pageCount = monitors.length + 1;
  const safePage = Math.min(page, pageCount - 1);
  if (!compact)
    return (
      <div className="view-stack wide-status">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Connection monitor</span>
            <h1>Status</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenStatus}>
            Open monitor <ArrowSquareOut data-icon="inline-end" />
          </Button>
        </div>
        <div className="status-summary">
          <div className="status-orb">{state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}</div>
          <div>
            <span className="eyebrow">Cavoti channels</span>
            <h2>{healthy ? "All channels operational" : "Channel attention needed"}</h2>
            <p>
              {monitors.length} channels reported. Last received {date(snapshot?.capturedAt ?? null)}.
            </p>
          </div>
        </div>
        <MonitorRows monitors={monitors} />
      </div>
    );
  return (
    <div className="view-stack tile-stack">
      <div className="tile-page">
        <div className="view-heading">
          <div>
            <span className="eyebrow">Connection monitor</span>
            <h1>Status</h1>
          </div>
          <div className="tile-heading-actions">
            <Button variant="outline" size="sm" onClick={onOpenStatus}>
              Open monitor <ArrowSquareOut data-icon="inline-end" />
            </Button>
            <TilePager page={safePage} count={pageCount} onChange={setPage} label="Status screen" />
          </div>
        </div>
        {safePage === 0 ? (
          <>
            <div className="status-summary">
              <div className="status-orb">
                {state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
              </div>
              <div>
                <span className="eyebrow">Cavoti channels</span>
                <h2>{state === "live" ? (healthy ? "All channels operational" : "Channel attention needed") : "No live snapshot yet"}</h2>
                <p>
                  {state === "live"
                    ? `${monitors.length} channels reported. Last received ${date(snapshot?.capturedAt ?? null)}.`
                    : "The overlay only receives sanitized aggregate JSON from the authenticated browser profile."}
                </p>
              </div>
            </div>
            {snapshot ? (
              <div className="check-list">
                <CheckRow label="Account record" value={snapshot.account.status} good />
                <CheckRow
                  label="Plan records"
                  value={`${snapshot.subscriptions.length} returned`}
                  good={snapshot.subscriptions.length > 0}
                />
                <CheckRow
                  label="Usage aggregates"
                  value={`${snapshot.models.length} models | ${snapshot.stats.endpoints.length} endpoints`}
                  good={snapshot.models.length > 0}
                />
              </div>
            ) : (
              <Empty
                title="Live session required"
                message="Sign in through the Cavoti connection window to populate this view."
                onAction={onConnect}
              />
            )}
          </>
        ) : (
          <section className="surface-section monitor-tile">
            <div className="section-top">
              <div>
                <span className="eyebrow">Channel {safePage}</span>
                <h2>{monitors[safePage - 1]?.name ?? "Unknown channel"}</h2>
              </div>
              <Pulse className="section-icon" />
            </div>
            <MonitorRows monitors={monitors.slice(safePage - 1, safePage)} />
          </section>
        )}
        <TilePager page={safePage} count={pageCount} onChange={setPage} label="Status screen" />
        {snapshot?.announcements.length ? (
          <div className="signal-note">
            <Info />
            <div>
              <strong>{snapshot.announcements[0].title}</strong>
              <span>{snapshot.announcements[0].message}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
