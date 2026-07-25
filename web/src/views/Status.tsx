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
import { Badge, Empty, SignalNote, TilePager, useCompactTiles } from "../components/app/shared";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

function MonitorRows({ monitors }: { monitors: SnapshotEnvelope["channelMonitors"] }) {
  return monitors.length ? (
    <Table className="w-full border-t border-[var(--line)] text-[10px]">
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Latency</TableHead>
          <TableHead className="text-right">Availability</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {monitors.map((monitor) => (
          <TableRow key={`${monitor.provider}-${monitor.name}`}>
            <TableCell>
              <strong className="block font-semibold">{monitor.name}</strong>
              <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">
                {monitor.provider}
                {monitor.model ? ` | ${monitor.model}` : ""}
              </small>
            </TableCell>
            <TableCell>
              <Badge variant={monitorVariant(monitor.status)}>{monitor.status}</Badge>
            </TableCell>
            <TableCell>{monitor.latencyMs === null ? "No latency" : `${Math.round(monitor.latencyMs)} ms`}</TableCell>
            <TableCell className="text-right">
              {monitor.availability7d === null ? "-" : `${monitor.availability7d.toFixed(1)}% / 7d`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ) : (
    <Empty title="No channel monitors" message="Cavoti did not return channel health data." compact />
  );
}

function CheckRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 border-b border-[var(--line)] text-[10px] last:border-b-0">
      <span className={good ? "text-[var(--good)]" : "text-[var(--warning)]"}>
        {good ? <CheckCircle weight="fill" /> : <Info weight="regular" />}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <strong className="font-medium text-[var(--ink-muted)]">{value}</strong>
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
      <div className="flex w-full max-w-[1480px] flex-col gap-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Connection monitor</span>
            <h1 className="m-0 text-3xl font-semibold leading-9 tracking-tight">Status</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenStatus}>
            Open monitor <ArrowSquareOut data-icon="inline-end" />
          </Button>
        </div>
        <Card className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
          <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[var(--good-soft)] text-[22px] text-[var(--good)]">
            {state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Cavoti channels</span>
            <CardTitle className="m-0 text-sm font-bold leading-[18px]">
              {healthy ? "All channels operational" : "Channel attention needed"}
            </CardTitle>
            <p className="mt-1 max-w-60 text-[10px] leading-[14px] text-[var(--ink-muted)]">
              {monitors.length} channels reported. Last received {date(snapshot?.capturedAt ?? null)}.
            </p>
          </div>
        </Card>
        <MonitorRows monitors={monitors} />
      </div>
    );
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Connection monitor</span>
            <h1 className="m-0 text-2xl font-semibold leading-8 tracking-tight">Status</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onOpenStatus}>
              Open monitor <ArrowSquareOut data-icon="inline-end" />
            </Button>
            <TilePager page={safePage} count={pageCount} onChange={setPage} label="Status screen" />
          </div>
        </div>
        {safePage === 0 ? (
          <>
            <Card className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
              <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[var(--good-soft)] text-[22px] text-[var(--good)]">
                {state === "live" && healthy ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Cavoti channels</span>
                <CardTitle className="m-0 text-sm font-bold leading-[18px]">
                  {state === "live" ? (healthy ? "All channels operational" : "Channel attention needed") : "No live snapshot yet"}
                </CardTitle>
                <p className="mt-1 text-[10px] leading-[14px] text-[var(--ink-muted)]">
                  {state === "live"
                    ? `${monitors.length} channels reported. Last received ${date(snapshot?.capturedAt ?? null)}.`
                    : "The overlay only receives sanitized aggregate JSON from the authenticated browser profile."}
                </p>
              </div>
            </Card>
            {snapshot ? (
              <Card className="gap-0 rounded-xl border border-[var(--line)] bg-white/75 px-3 py-1 shadow-sm">
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
              </Card>
            ) : (
              <Empty
                title="Live session required"
                message="Sign in through the Cavoti connection window to populate this view."
                onAction={onConnect}
              />
            )}
          </>
        ) : (
          <Card className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-0 flex items-start justify-between gap-3 p-0">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Channel {safePage}</span>
                <CardTitle className="text-lg font-semibold leading-7">{monitors[safePage - 1]?.name ?? "Unknown channel"}</CardTitle>
              </div>
              <Pulse className="size-5 text-[var(--accent)]" />
            </CardHeader>
            <CardContent className="min-w-0 flex-1 p-0">
              <MonitorRows monitors={monitors.slice(safePage - 1, safePage)} />
            </CardContent>
          </Card>
        )}
        {snapshot?.announcements.length ? (
          <SignalNote icon={<Info />} title={snapshot.announcements[0].title} message={snapshot.announcements[0].message} />
        ) : null}
      </div>
    </div>
  );
}
