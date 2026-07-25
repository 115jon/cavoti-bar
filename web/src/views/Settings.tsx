import { useState } from "react";
import { KeyIcon as Key } from "@phosphor-icons/react";
import { Badge, TilePager, useCompactTiles } from "../components/app/shared";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";

const refreshOptions = [
  { value: 0, label: "Manual only" },
  { value: 15, label: "Every 15 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
];

function RefreshSettings({
  refreshIntervalSeconds,
  onRefreshInterval,
  showFreshnessSeconds,
  onShowFreshnessSeconds,
}: {
  refreshIntervalSeconds: number;
  onRefreshInterval: (seconds: number) => void;
  showFreshnessSeconds: boolean;
  onShowFreshnessSeconds: (value: boolean) => void;
}) {
  return (
    <div className="contents">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[var(--line)] py-1.5 last:border-b-0">
        <div>
          <strong className="block text-[11px]">Refresh interval</strong>
          <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">Choose how often usage refreshes automatically.</small>
        </div>
        <Select value={String(refreshIntervalSeconds)} onValueChange={(value) => onRefreshInterval(Number(value))}>
          <SelectTrigger size="sm" aria-label="Refresh interval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {refreshOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[var(--line)] py-1.5 last:border-b-0">
        <div>
          <strong className="block text-[11px]">Show seconds</strong>
          <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">Show seconds for recent update timing.</small>
        </div>
        <Switch checked={showFreshnessSeconds} onCheckedChange={onShowFreshnessSeconds} aria-label="Show seconds in freshness" />
      </div>
    </div>
  );
}

export function Settings({
  topmost,
  onTopmost,
  onClear,
  onConnect,
  refreshIntervalSeconds,
  onRefreshInterval,
  showFreshnessSeconds,
  onShowFreshnessSeconds,
}: {
  topmost: boolean;
  onTopmost: (value: boolean) => void;
  onClear: () => void;
  onConnect: () => void;
  refreshIntervalSeconds: number;
  onRefreshInterval: (seconds: number) => void;
  showFreshnessSeconds: boolean;
  onShowFreshnessSeconds: (value: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const compact = useCompactTiles();
  if (!compact)
    return (
      <div className="flex w-full max-w-[1480px] flex-col gap-6">
        <div className="flex items-end justify-between gap-6">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Application</span>
            <h1 className="m-0 text-3xl font-semibold leading-9 tracking-tight">Settings</h1>
          </div>
          <Badge variant="outline">Local</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card className="gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-0 flex-col items-start gap-1 p-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Application</span>
              <CardTitle className="text-lg font-semibold leading-7">Window behavior</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0">
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[var(--line)] py-1.5">
                <div>
                  <strong className="block text-[11px]">Keep on top</strong>
                  <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">Keep the popover above other windows.</small>
                </div>
                <Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" />
              </div>
              <RefreshSettings
                refreshIntervalSeconds={refreshIntervalSeconds}
                onRefreshInterval={onRefreshInterval}
                showFreshnessSeconds={showFreshnessSeconds}
                onShowFreshnessSeconds={onShowFreshnessSeconds}
              />
              <div className="flex min-h-10 items-center justify-between gap-2 py-1.5">
                <div>
                  <strong className="block text-[11px]">Connection profile</strong>
                  <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">
                    Session cookies stay inside the WebView2 profile.
                  </small>
                </div>
                <Button variant="outline" size="sm" onClick={onConnect}>
                  Open sign in
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-0 flex-col items-start gap-1 p-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Privacy boundary</span>
              <CardTitle className="text-lg font-semibold leading-7">Local session</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0">
              <Alert className="flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-white/45 p-2.5 [&>svg]:size-5 [&>svg]:text-[var(--accent)]">
                <Key className="shrink-0" />
                <div>
                  <AlertTitle className="text-xs font-medium">Credentials never reach this UI</AlertTitle>
                  <AlertDescription className="mt-0.5 text-[10px] text-[var(--ink-muted)]">
                    Only normalized usage, plan, and account status data are forwarded.
                  </AlertDescription>
                </div>
              </Alert>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear local preferences
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Application</span>
            <h1 className="m-0 text-2xl font-semibold leading-8 tracking-tight">Settings</h1>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline">Local</Badge>
            <TilePager page={page} count={2} onChange={setPage} label="Settings screen" />
          </div>
        </div>
        {page === 0 ? (
          <Card className="gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-0 flex-col items-start gap-1 p-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Application</span>
              <CardTitle className="text-lg font-semibold leading-7">Window behavior</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0">
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[var(--line)] py-1.5">
                <div>
                  <strong className="block text-[11px]">Keep on top</strong>
                  <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">Keep the popover above other windows.</small>
                </div>
                <Switch checked={topmost} onCheckedChange={onTopmost} aria-label="Keep on top" />
              </div>
              <RefreshSettings
                refreshIntervalSeconds={refreshIntervalSeconds}
                onRefreshInterval={onRefreshInterval}
                showFreshnessSeconds={showFreshnessSeconds}
                onShowFreshnessSeconds={onShowFreshnessSeconds}
              />
              <div className="flex min-h-10 items-center justify-between gap-2 py-1.5">
                <div>
                  <strong className="block text-[11px]">Connection profile</strong>
                  <small className="mt-0.5 block text-[10px] text-[var(--ink-muted)]">
                    Session cookies stay inside the WebView2 profile.
                  </small>
                </div>
                <Button variant="outline" size="sm" onClick={onConnect}>
                  Open sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
            <CardHeader className="mb-0 flex-col items-start gap-1 p-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">Privacy boundary</span>
              <CardTitle className="text-lg font-semibold leading-7">Local session</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-0">
              <Alert className="flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-white/45 p-2.5 [&>svg]:size-5 [&>svg]:text-[var(--accent)]">
                <Key className="shrink-0" />
                <div>
                  <AlertTitle className="text-xs font-medium">Credentials never reach this UI</AlertTitle>
                  <AlertDescription className="mt-0.5 text-[10px] text-[var(--ink-muted)]">
                    Only normalized usage, plan, and account status data are forwarded.
                  </AlertDescription>
                </div>
              </Alert>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear local preferences
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
