import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  createChannel,
  Importance,
  Visibility,
} from "@tauri-apps/plugin-notification";
import {
  normalizeSnapshot,
  type SnapshotEnvelope,
  type UsageFilters as UsageFilterState,
} from "./domain/snapshot";
import { defaultUsageFilterState } from "./app/formatters";
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
import { Pricing } from "./views/Pricing";
import { Keys } from "./views/Keys";
import { Status } from "./views/Status";
import { Settings } from "./views/Settings";
import { About } from "./views/About";

type NativeRefreshWindow = Window & {
  CavotiNativeRefresh?: {
    complete?: () => void;
    setGestureLocked?: (locked: boolean) => void;
    setEnabled?: (enabled: boolean) => void;
    setCanChildScrollUp?: (canScrollUp: boolean) => void;
  };
};

type UsageRefreshScope = "full" | "usage" | "activity";
type UsageRefreshRequest = {
  filters: UsageFilterState;
  usagePage: number;
  errorPage: number;
  scope: UsageRefreshScope;
};

function isUsageFilters(value: unknown): value is UsageFilterState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { startDate?: unknown; endDate?: unknown };
  return (
    typeof candidate.startDate === "string" &&
    typeof candidate.endDate === "string"
  );
}

function completeNativeRefresh() {
  (window as NativeRefreshWindow).CavotiNativeRefresh?.complete?.();
}

function setNativeRefreshEnabled(enabled: boolean) {
  (window as NativeRefreshWindow).CavotiNativeRefresh?.setEnabled?.(enabled);
}

function setNativeRefreshGestureLocked(locked: boolean) {
  (window as NativeRefreshWindow).CavotiNativeRefresh?.setGestureLocked?.(
    locked,
  );
}

function probeScopeForView(view: View) {
  if (
    view === "overview" ||
    view === "usage" ||
    view === "plans" ||
    view === "status" ||
    view === "pricing" ||
    view === "keys"
  ) {
    return view === "pricing" || view === "keys" ? "plans" : view;
  }
  return null;
}

