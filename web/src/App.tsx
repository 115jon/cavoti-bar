import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { normalizeSnapshot, type SnapshotEnvelope, type UsageFilters as UsageFilterState } from "./domain/snapshot";
import type { AppProps, BridgeState, View } from "./app/types";
import { parseHostMessage } from "./bridge/protocol";
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
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(60);
  const [showFreshnessSeconds, setShowFreshnessSeconds] = useState(false);
  const compact = useCompactTiles();
  const hasSnapshot = useRef(false);
  const connect = () => bridge.post({ action: "connect" });
  const refresh = useCallback(() => bridge.post({ action: "refresh" }), [bridge]);
  const openStatus = useCallback(() => bridge.post({ action: "open-status" }), [bridge]);
  const setWindowTopmost = (enabled: boolean) => {
    setTopmost(enabled);
    bridge.post({ action: "setting", value: { name: "topmost", enabled } });
  };
  const setRefreshInterval = (seconds: number) => {
    setRefreshIntervalSeconds(seconds);
    bridge.post({ action: "setting", value: { name: "refresh-interval", seconds } });
  };
  const setFreshnessSeconds = (enabled: boolean) => {
    setShowFreshnessSeconds(enabled);
    bridge.post({ action: "setting", value: { name: "freshness-seconds", enabled } });
  };

  useEffect(() => {
    const unsubscribe = bridge.subscribe((raw) => {
      const message = parseHostMessage(raw);
      if (!message) return;
      if (message.type === "snapshot") {
        const next = normalizeSnapshot(message.snapshot);
        if (next) {
          hasSnapshot.current = true;
          setSnapshot(next);
          setState("live");
          if (message.settings) {
            setTopmost(message.settings.topmost);
            setMaximized(message.settings.maximized);
            setRefreshIntervalSeconds(message.settings.refreshIntervalSeconds);
            setShowFreshnessSeconds(message.settings.showFreshnessSeconds);
          }
        }
      } else if (message.type === "settings") {
        setTopmost(message.settings.topmost);
        setMaximized(message.settings.maximized);
        setRefreshIntervalSeconds(message.settings.refreshIntervalSeconds);
        setShowFreshnessSeconds(message.settings.showFreshnessSeconds);
      } else if (message.state !== "loading" || !hasSnapshot.current) setState(message.state);
    });
    bridge.post({ action: "bootstrap" });
    const usageRefresh = (event: Event) =>
      bridge.post({ action: "refresh", value: { filters: (event as CustomEvent<UsageFilterState>).detail } });
    window.addEventListener("cavoti-refresh", refresh);
    window.addEventListener("cavoti-open-status", openStatus);
    window.addEventListener("cavoti-usage-refresh", usageRefresh);
    return () => {
      unsubscribe();
      window.removeEventListener("cavoti-refresh", refresh);
      window.removeEventListener("cavoti-open-status", openStatus);
      window.removeEventListener("cavoti-usage-refresh", usageRefresh);
    };
  }, [bridge, openStatus, refresh]);

  const title = useMemo(() => (view === "about" ? "About" : (views.find((item) => item.id === view)?.label ?? "Overview")), [view]);
  const beginDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    bridge.post({ action: "drag" });
  };

  return (
    <AppShell
      compact={compact}
      view={view}
      title={title}
      state={state}
      maximized={maximized}
      onViewChange={setView}
      onBeginDrag={beginDrag}
      onMaximize={() => bridge.post({ action: "maximize" })}
      onMinimize={() => bridge.post({ action: "minimize" })}
      onClose={() => bridge.post({ action: "close" })}
    >
      {state === "loading" ? (
        <Loading />
      ) : state !== "live" || !snapshot ? (
        <Boundary state={state} onConnect={connect} />
      ) : view === "overview" ? (
        <Overview
          snapshot={snapshot}
          onNavigate={setView}
          onConnect={connect}
          onOpenStatus={openStatus}
          onQuit={() => bridge.post({ action: "close" })}
          showSeconds={showFreshnessSeconds}
        />
      ) : view === "usage" ? (
        <Usage snapshot={snapshot} />
      ) : view === "plans" ? (
        <Plans snapshot={snapshot} onConnect={connect} />
      ) : view === "status" ? (
        <Status snapshot={snapshot} state={state} onConnect={connect} />
      ) : view === "about" ? (
        <About />
      ) : (
        <Settings
          topmost={topmost}
          onTopmost={setWindowTopmost}
          onClear={() => bridge.post({ action: "clear" })}
          onConnect={connect}
          refreshIntervalSeconds={refreshIntervalSeconds}
          onRefreshInterval={setRefreshInterval}
          showFreshnessSeconds={showFreshnessSeconds}
          onShowFreshnessSeconds={setFreshnessSeconds}
        />
      )}
    </AppShell>
  );
}
