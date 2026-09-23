import { cn } from "@/lib/format";
import { formatPercent } from "./scale";

export interface SplitPart {
  label: string;
  value: number;
  /** A chart token class, e.g. "bg-chart-1". */
  colorClass: string;
}

/**
 * Part-to-whole for two or three parts: one bar split by a 2px surface gap,
 * with every part direct-labelled (count and share) beside a colour key — a
 * two-slice pie would say the same thing less legibly.
 */
export function SplitBar({
  title,
  parts,
  formatValue = String,
}: {
  title: string;
  parts: SplitPart[];
  formatValue?: (value: number) => string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>

      {total === 0 ? (
        <div className="h-3 rounded-full bg-surface-sunken" aria-label="No data yet" />
      ) : (
        <div
          role="img"
          aria-label={parts
            .map((part) => `${part.label} ${formatValue(part.value)} (${formatPercent(part.value, total)})`)
            .join(", ")}
          className="flex h-3 gap-[2px] overflow-hidden rounded-full"
        >
          {parts
            .filter((part) => part.value > 0)
            .map((part) => (
              <span
                key={part.label}
                className={cn("block h-full", part.colorClass)}
                style={{ flexGrow: part.value }}
              />
            ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2.5 rounded-sm", part.colorClass)} />
            <span className="text-foreground-muted">{part.label}</span>
            <strong className="tabular-nums text-foreground">{formatValue(part.value)}</strong>
            <span className="text-foreground-muted">{formatPercent(part.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