export function App({ bridge }: AppProps) {
  const [state, setState] = useState<BridgeState>("loading");
  const [snapshot, setSnapshot] = useState<SnapshotEnvelope>();
  const [backgroundSnapshot, setBackgroundSnapshot] =
    useState<
      Pick<SnapshotEnvelope, "subscriptions" | "quotaResetCards" | "capturedAt">
    >();
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
  const [, setRefreshing] = useState(false);
  const compact = useCompactTiles();
  const hasSnapshot = useRef(false);
  const loadedScopes = useRef(new Set<string>());
  const currentState = useRef(state);
  const currentView = useRef(view);
  currentState.current = state;
  currentView.current = view;
  const foreground = useRef(document.visibilityState !== "hidden");
  const latestUsageRequest = useRef<UsageRefreshRequest>({
    filters: defaultUsageFilterState(),
    usagePage: 1,
    errorPage: 1,
    scope: "usage",
  });
  const connect = useCallback(
    () => bridge.post({ action: "connect" }),
    [bridge],
  );
  const quit = useCallback(() => bridge.post({ action: "exit" }), [bridge]);
  const restart = useCallback(
    () => bridge.post({ action: updateReady ? "install-update" : "restart" }),
    [bridge, updateReady],
  );
  const refresh = useCallback(
    (scope: string = "full", request?: UsageRefreshRequest) => {
      if (!foreground.current) return;
      setRefreshing(true);
      bridge.post({
        action: "refresh",
        value: request ? { ...request, scope } : { scope },
      });
    },
    [bridge],
  );
  const changeView = useCallback(
    (next: View) => {
      setView(next);
      const scope = probeScopeForView(next);
      if (scope && !loadedScopes.current.has(scope)) {
        bridge.post({ action: "view", value: { scope } });
      }
    },
    [bridge],
  );
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
      if (!message) {
        console.warn("[cavoti-host] dropped host message");
        return;
      }
      if (message.type === "capabilities") {
        setCapabilities(message.capabilities);
      } else if (message.type === "lifecycle") {
        foreground.current = message.state === "foreground";
      } else if (message.type === "snapshot") {
        const next = normalizeSnapshot(message.snapshot);
        if (next) {
          const isBackground = message.scope === "background";
          if (!isBackground && message.complete !== false) {
            if (!message.scope || message.scope === "full") {
              loadedScopes.current.add("overview");
              loadedScopes.current.add("usage");
              loadedScopes.current.add("plans");
              loadedScopes.current.add("status");
            } else {
              loadedScopes.current.add(message.scope);
            }
            if (
              !message.scope ||
              message.scope === "full" ||
              message.scope === "plans"
            ) {
              setBackgroundSnapshot(undefined);
            }
          }
          const hadSnapshot = hasSnapshot.current;
          bridge.post({
            action: "snapshot-received",
            value: { complete: message.complete },
          });
          hasSnapshot.current = true;
          if (isBackground) {
            setBackgroundSnapshot({
              subscriptions: next.subscriptions,
              quotaResetCards: next.quotaResetCards,
              capturedAt: next.capturedAt,
            });
            setRefreshing(false);
            completeNativeRefresh();
            return;
          }
          setSnapshot((previous) =>
            isBackground && previous
              ? {
                  ...previous,
                  subscriptions: next.subscriptions,
                  quotaResetCards: next.quotaResetCards,
                }
              : next,
          );
          if (message.complete !== false) {
            setFreshnessCapturedAt(next.capturedAt);
            setRefreshing(false);
            completeNativeRefresh();
            setState("live");
          } else if (!hadSnapshot) {
            setState("loading");
          }
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
        } else {
          bridge.post({ action: "snapshot-rejected" });
          console.error("[cavoti-host] rejected snapshot");
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
      } else {
        if (message.state !== "loading" || !hasSnapshot.current) {
          setState(message.state);
        }
        if (message.state === "error" || message.state === "offline") {
          setRefreshing(false);
          completeNativeRefresh();
        }
      }
    });
    const nativeRefresh = () => {
      if (!hasSnapshot.current || currentState.current !== "live") {
        completeNativeRefresh();
        return;
      }
      if (currentView.current === "usage") {
        refresh("usage", latestUsageRequest.current);
        return;
      }
      refresh(probeScopeForView(currentView.current) ?? "full");
    };
    bridge.post({ action: "bootstrap" });
    const usageRefresh = (event: Event) => {
      const detail = (
        event as CustomEvent<
          | UsageFilterState
          | {
              filters: UsageFilterState;
              usagePage?: number;
              errorPage?: number;
              scope?: "full" | "usage" | "activity";
            }
        >
      ).detail;
      const value = "filters" in detail ? detail : { filters: detail };
      console.info("[cavoti-usage] refresh requested", {
        startDate: value.filters.startDate,
        endDate: value.filters.endDate,
        usagePage: "usagePage" in value ? value.usagePage : 1,
        errorPage: "errorPage" in value ? value.errorPage : 1,
        scope: "scope" in value ? value.scope : "full",
      });
      if (isUsageFilters(value.filters)) {
        latestUsageRequest.current = {
          filters: value.filters,
          usagePage:
            "usagePage" in value && typeof value.usagePage === "number"
              ? value.usagePage
              : 1,
          errorPage:
            "errorPage" in value && typeof value.errorPage === "number"
              ? value.errorPage
              : 1,
          scope:
            "scope" in value &&
            (value.scope === "usage" || value.scope === "activity")
              ? value.scope
              : "full",
        };
      }
      if (foreground.current) {
        setRefreshing(true);
        bridge.post({ action: "refresh", value });
      }
    };
    const openIp = (event: Event) => {
      const ip = (event as CustomEvent<string>).detail;
      if (ip) bridge.post({ action: "open-ip", value: { ip } });
    };
    window.addEventListener("cavoti-refresh", nativeRefresh);
    window.addEventListener("cavoti-open-status", openStatus);
    window.addEventListener("cavoti-usage-refresh", usageRefresh);
    window.addEventListener("cavoti-open-ip", openIp);
    return () => {
      unsubscribe();
      window.removeEventListener("cavoti-refresh", nativeRefresh);
      window.removeEventListener("cavoti-open-status", openStatus);
      window.removeEventListener("cavoti-usage-refresh", usageRefresh);
      window.removeEventListener("cavoti-open-ip", openIp);
    };
  }, [bridge, openStatus, refresh]);

  useEffect(() => {
    const canRefresh =
      state === "live" && view !== "settings" && view !== "about";
    const handleNativeRefreshLock = (event: Event) => {
      const locked =
        (event as CustomEvent<{ locked?: boolean }>).detail?.locked === true;
      setNativeRefreshGestureLocked(locked);
    };

    setNativeRefreshEnabled(canRefresh);
    window.addEventListener(
      "cavoti-native-refresh-lock",
      handleNativeRefreshLock,
    );
    return () =>
      window.removeEventListener(
        "cavoti-native-refresh-lock",
        handleNativeRefreshLock,
      );
  }, [state, view]);

  useEffect(() => {
    if (capabilities.platform !== "mobile") return;
    void createChannel({
      id: "cavoti-monitor",
      name: "Cavoti monitoring",
      description: "Connection and quota alerts from Cavoti Bar.",
      importance: Importance.Default,
      visibility: Visibility.Private,
      vibration: true,
    }).catch(() => undefined);
  }, [capabilities.platform]);

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
    if (capabilities.platform === "mobile") return;
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
  }, [bridge, capabilities.platform, refresh]);

  const title = useMemo(
    () =>
      view === "about"
        ? "About"
        : (views.find((item) => item.id === view)?.label ?? "Overview"),
    [view],
  );
  const displayedSnapshot = useMemo(
    () =>
      snapshot ? { ...snapshot, capturedAt: freshnessCapturedAt } : snapshot,
    [freshnessCapturedAt, snapshot],
  );
  const overviewSnapshot = useMemo(() => {
    if (!displayedSnapshot || !backgroundSnapshot) return displayedSnapshot;
    return {
      ...displayedSnapshot,
      subscriptions: backgroundSnapshot.subscriptions,
      quotaResetCards: backgroundSnapshot.quotaResetCards,
      capturedAt: backgroundSnapshot.capturedAt,
    };
  }, [backgroundSnapshot, displayedSnapshot]);
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
      onViewChange={changeView}
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
      ) : (
        <div className="contents">
          <div hidden={view !== "overview"}>
            <Overview
              snapshot={
                view === "overview"
                  ? (overviewSnapshot ?? displayedSnapshot)
                  : displayedSnapshot
              }
              onNavigate={changeView}
              onConnect={connect}
              onOpenStatus={openStatus}
              onQuit={quit}
              onRestart={restart}
              updateReady={updateReady}
              showSeconds={showFreshnessSeconds}
              showShortcuts={capabilities.platform !== "mobile"}
            />
          </div>
          <div hidden={view !== "usage"}>
            <Usage snapshot={displayedSnapshot} />
          </div>
          <div hidden={view !== "plans"}>
            <Plans snapshot={displayedSnapshot} onConnect={connect} />
          </div>
          <div hidden={view !== "pricing"}>
            <Pricing snapshot={displayedSnapshot} />
          </div>
          <div hidden={view !== "keys"}>
            <Keys snapshot={displayedSnapshot} />
          </div>
          <div hidden={view !== "status"}>
            <Status
              snapshot={
                view === "plans"
                  ? (overviewSnapshot ?? displayedSnapshot)
                  : displayedSnapshot
              }
              state={state}
              onConnect={connect}
            />
          </div>
          <div hidden={view !== "about"}>
            <About />
          </div>
          <div hidden={view !== "settings"}>
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
          </div>
        </div>
      )}
    </AppShell>
  );
}
