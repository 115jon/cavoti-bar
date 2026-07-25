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
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
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
      <div className="group/app h-screen overflow-hidden bg-[var(--canvas)]" data-layout={compact ? "compact" : "wide"}>
        <header
          className="flex h-12 items-center border-b border-[var(--line)] bg-[var(--chrome)] px-3 backdrop-blur-xl group-data-[layout=wide]/app:h-14 group-data-[layout=wide]/app:px-6"
          data-drag-region
          onMouseDown={onBeginDrag}
        >
          <button
            type="button"
            className="flex items-center gap-2 text-left text-[var(--ink)] group-data-[layout=wide]/app:gap-3"
            onClick={() => onViewChange("overview")}
          >
            <img className="size-7 object-contain group-data-[layout=wide]/app:size-9" src="./favicon.png" alt="Cavoti" />
            <span>
              <strong className="block text-sm font-bold leading-4 group-data-[layout=wide]/app:text-base group-data-[layout=wide]/app:font-semibold group-data-[layout=wide]/app:leading-5">
                Cavoti
              </strong>
            </span>
          </button>
          <div className="ml-auto flex gap-px group-data-[layout=wide]/app:gap-1">
            <Button
              className="text-[var(--ink-muted)] group-data-[layout=wide]/app:size-10 group-data-[layout=wide]/app:[&_svg]:size-5"
              variant="ghost"
              size="icon"
              aria-label={maximized ? "Restore window" : "Maximize window"}
              onClick={onMaximize}
            >
              {maximized ? <CornersIn /> : <CornersOut />}
            </Button>
            <Button
              className="text-[var(--ink-muted)] group-data-[layout=wide]/app:size-10 group-data-[layout=wide]/app:[&_svg]:size-5"
              variant="ghost"
              size="icon"
              aria-label="Minimize window"
              onClick={onMinimize}
            >
              <Minus />
            </Button>
            <Button
              className="text-[var(--ink-muted)] group-data-[layout=wide]/app:size-10 group-data-[layout=wide]/app:[&_svg]:size-5"
              variant="ghost"
              size="icon"
              aria-label="Close window"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </header>
        <div className="flex h-[calc(100vh-3rem)] min-h-0 group-data-[layout=wide]/app:h-[calc(100vh-3.5rem)] group-data-[layout=compact]/app:flex-col">
          <nav
            className="flex w-12 basis-12 flex-col items-center gap-1 border-r border-[var(--line)] bg-white/40 px-1.5 py-3 group-data-[layout=wide]/app:w-20 group-data-[layout=wide]/app:basis-20 group-data-[layout=wide]/app:gap-3 group-data-[layout=wide]/app:px-3 group-data-[layout=wide]/app:py-5 group-data-[layout=compact]/app:hidden"
            aria-label="Primary navigation"
          >
            <Tabs value={view} onValueChange={(value) => onViewChange(value as View)} orientation="vertical" className="w-full flex-1">
              <TabsList className="flex w-full flex-col items-center gap-1 bg-transparent p-0">
                {views.map(({ id, label, icon: Icon }) => (
                  <Tooltip key={id}>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        value={id}
                        className="relative flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg border-0 bg-transparent text-[var(--ink-faint)] transition-all duration-150 hover:bg-white/70 hover:text-[var(--accent)] data-[state=active]:bg-white/75 data-[state=active]:text-[var(--accent)] data-[state=active]:shadow-sm before:absolute before:left-[-6px] before:h-4 before:w-0 before:rounded-r before:bg-transparent before:content-[''] data-[state=active]:before:w-0.5 group-data-[layout=wide]/app:h-14 group-data-[layout=wide]/app:w-14 group-data-[layout=wide]/app:gap-1 group-data-[layout=wide]/app:rounded-xl group-data-[layout=wide]/app:[&_svg]:size-6"
                        aria-label={label}
                        onClick={() => onViewChange(id)}
                      >
                        <Icon weight={view === id ? "fill" : "regular"} />
                        <span className="hidden text-xs font-medium leading-3 group-data-[layout=wide]/app:block">{label}</span>
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </TabsList>
            </Tabs>
          </nav>
          <main
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5 pt-4 group-data-[layout=wide]/app:px-10 group-data-[layout=wide]/app:pb-12 group-data-[layout=wide]/app:pt-8"
            aria-live="polite"
          >
            <div className="hidden">
              <span>{title}</span>
              <span>{state}</span>
            </div>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
