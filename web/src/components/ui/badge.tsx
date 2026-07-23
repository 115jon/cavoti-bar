import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
const badgeVariants = cva("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.08em]", { variants: { variant: { default: "bg-[var(--accent-soft)] text-[var(--accent-ink)]", success: "bg-[var(--good-soft)] text-[var(--good)]", warning: "bg-[var(--warning-soft)] text-[var(--warning)]", outline: "border border-[var(--line-strong)] text-[var(--ink-muted)]" } }, defaultVariants: { variant: "default" } });
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
