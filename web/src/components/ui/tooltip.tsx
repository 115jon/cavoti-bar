import type * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={6}
        className="z-50 rounded-md bg-[var(--ink)] px-2 py-1 text-[10px] text-white shadow-lg animate-in fade-in zoom-in-95"
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-[var(--ink)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
