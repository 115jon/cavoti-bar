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
        className="z-50 max-w-72 rounded-lg border border-(--line-strong) bg-white px-3 py-2 text-[11px] leading-4 text-(--ink) shadow-xl animate-in fade-in zoom-in-95 [&_span]:text-(--ink-muted)"
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-white" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
