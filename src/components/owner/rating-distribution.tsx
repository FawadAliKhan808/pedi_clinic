import { Star } from "lucide-react";
import { formatPercent } from "@/components/charts/scale";

/**
 * Ratings 5 → 1 as horizontal bars from one baseline. Every row carries its
 * count and share as text, so nothing depends on reading bar lengths alone.
 */
export function RatingDistribution({
  distribution,
  total,
}: {
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  total: number;
}) {
  const stars = [5, 4, 3, 2, 1] as const;
  const max = Math.max(1, ...stars.map((star) => distribution[star]));

  return (
    <ul className="flex flex-col gap-2">
      {stars.map((star) => {
        const count = distribution[star];
        return (
          <li
            key={star}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm"
            aria-label={`${star} star: ${count} (${formatPercent(count, total)})`}
          >
            <span className="flex items-center gap-1 font-semibold text-foreground">
              {star}
              <Star aria-hidden className="size-3.5 text-foreground-muted" />
            </span>
            <span className="h-3 border-l border-chart-axis" aria-hidden>
              {count > 0 && (
                <span
                  className="block h-full max-h-6 rounded-r-[4px] bg-chart-1"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              )}
            </span>
            <span className="text-right tabular-nums">
              <strong className="text-foreground">{count}</strong>{" "}
              <span className="text-foreground-muted">{formatPercent(count, total)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
