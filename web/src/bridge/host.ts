export type HostBridge = {
  post: (message: { action: string; value?: unknown }) => void;
  subscribe: (listener: (message: unknown) => void) => () => void;
};

type WebViewWindow = Window & {
  chrome?: {
    webview?: {
      postMessage: (message: unknown) => void;
      addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void;
    };
  };
};

export function createHostBridge(target: WebViewWindow = window): HostBridge {
  const webview = target.chrome?.webview;
  return {
    post: (message) => webview?.postMessage(message),
    subscribe: (listener) => {
      if (!webview) return () => undefined;
      const handle = (event: MessageEvent) => listener(event.data);
      webview.addEventListener("message", handle);
      return () => undefined;
    },
  };
}
