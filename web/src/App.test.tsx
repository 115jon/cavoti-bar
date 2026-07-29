import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { HostBridge } from "./bridge/host";
import { liveSnapshot } from "./test/fixtures";

function createBridge(): {
  bridge: HostBridge;
  sent: unknown[];
  dispatch: (message: unknown) => void;
} {
  const listeners = new Set<(message: unknown) => void>();
  const sent: unknown[] = [];
  return {
    bridge: {
      post: (message) => sent.push(message),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    sent,
    dispatch: (message) => {
      listeners.forEach((listener) => {
        listener(message);
      });
    },
  };
}

describe("App", () => {
  it("starts loading then presents the explicit live-session boundary", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    expect(screen.getByText("Loading Cavoti snapshot")).toBeInTheDocument();
    act(() =>
      dispatch({
        type: "bridge-state",
        protocol: 1,
        state: "auth-required",
        status: 401,
        message: "Live session required",
      }),
    );

    expect(screen.getByText("Live session required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Cavoti" }));
    expect(sent).toContainEqual({ action: "connect" });
  });

  it("does not bootstrap again when the first live snapshot changes state", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        snapshot: liveSnapshot,
        complete: true,
      }),
    );

    expect(
      sent.filter(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          "action" in message &&
          message.action === "bootstrap",
      ),
    ).toHaveLength(1);
  });

  it("renders every destination from a host-delivered live snapshot", () => {
    const { bridge, dispatch } = createBridge();
    render(<App bridge={bridge} />);
    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        snapshot: liveSnapshot,
        settings: {
          topmost: true,
          maximized: false,
          refreshIntervalSeconds: 60,
          showFreshnessSeconds: false,
        },
      }),
    );

    expect(screen.getByText("Lite")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Usage" }));
    expect(screen.getByRole("tab", { name: "Usage" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Plans" }));
    expect(screen.getByRole("tab", { name: "Plans" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Status" }));
    expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("posts a native drag command from the titlebar background", () => {
    const { bridge, sent } = createBridge();
    render(<App bridge={bridge} />);
    fireEvent.mouseDown(screen.getByRole("banner"), { button: 0 });
    expect(sent).toContainEqual({ action: "drag" });
  });

  it("handles Windows shortcuts for refresh, settings, and quit", () => {
    const { bridge, sent } = createBridge();
    render(<App bridge={bridge} />);

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    fireEvent.keyDown(window, { key: "q", ctrlKey: true });

    expect(sent).toContainEqual({ action: "refresh" });
    expect(sent).toContainEqual({ action: "exit" });
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not register keyboard shortcuts on mobile", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        protocol: 1,
        type: "capabilities",
        capabilities: {
          platform: "mobile",
          titlebarControls: false,
          tray: false,
          startup: false,
          topmost: false,
          windowSettings: false,
        },
      }),
    );
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    fireEvent.keyDown(window, { key: "q", ctrlKey: true });

    expect(sent).not.toContainEqual({ action: "refresh" });
    expect(sent).not.toContainEqual({ action: "exit" });
  });

  it("shows the update restart command only when the host reports an update", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);
    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        snapshot: liveSnapshot,
        settings: {
          topmost: false,
          maximized: false,
          refreshIntervalSeconds: 60,
          showFreshnessSeconds: false,
          updateReady: true,
        },
      }),
    );

    const restart = screen.getByRole("button", {
      name: "Update ready, restart now?",
    });
    expect(restart).toBeInTheDocument();
    fireEvent.click(restart);
    expect(sent).toContainEqual({ action: "install-update" });
  });

  it("updates freshness only after the terminal enrichment snapshot", () => {
    const { bridge, dispatch } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        complete: false,
        snapshot: {
          ...liveSnapshot,
          capturedAt: new Date(Date.now() - 4000).toISOString(),
        },
      }),
    );
    expect(screen.getByText("Loading Cavoti snapshot")).toBeInTheDocument();

    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        complete: true,
        snapshot: {
          ...liveSnapshot,
          capturedAt: new Date(Date.now() - 4000).toISOString(),
        },
      }),
    );
    expect(screen.getByText("Updated just now")).toBeInTheDocument();
  });

  it("renders tray and startup controls from host settings", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        snapshot: liveSnapshot,
        settings: {
          topmost: false,
          maximized: false,
          refreshIntervalSeconds: 60,
          showFreshnessSeconds: false,
          closeToTray: true,
          launchAtStartup: false,
          startupError: null,
          quotaThresholds: [],
        },
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));

    expect(screen.getByText("Close to tray")).toBeInTheDocument();
    expect(screen.getByText("Run at startup")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Close to tray" }));
    fireEvent.click(screen.getByRole("switch", { name: "Run at startup" }));

    expect(sent).toContainEqual({
      action: "setting",
      value: { name: "close-to-tray", enabled: false },
    });
    expect(sent).toContainEqual({
      action: "setting",
      value: { name: "launch-at-startup", enabled: true },
    });
  });

  it("treats snapshots without a completion flag as terminal", () => {
    const { bridge, dispatch } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        type: "snapshot",
        protocol: 1,
        snapshot: { ...liveSnapshot, capturedAt: new Date().toISOString() },
      }),
    );

    expect(screen.getByText("Updated just now")).toBeInTheDocument();
  });

  it("hides desktop-only controls and ignores keyboard shortcuts on mobile", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        protocol: 1,
        type: "capabilities",
        capabilities: {
          platform: "mobile",
          titlebarControls: false,
          tray: false,
          startup: false,
          topmost: false,
          windowSettings: false,
        },
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Minimize window" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Close window" })).toBeNull();

    act(() =>
      dispatch({
        protocol: 1,
        type: "snapshot",
        snapshot: liveSnapshot,
        settings: {
          topmost: false,
          maximized: false,
          refreshIntervalSeconds: 60,
          showFreshnessSeconds: false,
          closeToTray: true,
          launchAtStartup: false,
          startupError: null,
          quotaThresholds: [],
        },
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.queryByText("Close to tray")).toBeNull();
    expect(screen.queryByText("Run at startup")).toBeNull();
    expect(screen.queryByText("Keep on top")).toBeNull();
    expect(screen.getByText("Refresh interval")).toBeInTheDocument();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    act(() =>
      window.dispatchEvent(
        new CustomEvent("cavoti-usage-refresh", { detail: {} }),
      ),
    );
    expect(sent).toContainEqual({
      action: "lifecycle",
      value: { state: "paused" },
    });
    expect(sent).not.toContainEqual({ action: "refresh" });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(sent).toContainEqual({
      action: "lifecycle",
      value: { state: "foreground" },
    });
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });
    expect(sent).not.toContainEqual({ action: "refresh" });
  });

  it("opens compact secondary navigation and closes after routing", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const { bridge, dispatch } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        protocol: 1,
        type: "capabilities",
        capabilities: {
          platform: "mobile",
          titlebarControls: false,
          tray: false,
          startup: false,
          topmost: false,
          windowSettings: false,
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "More navigation" }));
    const navigation = screen.getByRole("dialog", { name: "More" });
    expect(navigation).toBeInTheDocument();
    expect(
      within(navigation).getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(navigation).getByRole("button", { name: "Settings" }),
    );
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("refreshes from the native pull event", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        protocol: 1,
        type: "capabilities",
        capabilities: {
          platform: "mobile",
          titlebarControls: false,
          tray: false,
          startup: false,
          topmost: false,
          windowSettings: false,
        },
      }),
    );
    act(() =>
      dispatch({
        protocol: 1,
        type: "snapshot",
        snapshot: liveSnapshot,
        complete: true,
      }),
    );

    window.dispatchEvent(new Event("cavoti-refresh"));

    expect(sent).toContainEqual({ action: "refresh" });
  });

  it("ignores native pull while the initial snapshot is loading", () => {
    const { bridge, sent } = createBridge();
    render(<App bridge={bridge} />);

    window.dispatchEvent(new Event("cavoti-refresh"));

    expect(sent).not.toContainEqual({ action: "refresh" });
  });

  it("enables native pull only on live data views", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    const enabled: boolean[] = [];
    Object.defineProperty(window, "CavotiNativeRefresh", {
      configurable: true,
      value: { setEnabled: (value: boolean) => enabled.push(value) },
    });
    const { bridge, dispatch } = createBridge();
    render(<App bridge={bridge} />);

    act(() =>
      dispatch({
        protocol: 1,
        type: "snapshot",
        snapshot: liveSnapshot,
        complete: true,
      }),
    );
    expect(enabled.at(-1)).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(enabled.at(-1)).toBe(false);

    delete (window as { CavotiNativeRefresh?: unknown }).CavotiNativeRefresh;
  });
});
