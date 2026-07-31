import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowsClockwiseIcon as ArrowsClockwise,
  CheckCircleIcon as CheckCircle,
  InfoIcon as Info,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { memo, useState } from "react";
import type { SnapshotEnvelope } from "../domain/snapshot";
import {
  modelBrand,
  modelFamily,
  modelFamilyTone,
  modelLogoUrl,
} from "../domain/model-logos";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "../components/ui/drawer";
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
  onSelect,
}: {
  monitors: SnapshotEnvelope["channelMonitors"];
  compact: boolean;
  onSelect: (monitor: SnapshotEnvelope["channelMonitors"][number]) => void;
}) {
  if (!monitors.length) return null;
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {monitors.map((monitor) => (
          <button
            type="button"
            className="rounded-lg border border-(--line) bg-white/70 p-3 text-left"
            key={`${monitor.provider}-${monitor.name}`}
            onClick={() => onSelect(monitor)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <MonitorLogo monitor={monitor} />
                  <strong className="block truncate text-sm font-semibold">
                    {monitor.name}
                  </strong>
                  <span
                    className={`shrink-0 rounded-md border px-1 py-0.5 text-[9px] font-medium ${modelFamilyTone(modelFamily(monitor.model || monitor.name, monitor.provider))}`}
                  >
                    {modelFamily(
                      monitor.model || monitor.name,
                      monitor.provider,
                    )}
                  </span>
                </div>
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
          </button>
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
              <button
                type="button"
                className="text-left"
                onClick={() => onSelect(monitor)}
              >
                <span className="flex items-center gap-2">
                  <MonitorLogo monitor={monitor} />
                  <strong className="block font-semibold">
                    {monitor.name}
                  </strong>
                  <span
                    className={`rounded-md border px-1 py-0.5 text-[9px] font-medium ${modelFamilyTone(modelFamily(monitor.model || monitor.name, monitor.provider))}`}
                  >
                    {modelFamily(
                      monitor.model || monitor.name,
                      monitor.provider,
                    )}
                  </span>
                </span>
                <small className="mt-0.5 block text-[10px] text-(--ink-muted)">
                  {monitor.provider}
                  {monitor.model ? ` | ${monitor.model}` : ""}
                </small>
              </button>
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

function MonitorLogo({
  monitor,
}: {
  monitor: SnapshotEnvelope["channelMonitors"][number];
}) {
  const src = modelLogoUrl(monitor.model || monitor.name, monitor.provider);
  return src ? (
    <img
      className="size-6 object-contain"
      src={src}
      alt={`${modelBrand(monitor.model, monitor.provider)} logo`}
    />
  ) : (
    <span className="grid size-6 place-items-center rounded-md border border-(--line) text-[9px] font-bold text-(--accent-ink)">
      {modelBrand(monitor.model, monitor.provider).slice(0, 1)}
    </span>
  );
}

function MonitorDrawer({
  monitor,
  open,
  onOpenChange,
}: {
  monitor: SnapshotEnvelope["channelMonitors"][number] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{monitor?.name ?? "Channel details"}</DrawerTitle>
          <DrawerDescription>
            {monitor
              ? `${monitor.provider} | ${monitor.model || "No primary model"}`
              : ""}
          </DrawerDescription>
        </DrawerHeader>
        {monitor ? (
          <div className="grid max-h-[58vh] grid-cols-2 gap-2 overflow-y-auto px-4 text-xs">
            <MonitorMetric label="Status" value={monitor.status} />
            <MonitorMetric
              label="Group"
              value={monitor.groupName || "No group"}
            />
            <MonitorMetric
              label="Primary latency"
              value={
                monitor.latencyMs === null
                  ? "-"
                  : `${Math.round(monitor.latencyMs)} ms`
              }
            />
            <MonitorMetric
              label="Ping latency"
              value={
                monitor.pingLatencyMs == null
                  ? "-"
                  : `${Math.round(monitor.pingLatencyMs)} ms`
              }
            />
            <MonitorMetric
              label="Availability"
              value={
                monitor.availability7d === null
                  ? "-"
                  : `${monitor.availability7d.toFixed(1)}% / 7d`
              }
            />
            <MonitorMetric
              label="Last checked"
              value={monitor.checkedAt ? date(monitor.checkedAt) : "-"}
            />
            <div className="col-span-2 rounded-md border border-(--line) p-2">
              <strong className="block text-xs">Model checks</strong>
              <div className="mt-1 divide-y divide-(--line)">
                {(monitor.extraModels ?? []).map((model) => (
                  <div
                    className="flex items-center justify-between gap-2 py-1 text-[10px]"
                    key={model.name}
                  >
                    <span className="truncate">{model.name}</span>
                    <span className="shrink-0 text-(--ink-muted)">
                      {model.status} |{" "}
                      {model.latencyMs === null
                        ? "-"
                        : `${Math.round(model.latencyMs)} ms`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2 rounded-md border border-(--line) p-2">
              <strong className="block text-xs">Recent timeline</strong>
              <div className="mt-1 divide-y divide-(--line)">
                {(monitor.timeline ?? []).slice(0, 24).map((entry) => (
                  <div
                    className="flex items-center justify-between gap-2 py-1 text-[10px]"
                    key={`${entry.checkedAt}-${entry.status}-${entry.latencyMs}`}
                  >
                    <span>
                      {entry.checkedAt ? date(entry.checkedAt) : "Unknown time"}
                    </span>
                    <span className="text-(--ink-muted)">
                      {entry.status} |{" "}
                      {entry.latencyMs === null
                        ? "-"
                        : `${Math.round(entry.latencyMs)} ms`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <DrawerFooter>
          <DrawerClose asChild>
            <Button className="w-full">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function MonitorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-(--panel) px-2 py-1.5">
      <span className="block text-[10px] text-(--ink-muted)">{label}</span>
      <strong className="block truncate font-semibold">{value}</strong>
    </div>
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

export const Status = memo(function Status({
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
  const [selectedMonitor, setSelectedMonitor] = useState<
    SnapshotEnvelope["channelMonitors"][number] | null
  >(null);
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
      <div className="flex justify-end gap-2">
        {!compact ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh channel status"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("cavoti-refresh"))
            }
          >
            <ArrowsClockwise />
          </Button>
        ) : null}
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
      <MonitorRows
        monitors={monitors}
        compact={compact}
        onSelect={setSelectedMonitor}
      />
      <MonitorDrawer
        monitor={selectedMonitor}
        open={selectedMonitor !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedMonitor(null);
        }}
      />
      {snapshot?.announcements.length ? (
        <SignalNote
          icon={<Info />}
          title={snapshot.announcements[0].title}
          message={snapshot.announcements[0].message}
        />
      ) : null}
    </div>
  );
});
