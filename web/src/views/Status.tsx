import {
  ArrowSquareOutIcon as ArrowSquareOut,
  CheckCircleIcon as CheckCircle,
  InfoIcon as Info,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { SnapshotEnvelope } from "../domain/snapshot";
import { date, monitorVariant } from "../app/formatters";
import type { BridgeState } from "../app/types";
import {
  Badge,
  Empty,
  SignalNote,
  useCompactTiles,
} from "../components/app/shared";
import { Button } from "../components/ui/button";
import { Card, CardTitle } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

function MonitorRows({
  monitors,
  compact,
}: {
  monitors: SnapshotEnvelope["channelMonitors"];
  compact: boolean;
}) {
  if (!monitors.length) return null;
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {monitors.map((monitor) => (
          <article
            className="rounded-lg border border-(--line) bg-white/70 p-3"
            key={`${monitor.provider}-${monitor.name}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold">
                  {monitor.name}
                </strong>
                <small className="mt-0.5 block truncate text-[10px] text-(--ink-muted)">
                  {monitor.provider}
                  {monitor.model ? ` | ${monitor.model}` : ""}
                </small>
              </div>
              <Badge
                className="capitalize"
                variant={monitorVariant(monitor.status)}
              >
                {monitor.status}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="block text-[10px] text-(--ink-muted)">
                  Latency
                </span>
                <strong>
                  {monitor.latencyMs === null
                    ? "No latency"
                    : `${Math.round(monitor.latencyMs)} ms`}
                </strong>
              </div>
              <div className="text-right">
                <span className="block text-[10px] text-(--ink-muted)">
                  Availability
                </span>
                <strong>
                  {monitor.availability7d === null
                    ? "-"
                    : `${monitor.availability7d.toFixed(1)}% / 7d`}
                </strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <Table className="w-full border-t border-(--line) text-[10px]">
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
              <small className="mt-0.5 block text-[10px] text-(--ink-muted)">
                {monitor.provider}
                {monitor.model ? ` | ${monitor.model}` : ""}
              </small>
            </TableCell>
            <TableCell>
              <Badge
                className="capitalize"
                variant={monitorVariant(monitor.status)}
              >
                {monitor.status}
              </Badge>
            </TableCell>
            <TableCell>
              {monitor.latencyMs === null
                ? "No latency"
                : `${Math.round(monitor.latencyMs)} ms`}
            </TableCell>
            <TableCell className="text-right">
              {monitor.availability7d === null
                ? "-"
                : `${monitor.availability7d.toFixed(1)}% / 7d`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CheckRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good: boolean;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 border-b border-(--line) text-[10px] last:border-b-0">
      <span className={good ? "text-(--good)" : "text-(--warning)"}>
        {good ? <CheckCircle weight="fill" /> : <Info weight="regular" />}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <strong className="font-medium text-(--ink-muted)">{value}</strong>
    </div>
  );
}

export function Status({
  snapshot,
  state,
  onConnect,
  onOpenStatus = () =>
    window.dispatchEvent(new CustomEvent("cavoti-open-status")),
}: {
  snapshot?: SnapshotEnvelope;
  state: BridgeState;
  onConnect: () => void;
  onOpenStatus?: () => void;
}) {
  const compact = useCompactTiles();
  const monitors = snapshot?.channelMonitors ?? [];
  const healthy =
    monitors.length > 0 &&
    monitors.every((monitor) => monitor.status === "operational");
  const channelState =
    state !== "live"
      ? "no-live"
      : monitors.length === 0
        ? "no-data"
        : healthy
          ? "healthy"
          : "attention";
  const channelTitle =
    channelState === "healthy"
      ? "All channels operational"
      : channelState === "attention"
        ? "Channel attention needed"
        : channelState === "no-data"
          ? "No channel data"
          : "No live snapshot yet";
  const channelMessage =
    channelState === "no-live"
      ? "The monitor receives sanitized aggregate data from the authenticated browser profile."
      : channelState === "no-data"
        ? "Cavoti did not return channel health data."
        : `${monitors.length} channels reported. Last received ${date(snapshot?.capturedAt ?? null)}.`;
  const accountGood = ["active", "operational", "healthy"].includes(
    snapshot?.account.status.toLowerCase() ?? "",
  );

  return (
    <div className="flex w-full max-w-370 flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onOpenStatus}>
          Open monitor <ArrowSquareOut data-icon="inline-end" />
        </Button>
      </div>
      <Card className="flex items-center gap-3 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
        <div
          className={`grid size-10.5 shrink-0 place-items-center rounded-full text-[22px] ${channelState === "healthy" ? "bg-(--good-soft) text-(--good)" : "bg-(--warning-soft) text-(--warning)"}`}
        >
          {channelState === "healthy" ? (
            <CheckCircle weight="fill" />
          ) : (
            <WarningCircle weight="fill" />
          )}
        </div>
        <div className="min-w-0">
          <CardTitle className="m-0 text-sm font-semibold leading-4.5">
            {channelTitle}
          </CardTitle>
          <p className="mt-1 max-w-80 text-[10px] leading-3.5 text-(--ink-muted)">
            {channelMessage}
          </p>
        </div>
      </Card>
      {snapshot ? (
        <Card className="gap-0 rounded-xl border border-(--line) bg-white/75 px-3 py-1 shadow-sm">
          <CheckRow
            label="Account record"
            value={snapshot.account.status}
            good={accountGood}
          />
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
      <MonitorRows monitors={monitors} compact={compact} />
      {snapshot?.announcements.length ? (
        <SignalNote
          icon={<Info />}
          title={snapshot.announcements[0].title}
          message={snapshot.announcements[0].message}
        />
      ) : null}
    </div>
  );
}
