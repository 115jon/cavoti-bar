import type { MouseEvent, ReactNode } from "react";
import {
  ChartBarIcon as ChartBar,
  CornersInIcon as CornersIn,
  CornersOutIcon as CornersOut,
  GearSixIcon as GearSix,
  HouseIcon as House,
  MinusIcon as Minus,
  PulseIcon as Pulse,
  StackIcon as Stack,
  XIcon as X,
} from "@phosphor-icons/react";
import type { BridgeState, View } from "../../app/types";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export const views: Array<{ id: Exclude<View, "about">; label: string; icon: typeof House }> = [
  { id: "overview", label: "Overview", icon: House },
  { id: "usage", label: "Usage", icon: ChartBar },
  { id: "plans", label: "Plans", icon: Stack },
  { id: "status", label: "Status", icon: Pulse },
  { id: "settings", label: "Settings", icon: GearSix },
];

export function AppShell({
  compact,
  view,
  title,
  state,
  maximized,
  onViewChange,
  onBeginDrag,
  onMaximize,
  onMinimize,
  onClose,
  children,
}: {
  compact: boolean;
  view: View;
  title: string;
  state: BridgeState;
  maximized: boolean;
  onViewChange: (view: View) => void;
  onBeginDrag: (event: MouseEvent<HTMLElement>) => void;
  onMaximize: () => void;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell" data-layout={compact ? "compact" : "wide"}>
        <header className="titlebar" data-drag-region onMouseDown={onBeginDrag}>
          <button type="button" className="brand-button" onClick={() => onViewChange("overview")}>
            <img src="./favicon.png" alt="Cavoti" />
            <span>
              <strong>Cavoti</strong>
            </span>
          </button>
          <div className="window-actions">
            <Button variant="ghost" size="icon" aria-label={maximized ? "Restore window" : "Maximize window"} onClick={onMaximize}>
              {maximized ? <CornersIn /> : <CornersOut />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Minimize window" onClick={onMinimize}>
              <Minus />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close window" onClick={onClose}>
              <X />
            </Button>
          </div>
        </header>
        <div className="shell-body">
          <nav className="nav-rail" aria-label="Primary navigation">
            {views.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="tab"
                    className={`nav-button ${view === id ? "active" : ""}`}
                    aria-label={label}
                    aria-selected={view === id}
                    onClick={() => onViewChange(id)}
                  >
                    <Icon weight={view === id ? "fill" : "regular"} />
                    <span className="nav-label">{label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
            <div className="nav-spacer" />
          </nav>
          <main className="content" aria-live="polite">
            <div className="mobile-heading">
              <span>{title}</span>
              <span className="mobile-state">{state}</span>
            </div>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
