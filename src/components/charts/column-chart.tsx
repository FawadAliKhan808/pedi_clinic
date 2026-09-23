"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import type { SeriesSpec } from "./chart-card";
import { niceTicks } from "./scale";

export interface ColumnDatum {
  label: string;
  /** Longer label for the tooltip and screen readers (e.g. the full date). */
  fullLabel?: string;
  values: Record<string, number>;
}

const PLOT_HEIGHT = 176;

/**
 * Columns grown from one baseline — single-series, or stacked when given
 * several series. Mark specs: ≤24px wide with the band's leftover as air,
 * 4px rounded data-end and square baseline, 2px surface gap between stacked
 * segments, hairline grid. Each column's whole band is its hover/focus
 * target, and its tooltip lists every series (value first, name second).
 */
export function ColumnChart({
  data,
  series,
  formatValue,
  formatTick,
  showTotal = series.length > 1,
  integer = false,
}: {
  data: ColumnDatum[];
  series: SeriesSpec[];
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  showTotal?: boolean;
  /** Whole-number data (counts): keeps axis ticks whole too. */
  integer?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);

  const totals = data.map((datum) =>
    series.reduce((sum, item) => sum + (datum.values[item.key] ?? 0), 0)
  );
  const ticks = niceTicks(Math.max(0, ...totals), 4, integer);
  const top = ticks[ticks.length - 1];

  // Keep x labels from colliding: at most ~7 across the axis.
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
      {/* Y axis */}
      <div className="relative" style={{ height: PLOT_HEIGHT }} aria-hidden>
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 translate-y-1/2 text-xs tabular-nums text-foreground-muted"
            style={{ bottom: `${(tick / top) * 100}%` }}
          >
            {formatTick(tick)}
          </span>
        ))}
      </div>

      {/* Plot */}
      <div className="relative border-b border-chart-axis" style={{ height: PLOT_HEIGHT }}>
        {ticks.slice(1).map((tick) => (
          <div
            key={tick}
            aria-hidden
            className="absolute inset-x-0 border-t border-chart-grid"
            style={{ bottom: `${(tick / top) * 100}%` }}
          />
        ))}

        <div className="absolute inset-0 flex items-end">
          {data.map((datum, index) => {
            const total = totals[index];
            const visible = series.filter((item) => (datum.values[item.key] ?? 0) > 0);
            const summary = series
              .map((item) => `${item.label} ${formatValue(datum.values[item.key] ?? 0)}`)
              .join(", ");

            return (
              <button
                key={datum.label + index}
                type="button"
                aria-label={`${datum.fullLabel ?? datum.label}: ${summary}`}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center px-[2px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
              >
                {total > 0 && (
                  <span
                    className="flex w-full max-w-6 flex-col-reverse gap-[2px] transition-[filter] group-hover:brightness-110"
                    style={{ height: `${(total / top) * 100}%` }}
                  >
                    {visible.map((item, segment) => (
                      <span
                        key={item.key}
                        className={cn(
                          "block min-h-[2px] w-full",
                          item.colorClass,
                          segment === visible.length - 1 && "rounded-t-[4px]"
                        )}
                        style={{ flexGrow: datum.values[item.key] }}
                      />
                    ))}
                  </span>
                )}

                {active === index && (
                  <span
                    role="tooltip"
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-2 min-w-36 rounded-lg border border-border bg-surface-raised px-3 py-2 text-left shadow-lg",
                      index < data.length / 4
                        ? "left-0"
                        : index > (data.length * 3) / 4
                          ? "right-0"
                          : "left-1/2 -translate-x-1/2"
                    )}
                  >
                    <span className="block text-xs text-foreground-muted">
                      {datum.fullLabel ?? datum.label}
                    </span>
                    {series.map((item) => (
                      <span key={item.key} className="flex items-center gap-2 text-sm">
                        <span aria-hidden className={cn("h-0.5 w-3 rounded-full", item.colorClass)} />
                        <strong className="tabular-nums text-foreground">
                          {formatValue(datum.values[item.key] ?? 0)}
                        </strong>
                        <span className="text-foreground-muted">{item.label}</span>
                      </span>
                    ))}
                    {showTotal && (
                      <span className="mt-1 block border-t border-border pt-1 text-sm">
                        <strong className="tabular-nums text-foreground">{formatValue(total)}</strong>{" "}
                        <span className="text-foreground-muted">total</span>
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* X axis labels */}
      <div aria-hidden />
      <div className="flex pt-1.5" aria-hidden>
        {data.map((datum, index) => (
          <span
            key={datum.label + index}
            className="min-w-0 flex-1 text-center text-xs text-foreground-muted"
          >
            {index % labelEvery === 0 ? datum.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
