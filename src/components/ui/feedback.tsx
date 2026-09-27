import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-700",
        className
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    // Spans every column when it sits in a card grid.
    <div className="col-span-full flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="text-foreground-muted">{icon}</div>}
      <p className="font-display text-lg font-bold text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-sm text-foreground-muted">{description}</p>
      )}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="font-display text-lg font-bold text-foreground">Couldn&apos;t load this</p>
      <p className="max-w-xs text-sm text-foreground-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="min-h-12 rounded-full px-5 font-display font-bold text-primary-600"
        >
          Try again
        </button>
      )}
    </div>
  );
}
