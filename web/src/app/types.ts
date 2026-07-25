import type { ReactNode } from "react";
import type { HostBridge } from "../bridge/host";

export type View =
  | "overview"
  | "usage"
  | "plans"
  | "status"
  | "settings"
  | "about";
export type BridgeState =
  | "loading"
  | "auth-required"
  | "offline"
  | "error"
  | "live";
export type AppProps = { bridge: HostBridge };
export type ActionProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
};
