import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "../../lib/cn";
export function Progress({
  value,
  className,
  tone = "accent",
}: {
  value: number;
  className?: string;
  tone?: "accent" | "good" | "warning" | "critical";
}) {
  const colors = { accent: "bg-[var(--accent)]", good: "bg-[var(--good)]", warning: "bg-[var(--warning)]", critical: "bg-[var(--bad)]" };
  return (
    <ProgressPrimitive.Root className={cn("h-1.5 w-full overflow-hidden rounded-full bg-black/[.08]", className)} value={value}>
      <ProgressPrimitive.Indicator
        data-tone={tone}
        className={cn("h-full rounded-full transition-transform duration-500", colors[tone])}
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
