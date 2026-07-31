import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type HostBridge = {
  post: (message: { action: string; value?: unknown }) => void;
  subscribe: (listener: (message: unknown) => void) => () => void;
};

type WebViewWindow = Window & {
  chrome?: {
    webview?: {
      postMessage: (message: unknown) => void;
      addEventListener: (
        type: "message",
        listener: (event: MessageEvent) => void,
      ) => void;
      removeEventListener: (
        type: "message",
        listener: (event: MessageEvent) => void,
      ) => void;
    };
  };
};

type HostCommand = { action: string; value?: unknown };

type TauriWindow = WebViewWindow & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

function isTauriRuntime(target: TauriWindow): boolean {
  return (
    target.__TAURI_INTERNALS__ !== undefined || target.__TAURI__ !== undefined
  );
}

function isTauriDevOrigin(target: TauriWindow): boolean {
  return (
    target.location?.hostname === "localhost" && target.location.port === "1420"
  );
}

function createTauriBridge(target: TauriWindow): HostBridge {
  let listenersReady = Promise.resolve();
  return {
    post: (message) => {
      void listenersReady
        .then(() => invoke("host_command", { message }))
        .catch((error: unknown) => {
          console.error("[cavoti-host] command failed", error);
        });
    },
    subscribe: (listener) => {
      let active = true;
      let unlistenEvents: (() => void) | undefined;
      let unlistenCommands: (() => void) | undefined;
      listenersReady = Promise.all([
        listen<unknown>("host-event", (event) => listener(event.payload)),
        listen<HostCommand>("host-command", (event) => {
          if (active) {
            void invoke("host_command", { message: event.payload }).catch(
              () => undefined,
            );
          }
        }),
      ]).then(([removeEvents, removeCommands]) => {
        if (active) {
          unlistenEvents = removeEvents;
          unlistenCommands = removeCommands;
        } else {
          removeEvents();
          removeCommands();
        }
      });
      return () => {
        active = false;
        unlistenEvents?.();
        unlistenCommands?.();
      };
    },
  };
}

export function createHostBridge(target: WebViewWindow = window): HostBridge {
  const tauri = isTauriRuntime(target) || isTauriDevOrigin(target);
  if (tauri) return createTauriBridge(target);
  const webview = target.chrome?.webview;
  return {
    post: (message) => webview?.postMessage(message),
    subscribe: (listener) => {
      if (!webview) return () => undefined;
      const handle = (event: MessageEvent) => listener(event.data);
      webview.addEventListener("message", handle);
      return () => webview.removeEventListener("message", handle);
    },
  };
}
