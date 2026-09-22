import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format";
import { Spinner } from "./feedback";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary-600 text-foreground-on-primary hover:bg-primary-700 active:bg-primary-800",
  accent:
    "bg-accent-500 text-foreground-on-accent hover:bg-accent-600 active:bg-accent-700",
  secondary:
    "bg-surface-sunken text-foreground border border-border hover:bg-neutral-100 dark:hover:bg-neutral-800",
  ghost: "text-foreground-muted hover:bg-surface-sunken",
  danger: "bg-danger text-neutral-0 hover:opacity-90",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        // 48px minimum touch target, phone-first.
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold",
        "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
        variants[variant],
        fullWidth && "w-full",
        className
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
