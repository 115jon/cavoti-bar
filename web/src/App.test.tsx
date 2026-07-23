import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { HostBridge } from "./bridge/host";
import { liveSnapshot } from "./test/fixtures";

function createBridge(): { bridge: HostBridge; sent: unknown[]; dispatch: (message: unknown) => void } {
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
    dispatch: (message) => listeners.forEach((listener) => listener(message)),
  };
}

describe("App", () => {
  it("starts loading then presents the explicit live-session boundary", () => {
    const { bridge, dispatch, sent } = createBridge();
    render(<App bridge={bridge} />);

    expect(screen.getByText("Loading Cavoti snapshot")).toBeInTheDocument();
     act(() => dispatch({ type: "bridge-state", protocol: 1, state: "auth-required", status: 401, message: "Live session required" }));

    expect(screen.getByText("Live session required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect Cavoti" }));
    expect(sent).toContainEqual({ action: "connect" });
  });

  it("renders every destination from a host-delivered live snapshot", () => {
    const { bridge, dispatch } = createBridge();
    render(<App bridge={bridge} />);
     act(() => dispatch({ type: "snapshot", protocol: 1, snapshot: liveSnapshot, settings: { topmost: true } }));

    expect(screen.getByText("Lite")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Usage" }));
    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Plans" }));
    expect(screen.getByRole("heading", { name: "Plans" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Status" }));
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});
