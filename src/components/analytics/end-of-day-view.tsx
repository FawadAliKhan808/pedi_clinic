"use client";

import { SplitBar } from "@/components/charts/split-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import type { UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, formatCurrency, formatDayShort, paymentModeLabels } from "@/lib/format";
import { useKeyedLoad } from "./use-keyed-load";

/** The day's close-out: who was seen, what was collected and how, and no-shows. */
export function EndOfDayView({
  clinicId,
  today,
  date,
  onDateChange,
}: {
  clinicId: UUID;
  today: string;
  date: string;
  onDateChange: (date: string) => void;
}) {
  const { data, error, stale } = useKeyedLoad(`${clinicId}:${date}`, () =>
    getBrowserApi().analytics.getEndOfDaySummary(clinicId, date)
  );

  const collected = data ? data.byMode.cash + data.byMode.upi + data.byMode.card : 0;
  const feeTotal = data
    ? data.byFeeType.consultation + data.byFeeType.vaccination + data.byFeeType.other
    : 0;
  const feeShare = (amount: number) =>
    feeTotal > 0 ? `${Math.round((amount / feeTotal) * 100)}% of visit fees` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
          Day
          <input
            type="date"
            max={today}
            value={date}
            onChange={(event) => event.target.value && onDateChange(event.target.value)}
            className="min-h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-primary-500"
          />
        </label>
        {date !== today && (
          <button
            type="button"
            onClick={() => onDateChange(today)}
            className="min-h-12 rounded-lg px-4 font-semibold text-primary-600 hover:bg-surface-sunken"
          >
            Back to today
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : !data ? (
        <div className="grid gap-3 @2xl:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-4 transition-opacity",
            stale && "opacity-60"
          )}
          aria-busy={stale}
        >
          <h2 className="text-lg font-bold text-foreground">
            {date === today ? "Today" : formatDayShort(date)}
          </h2>

          <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-3">
            <StatTile label="Children seen" value={data.patientsSeen} />
            <StatTile
              label="Total collected"
              value={formatCurrency(collected + data.pharmacy.total)}
              hint="Consultations and pharmacy"
            />
            <StatTile label="Visit fees" value={formatCurrency(collected)} hint="All consultation-visit money" />
            <StatTile
              label="Pharmacy sales"
              value={formatCurrency(data.pharmacy.total)}
              hint={`${data.pharmacy.orders} ${data.pharmacy.orders === 1 ? "order" : "orders"} dispensed`}
            />
            <StatTile
              label="Appointments arrived"
              value={data.appointments.attended}
              hint={
                data.appointments.notArrived > 0
                  ? `${data.appointments.notArrived} still expected`
                  : undefined
              }
            />
            <StatTile label="Appointments missed" value={data.appointments.missed} />
          </div>

<section className="flex flex-col gap-3" aria-labelledby="fee-split-title">
            <h3 id="fee-split-title" className="font-semibold text-foreground">
              Revenue by fee type
            </h3>
            <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-3">
              <StatTile
                label="Consultation fees"
                value={formatCurrency(data.byFeeType.consultation)}
                hint={feeShare(data.byFeeType.consultation)}
              />
              <StatTile
                label="Vaccination fees"
                value={formatCurrency(data.byFeeType.vaccination)}
                hint={feeShare(data.byFeeType.vaccination)}
              />
              {data.byFeeType.other > 0 && (
                <StatTile
                  label="Other fees"
                  value={formatCurrency(data.byFeeType.other)}
                  hint={feeShare(data.byFeeType.other)}
                />
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
            <SplitBar
              title="Booked appointments: attended vs missed"
              parts={[
                { label: "Attended", value: data.appointments.attended, colorClass: "bg-chart-1" },
                { label: "Missed", value: data.appointments.missed, colorClass: "bg-chart-2" },
              ]}
            />
            {data.appointments.notArrived > 0 && (
              <p className="text-sm text-foreground-muted">
                {data.appointments.notArrived} still expected today — marked missed overnight if
                they don&apos;t check in.
              </p>
            )}
          </section>

          <section className="grid gap-5 rounded-xl border border-border bg-surface-raised p-4 shadow-sm @2xl:grid-cols-2">
            <SplitBar
              title="Consultations by payment mode"
              formatValue={formatCurrency}
              parts={[
                { label: paymentModeLabels.cash, value: data.byMode.cash, colorClass: "bg-chart-1" },
                { label: paymentModeLabels.upi, value: data.byMode.upi, colorClass: "bg-chart-2" },
                { label: paymentModeLabels.card, value: data.byMode.card, colorClass: "bg-chart-3" },
              ]}
            />
            <SplitBar
              title="Consultations by fee type"
              formatValue={formatCurrency}
              parts={[
                { label: "Consultation", value: data.byFeeType.consultation, colorClass: "bg-chart-1" },
                { label: "Vaccination", value: data.byFeeType.vaccination, colorClass: "bg-chart-2" },
                { label: "Other", value: data.byFeeType.other, colorClass: "bg-chart-3" },
              ]}
            />
          </section>
        </div>
      )}
    </div>
  );
}
