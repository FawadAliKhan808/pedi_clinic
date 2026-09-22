import type { VisitStatus } from "@/lib/api";
import { cn, visitStatusColors, visitStatusLabels } from "@/lib/format";

export function StatusPill({
  status,
  className,
}: {
  status: VisitStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-neutral-0",
        visitStatusColors[status],
        className
      )}
    >
      {visitStatusLabels[status]}
    </span>
  );
}
