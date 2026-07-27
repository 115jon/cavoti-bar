import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  normalizeSnapshot,
  type SnapshotEnvelope,
  type UsageFilters as UsageFilterState,
} from "./domain/snapshot";
import type { AppProps, BridgeState, View } from "./app/types";
import {
  DEFAULT_HOST_CAPABILITIES,
  parseHostMessage,
  type HostCapabilities,
} from "./bridge/protocol";
import { AppShell, views } from "./components/app/AppShell";
import { Boundary, Loading, useCompactTiles } from "./components/app/shared";
import { Overview } from "./views/Overview";
import { Usage } from "./views/Usage";
import { Plans } from "./views/Plans";
import { Status } from "./views/Status";
import { Settings } from "./views/Settings";
import { About } from "./views/About";

export function App({ bridge }: AppProps) {
  const [state, setState] = useState<BridgeState>("loading");
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope>();
  const [view, setView] = useState<View>("overview");
  const [topmost, setTopmost] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(60);
  const [showFreshnessSeconds, setShowFreshnessSeconds] = useState(false);
  const [closeToTray, setCloseToTray] = useState(true);
  const [launchAtStartup, setLaunchAtStartup] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [quotaThresholds, setQuotaThresholds] = useState<number[]>([]);
  const [capabilities, setCapabilities] = useState<HostCapabilities>(
    DEFAULT_HOST_CAPABILITIES,
  );
  const [freshnessCapturedAt, setFreshnessCapturedAt] = useState<string | null>(
    null,
  );
  const compact = useCompactTiles();
  const hasSnapshot = useRef(false);
  const foreground = useRef(document.visibilityState !== "hidden");
  const connect = () => bridge.post({ action: "connect" });
  const refresh = useCallback(() => {
    if (foreground.current) bridge.post({ action: "refresh" });
  }, [bridge]);
  const openStatus = useCallback(
    () => bridge.post({ action: "open-status" }),
    [bridge],
  );
  const setWindowTopmost = (enabled: boolean) => {
    setTopmost(enabled);
    bridge.post({ action: "setting", value: { name: "topmost", enabled } });
  };
  const setRefreshInterval = (seconds: number) => {
    setRefreshIntervalSeconds(seconds);
    bridge.post({
      action: "setting",
      value: { name: "refresh-interval", seconds },
    });
  };
  const setFreshnessSeconds = (enabled: boolean) => {
    setShowFreshnessSeconds(enabled);
    bridge.post({
      action: "setting",
      value: { name: "freshness-seconds", enabled },
    });
  };
  const setCloseBehavior = (enabled: boolean) => {
    setCloseToTray(enabled);
    bridge.post({
      action: "setting",
      value: { name: "close-to-tray", enabled },
    });
  };
  const setStartup = (enabled: boolean) => {
    setLaunchAtStartup(enabled);
    bridge.post({
      action: "setting",
      value: { name: "launch-at-startup", enabled },
    });
  };
  const setQuotaAlerts = (thresholds: number[]) => {
    setQuotaThresholds(thresholds);
    bridge.post({
      action: "setting",
      value: { name: "quota-thresholds", thresholds },
    });
  };
  const settingsProps = {
    closeToTray,
    onCloseToTray: setCloseBehavior,
    launchAtStartup,
    onLaunchAtStartup: setStartup,
    startupError,
    onRetryStartup: () => setStartup(true),
    quotaThresholds,
    onQuotaThresholds: setQuotaAlerts,
  };

  useEffect(() => {
    const unsubscribe = bridge.subscribe((raw) => {
      const message = parseHostMessage(raw);
      if (!message) return;
      if (message.type === "capabilities") {
        setCapabilities(message.capabilities);
      } else if (message.type === "lifecycle") {
        foreground.current = message.state === "foreground";
      } else if (message.type === "snapshot") {
        const next = normalizeSnapshot(message.snapshot);
        if (next) {
          hasSnapshot.current = true;
          setSnapshot(next);
          if (message.complete !== false)
            setFreshnessCapturedAt(next.capturedAt);
          setState("live");
          if (message.settings) {
            setTopmost(message.settings.topmost);
            setMaximized(message.settings.maximized);
            setUpdateReady(message.settings.updateReady ?? false);
            setRefreshIntervalSeconds(message.settings.refreshIntervalSeconds);
            setShowFreshnessSeconds(message.settings.showFreshnessSeconds);
            setCloseToTray(message.settings.closeToTray);
            setLaunchAtStartup(message.settings.launchAtStartup);
            setStartupError(message.settings.startupError);
            setQuotaThresholds(message.settings.quotaThresholds);
          }
        }
      } else if (message.type === "settings") {
        setTopmost(message.settings.topmost);
        setMaximized(message.settings.maximized);
        setUpdateReady(message.settings.updateReady ?? false);
        setRefreshIntervalSeconds(message.settings.refreshIntervalSeconds);
        setShowFreshnessSeconds(message.settings.showFreshnessSeconds);
        setCloseToTray(message.settings.closeToTray);
        setLaunchAtStartup(message.settings.launchAtStartup);
        setStartupError(message.settings.startupError);
        setQuotaThresholds(message.settings.quotaThresholds);
      } else if (message.type === "host-navigation") {
        setView(message.target);
      } else if (message.state !== "loading" || !hasSnapshot.current)
        setState(message.state);
    });
    bridge.post({ action: "bootstrap" });
    const usageRefresh = (event: Event) => {
      const detail = (
        event as CustomEvent<
          | UsageFilterState
          | {
              filters: UsageFilterState;
              usagePage?: number;
              errorPage?: number;
            }
        >
      ).detail;
      const value = "filters" in detail ? detail : { filters: detail };
      if (foreground.current) bridge.post({ action: "refresh", value });
    };
    const openIp = (event: Event) => {
      const ip = (event as CustomEvent<string>).detail;
      if (ip) bridge.post({ action: "open-ip", value: { ip } });
    };
    window.addEventListener("cavoti-refresh", refresh);
    window.addEventListener("cavoti-open-status", openStatus);
    window.addEventListener("cavoti-usage-refresh", usageRefresh);
    window.addEventListener("cavoti-open-ip", openIp);
    return () => {
      unsubscribe();
      window.removeEventListener("cavoti-refresh", refresh);
      window.removeEventListener("cavoti-open-status", openStatus);
      window.removeEventListener("cavoti-usage-refresh", usageRefresh);
      window.removeEventListener("cavoti-open-ip", openIp);
    };
  }, [bridge, openStatus, refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const nextForeground = document.visibilityState !== "hidden";
      foreground.current = nextForeground;
      bridge.post({
        action: "lifecycle",
        value: { state: nextForeground ? "foreground" : "paused" },
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [bridge]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
        return;
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        refresh();
      } else if (event.key === ",") {
        event.preventDefault();
        setView("settings");
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault();
        bridge.post({ action: "exit" });
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [bridge, refresh]);

  const title = useMemo(
    () =>
      view === "about"
        ? "About"
        : (views.find((item) => item.id === view)?.label ?? "Overview"),
    [view],
  );
  const displayedSnapshot = snapshot
    ? { ...snapshot, capturedAt: freshnessCapturedAt }
    : snapshot;
  const beginDrag = (event: MouseEvent<HTMLElement>) => {
    if (!capabilities.titlebarControls) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
      return;
    bridge.post({ action: "drag" });
  };

  return (
    <AppShell
      compact={compact}
      view={view}
      title={title}
      state={state}
      capabilities={capabilities}
      maximized={maximized}
      onViewChange={setView}
      onBeginDrag={beginDrag}
      onMaximize={() => bridge.post({ action: "maximize" })}
      onMinimize={() => bridge.post({ action: "minimize" })}
      onClose={() => bridge.post({ action: "close" })}
    >
      {view === "settings" && state === "loading" ? (
        <Settings
          topmost={topmost}
          onTopmost={setWindowTopmost}
          onClear={() => bridge.post({ action: "clear" })}
          onConnect={connect}
          capabilities={capabilities}
          {...settingsProps}
          refreshIntervalSeconds={refreshIntervalSeconds}
          onRefreshInterval={setRefreshInterval}
          showFreshnessSeconds={showFreshnessSeconds}
          onShowFreshnessSeconds={setFreshnessSeconds}
        />
      ) : state === "loading" ? (
        <Loading />
      ) : state !== "live" || !displayedSnapshot ? (
        <Boundary state={state} onConnect={connect} />
      ) : view === "overview" ? (
        <Overview
          snapshot={displayedSnapshot}
          onNavigate={setView}
          onConnect={connect}
          onOpenStatus={openStatus}
          onQuit={() => bridge.post({ action: "exit" })}
          onRestart={() => bridge.post({ action: "restart" })}
          updateReady={updateReady}
          showSeconds={showFreshnessSeconds}
        />
      ) : view === "usage" ? (
        <Usage snapshot={displayedSnapshot} />
      ) : view === "plans" ? (
        <Plans snapshot={displayedSnapshot} onConnect={connect} />
      ) : view === "status" ? (
        <Status
          snapshot={displayedSnapshot}
          state={state}
          onConnect={connect}
        />
      ) : view === "about" ? (
        <About />
      ) : (
        <Settings
          topmost={topmost}
          onTopmost={setWindowTopmost}
          onClear={() => bridge.post({ action: "clear" })}
          onConnect={connect}
          capabilities={capabilities}
          {...settingsProps}
          refreshIntervalSeconds={refreshIntervalSeconds}
          onRefreshInterval={setRefreshInterval}
          showFreshnessSeconds={showFreshnessSeconds}
          onShowFreshnessSeconds={setFreshnessSeconds}
        />
      )}
    </AppShell>
  );
}
