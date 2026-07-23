import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-45 active:scale-[.98]", {
  variants: { variant: { default: "bg-[var(--accent-strong)] text-white shadow-sm hover:bg-[var(--accent-ink)]", secondary: "bg-[var(--accent-soft)] text-[var(--accent-ink)] hover:bg-[var(--accent-soft-strong)]", ghost: "text-[var(--ink-muted)] hover:bg-black/[.05] hover:text-[var(--ink)]", outline: "border border-[var(--line-strong)] bg-white/45 text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]" }, size: { sm: "h-7 px-2.5", default: "h-8 px-3", icon: "size-8" } }, defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : "button"; return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />; });
Button.displayName = "Button";
