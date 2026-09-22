import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-raised p-4 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A card that behaves as a single large tap target (child pickers, queue cards). */
export function SelectableCard({
  selected,
  onSelect,
  children,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border-2 p-4 text-left transition-colors duration-150",
        selected
          ? "border-primary-600 bg-primary-50 dark:bg-primary-900/30"
          : "border-border bg-surface-raised hover:border-primary-300",
        className
      )}
    >
      {children}
    </button>
  );
}
