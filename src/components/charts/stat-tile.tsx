import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** A headline number: label, value (proportional figures), and a quiet hint. */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface-raised p-4 shadow-sm",
        className
      )}
    >
      <p className="text-sm text-foreground-muted">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-foreground-muted">{hint}</p>}
    </div>
  );
}
