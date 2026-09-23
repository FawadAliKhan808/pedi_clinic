"use client";

import { BarChart3, Table } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export interface SeriesSpec {
  key: string;
  label: string;
  /** A chart token class, e.g. "bg-chart-1". Marks only — text never wears it. */
  colorClass: string;
}

/**
 * Frame for every chart: title, optional controls, the chart, and a switch
 * to a table view — so no value is ever reachable only by hovering or by
 * telling colours apart.
 */
export function ChartCard({
  title,
  subtitle,
  controls,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  controls?: ReactNode;
  legend?: SeriesSpec[];
  table: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4 shadow-sm",
        className
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-foreground-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          aria-pressed={showTable}
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-foreground-muted hover:bg-surface-sunken"
        >
          {showTable ? <BarChart3 className="size-4" /> : <Table className="size-4" />}
          {showTable ? "Chart" : "Table"}
        </button>
      </header>

      {controls && <div className="flex flex-wrap gap-2">{controls}</div>}

      {legend && legend.length > 1 && !showTable && <Legend series={legend} />}

      {showTable ? table : children}
    </section>
  );
}

export function Legend({ series }: { series: SeriesSpec[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-muted">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span aria-hidden className={cn("size-2.5 rounded-sm", item.colorClass)} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A two-option toggle for chart controls (e.g. Fee type / Payment mode). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-10 rounded-md px-3 text-sm font-semibold",
            value === option.value
              ? "bg-primary-600 text-foreground-on-primary"
              : "text-foreground-muted hover:bg-surface-sunken"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-raised text-left text-foreground-muted">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                className={cn("py-2 pr-3 font-semibold", index > 0 && "text-right")}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums text-foreground">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {row.map((cell, index) => (
                <td key={index} className={cn("py-2 pr-3", index > 0 && "text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
