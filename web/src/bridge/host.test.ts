import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve()),
  resolveListeners: [] as Array<() => void>,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: state.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() =>
    new Promise<() => void>((resolve) => {
      state.resolveListeners.push(() => resolve(() => undefined));
    }),
  ),
}));

import { createHostBridge } from "./host";

describe("Tauri host bridge startup", () => {
  beforeEach(() => {
    state.invoke.mockReset();
    state.resolveListeners.length = 0;
  });

  it("waits for event listeners before sending bootstrap", async () => {
    const bridge = createHostBridge(
      { __TAURI_INTERNALS__: {} } as unknown as Window,
    );

    bridge.subscribe(() => undefined);
    bridge.post({ action: "bootstrap" });

    expect(state.invoke).not.toHaveBeenCalled();
    state.resolveListeners.forEach((resolve) => {
      resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.invoke).toHaveBeenCalledWith("host_command", {
      message: { action: "bootstrap" },
    });
  });

  it("selects Tauri for the Tauri dev origin before globals are ready", async () => {
    const bridge = createHostBridge({
      location: { hostname: "localhost", port: "1420" },
    } as unknown as Window);

    bridge.subscribe(() => undefined);
    bridge.post({ action: "bootstrap" });
    state.resolveListeners.forEach((resolve) => {
      resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.invoke).toHaveBeenCalledWith("host_command", {
      message: { action: "bootstrap" },
    });
  });
});
