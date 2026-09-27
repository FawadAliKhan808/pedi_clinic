"use client";

import { useState } from "react";
import {
  ChartCard,
  DataTable,
  Segmented,
  type SeriesSpec,
} from "@/components/charts/chart-card";
import { ColumnChart, type ColumnDatum } from "@/components/charts/column-chart";
import { formatCompact, formatCompactCurrency, formatPercent } from "@/components/charts/scale";
import { SplitBar } from "@/components/charts/split-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import type { DailyAnalytics, DoctorAnalyticsSummary, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  addDays,
  cn,
  formatCurrency,
  formatDayShort,
  paymentModeLabels,
  weekStart,
} from "@/lib/format";
import { useKeyedLoad } from "./use-keyed-load";

type Preset = "today" | "7" | "30" | "custom";
type Grouping = "day" | "week" | "month";
type RevenueSplit = "fee" | "mode";

const FEE_SERIES: SeriesSpec[] = [
  { key: "consultation", label: "Consultation", colorClass: "bg-chart-1" },
  { key: "vaccination", label: "Vaccination", colorClass: "bg-chart-2" },
  { key: "other", label: "Other", colorClass: "bg-chart-3" },
];

const MODE_SERIES: SeriesSpec[] = [
  { key: "cash", label: paymentModeLabels.cash, colorClass: "bg-chart-1" },
  { key: "upi", label: paymentModeLabels.upi, colorClass: "bg-chart-2" },
  { key: "card", label: paymentModeLabels.card, colorClass: "bg-chart-3" },
];

const PATIENT_SERIES: SeriesSpec[] = [
  { key: "patients", label: "Children seen", colorClass: "bg-chart-1" },
];

const PHARMACY_SERIES: SeriesSpec[] = [
  { key: "pharmacy", label: "Pharmacy sales", colorClass: "bg-chart-1" },
];

const HOUR_SERIES: SeriesSpec[] = [
  { key: "count", label: "Check-ins", colorClass: "bg-chart-1" },
];

const METRICS = [
  "patients",
  "consultation",
  "vaccination",
  "other",
  "cash",
  "upi",
  "card",
  "pharmacy",
  "pharmacyOrders",
] as const;

interface Bucket {
  key: string;
  label: string;
  fullLabel: string;
  values: Record<(typeof METRICS)[number], number>;
}

function monthLabel(date: string, withYear = false): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** Rolls zero-filled days up into weeks (from Monday) or calendar months. */
function groupDays(days: DailyAnalytics[], grouping: Grouping): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const day of days) {
    const key =
      grouping === "day" ? day.date : grouping === "week" ? weekStart(day.date) : day.date.slice(0, 7);
    let bucket = buckets.get(key);
    if (!bucket) {
      const date = grouping === "month" ? `${key}-01` : key;
      bucket = {
        key,
        label:
          grouping === "month"
            ? monthLabel(date)
            : grouping === "week"
              ? formatDayShort(date).replace(/^\w+, /, "")
              : String(Number(date.slice(8))),
        fullLabel:
          grouping === "month"
            ? monthLabel(date, true)
            : grouping === "week"
              ? `Week of ${formatDayShort(date)}`
              : formatDayShort(date),
        values: {
          patients: 0,
          consultation: 0,
          vaccination: 0,
          other: 0,
          cash: 0,
          upi: 0,
          card: 0,
          pharmacy: 0,
          pharmacyOrders: 0,
        },
      };
      buckets.set(key, bucket);
    }
    for (const metric of METRICS) bucket.values[metric] += day[metric];
  }
  return [...buckets.values()];
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

function rangeFor(preset: Preset, today: string, custom: { from: string; to: string }) {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7":
      return { from: addDays(today, -6), to: today };
    case "30":
      return { from: addDays(today, -29), to: today };
    case "custom":
      return custom;
  }
}

/** Patients, revenue, and visit-mix trends over a chosen range. */
export function TrendsView({ clinicId, today }: { clinicId: UUID; today: string }) {
  const [preset, setPreset] = useState<Preset>("7");
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [grouping, setGrouping] = useState<Grouping>("day");
  const [revenueSplit, setRevenueSplit] = useState<RevenueSplit>("fee");

  const range = rangeFor(preset, today, custom);
  const { data, error, stale } = useKeyedLoad(`${clinicId}:${range.from}:${range.to}`, () =>
    getBrowserApi().analytics.getDoctorAnalytics(clinicId, range)
  );

  return (
    <div className="flex flex-col gap-4">
      {/* The one filter row: everything below follows it. */}
      <div className="flex flex-wrap items-end gap-3">
        <Segmented<Preset>
          label="Date range"
          value={preset}
          onChange={setPreset}
          options={[
            { value: "today", label: "Today" },
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-2">
            <DateInput
              label="From"
              value={custom.from}
              max={custom.to}
              onChange={(from) => setCustom((current) => ({ ...current, from }))}
            />
            <DateInput
              label="To"
              value={custom.to}
              min={custom.from}
              max={today}
              onChange={(to) => setCustom((current) => ({ ...current, to }))}
            />
          </div>
        )}
        {preset !== "today" && (
          <Segmented<Grouping>
            label="Group by"
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        )}
      </div>

      {error ? (
        <ErrorState message={error} />
      ) : !data ? (
        <div className="grid gap-3 @2xl:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="col-span-full h-64 w-full" />
        </div>
      ) : (
        <div className={cn("transition-opacity", stale && "opacity-60")} aria-busy={stale}>
          <TrendsBody
            data={data}
            grouping={preset === "today" ? "day" : grouping}
            revenueSplit={revenueSplit}
            onRevenueSplitChange={setRevenueSplit}
          />
        </div>
      )}
    </div>
  );
}

function TrendsBody({
  data,
  grouping,
  revenueSplit,
  onRevenueSplitChange,
}: {
  data: DoctorAnalyticsSummary;
  grouping: Grouping;
  revenueSplit: RevenueSplit;
  onRevenueSplitChange: (split: RevenueSplit) => void;
}) {
  const buckets = groupDays(data.daily, grouping);
  const days = Math.max(1, data.daily.length);
  const patients = data.daily.reduce((sum, day) => sum + day.patients, 0);
  const revenue = data.daily.reduce(
    (sum, day) => sum + day.consultation + day.vaccination + day.other,
    0
  );
  const pharmacy = data.daily.reduce((sum, day) => sum + day.pharmacy, 0);
  const pharmacyOrders = data.daily.reduce((sum, day) => sum + day.pharmacyOrders, 0);
  // Revenue split by what the doctor entered on each visit summary.
  const fees = {
    consultation: data.daily.reduce((sum, day) => sum + day.consultation, 0),
    vaccination: data.daily.reduce((sum, day) => sum + day.vaccination, 0),
    other: data.daily.reduce((sum, day) => sum + day.other, 0),
  };
  const feeShare = (amount: number) =>
    revenue > 0 ? `${Math.round((amount / revenue) * 100)}% of visit fees` : undefined;

  if (patients === 0 && data.tokens.total === 0 && pharmacyOrders === 0) {
    return (
      <EmptyState
        title="Nothing in this range yet"
        description="Completed visits show up here as soon as they're saved."
      />
    );
  }

  const revenueSeries = revenueSplit === "fee" ? FEE_SERIES : MODE_SERIES;
  const columns: ColumnDatum[] = buckets.map((bucket) => ({
    label: bucket.label,
    fullLabel: bucket.fullLabel,
    values: bucket.values,
  }));

  const hours = hourColumns(data.checkInHours);
  const interrupted = data.tokens.skipped + data.tokens.removed;
  const appointmentsDue = data.appointments.attended + data.appointments.missed;
  const unit = grouping === "day" ? "Day" : grouping === "week" ? "Week" : "Month";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <StatTile
          label="Children seen"
          value={patients}
          hint={days > 1 && patients > 0 ? `${perDay(patients / days)} a day on average` : undefined}
        />
        <StatTile
          label="Total collected"
          value={formatCurrency(revenue + pharmacy)}
          hint={
            days > 1
              ? `${formatCurrency(Math.round((revenue + pharmacy) / days))} a day on average`
              : "Consultations and pharmacy"
          }
        />
        <StatTile label="Visit fees" value={formatCurrency(revenue)} hint="All consultation-visit money" />
        <StatTile
          label="Pharmacy sales"
          value={formatCurrency(pharmacy)}
          hint={`${pharmacyOrders} ${pharmacyOrders === 1 ? "order" : "orders"} dispensed`}
        />
        <StatTile
          label="Average consultation"
          value={
            data.averageConsultationMinutes === null
              ? "—"
              : `${Math.round(data.averageConsultationMinutes)} min`
          }
        />
        <StatTile
          label="Skipped or removed"
          value={formatPercent(interrupted, data.tokens.total)}
          hint={`${interrupted} of ${data.tokens.total} tokens`}
        />
        <StatTile
          label="Appointments kept"
          value={formatPercent(data.appointments.attended, appointmentsDue)}
          hint={
            appointmentsDue > 0
              ? `${data.appointments.attended} attended · ${data.appointments.missed} missed`
              : "None due in this range"
          }
        />
        <StatTile
          label="Follow-ups returned"
          value={formatPercent(data.followUps.returned, data.followUps.due)}
          hint={
            data.followUps.due > 0
              ? `${data.followUps.returned} of ${data.followUps.due} came back`
              : "None due in this range"
          }
        />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="fee-split-title">
        <h3 id="fee-split-title" className="font-semibold text-foreground">
          Revenue by fee type
        </h3>
        <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-3">
          <StatTile
            label="Consultation fees"
            value={formatCurrency(fees.consultation)}
            hint={feeShare(fees.consultation)}
          />
          <StatTile
            label="Vaccination fees"
            value={formatCurrency(fees.vaccination)}
            hint={feeShare(fees.vaccination)}
          />
          {fees.other > 0 && (
            <StatTile
              label="Other fees"
              value={formatCurrency(fees.other)}
              hint={feeShare(fees.other)}
            />
          )}
        </div>
      </section>

      <div className="grid gap-4 @4xl:grid-cols-2">
        <ChartCard
          title="Children seen"
          subtitle={`Completed visits per ${unit.toLowerCase()}`}
          table={
            <DataTable
              columns={[unit, "Children"]}
              rows={buckets.map((bucket) => [bucket.fullLabel, bucket.values.patients])}
            />
          }
        >
          <ColumnChart
            data={columns}
            series={PATIENT_SERIES}
            integer
            formatValue={String}
            formatTick={formatCompact}
          />
        </ChartCard>

        <ChartCard
          title="Consultation revenue"
          subtitle={revenueSplit === "fee" ? "By fee type" : "By payment mode"}
          legend={revenueSeries}
          controls={
            <Segmented<RevenueSplit>
              label="Split revenue by"
              value={revenueSplit}
              onChange={onRevenueSplitChange}
              options={[
                { value: "fee", label: "Fee type" },
                { value: "mode", label: "Payment mode" },
              ]}
            />
          }
          table={
            <DataTable
              columns={[unit, ...revenueSeries.map((item) => item.label), "Total"]}
              rows={buckets.map((bucket) => {
                const values = revenueSeries.map(
                  (item) => bucket.values[item.key as keyof Bucket["values"]]
                );
                return [
                  bucket.fullLabel,
                  ...values.map(formatCurrency),
                  formatCurrency(values.reduce((sum, value) => sum + value, 0)),
                ];
              })}
            />
          }
        >
          <ColumnChart
            data={columns}
            series={revenueSeries}
            formatValue={formatCurrency}
            formatTick={formatCompactCurrency}
          />
        </ChartCard>

        <ChartCard
          title="Pharmacy sales"
          subtitle={`Medicines dispensed per ${unit.toLowerCase()}`}
          table={
            <DataTable
              columns={[unit, "Orders", "Sales"]}
              rows={buckets.map((bucket) => [
                bucket.fullLabel,
                bucket.values.pharmacyOrders,
                formatCurrency(bucket.values.pharmacy),
              ])}
            />
          }
        >
          <ColumnChart
            data={columns}
            series={PHARMACY_SERIES}
            formatValue={formatCurrency}
            formatTick={formatCompactCurrency}
          />
        </ChartCard>

        <ChartCard
          title="Booked appointments"
          subtitle="Did children with a booking turn up? Bookings still ahead aren't counted."
          table={
            <DataTable
              columns={["", "Children", "Share"]}
              rows={[
                ["Attended", data.appointments.attended, formatPercent(data.appointments.attended, appointmentsDue)],
                ["Missed", data.appointments.missed, formatPercent(data.appointments.missed, appointmentsDue)],
              ]}
            />
          }
        >
          {appointmentsDue === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">
              No booked appointments were due in this range.
            </p>
          ) : (
            <SplitBar
              title={`${appointmentsDue} booked ${appointmentsDue === 1 ? "appointment" : "appointments"} due`}
              parts={[
                { label: "Attended", value: data.appointments.attended, colorClass: "bg-chart-1" },
                { label: "Missed", value: data.appointments.missed, colorClass: "bg-chart-2" },
              ]}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Visit mix"
          table={
            <DataTable
              columns={["", "Count", "Share"]}
              rows={[
                ...mixRows("Vaccination", data.visitReasons.vaccination, "General checkup", data.visitReasons.general_checkup),
                ...mixRows("New", data.newVsReturning.new, "Returning", data.newVsReturning.returning),
                ...mixRows("Same-day tokens", data.walkInsVsAppointments.walkIns, "Booked appointments", data.walkInsVsAppointments.appointments),
              ]}
            />
          }
        >
          <div className="flex flex-col gap-5">
            <SplitBar
              title="Reason for visit"
              parts={[
                { label: "Vaccination", value: data.visitReasons.vaccination, colorClass: "bg-chart-1" },
                { label: "General checkup", value: data.visitReasons.general_checkup, colorClass: "bg-chart-2" },
              ]}
            />
            <SplitBar
              title="New vs returning children"
              parts={[
                { label: "New", value: data.newVsReturning.new, colorClass: "bg-chart-1" },
                { label: "Returning", value: data.newVsReturning.returning, colorClass: "bg-chart-2" },
              ]}
            />
            <SplitBar
              title="How they joined the queue"
              parts={[
                { label: "Same-day tokens", value: data.walkInsVsAppointments.walkIns, colorClass: "bg-chart-1" },
                { label: "Booked appointments", value: data.walkInsVsAppointments.appointments, colorClass: "bg-chart-2" },
              ]}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Busiest check-in hours"
          subtitle="Tokens taken, by hour of the day"
          table={
            <DataTable
              columns={["Hour", "Check-ins"]}
              rows={hours.map((hour) => [hour.fullLabel ?? hour.label, hour.values.count])}
            />
          }
        >
          {hours.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">No check-ins yet.</p>
          ) : (
            <ColumnChart
              data={hours}
              series={HOUR_SERIES}
              integer
              formatValue={String}
              formatTick={formatCompact}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function mixRows(aLabel: string, a: number, bLabel: string, b: number): (string | number)[][] {
  return [
    [aLabel, a, formatPercent(a, a + b)],
    [bLabel, b, formatPercent(b, a + b)],
  ];
}

/** Every hour from the first check-in hour to the last, gaps zero-filled. */
function hourColumns(hours: { hour: number; count: number }[]): ColumnDatum[] {
  if (hours.length === 0) return [];
  const counts = new Map(hours.map((item) => [item.hour, item.count]));
  const first = Math.min(...counts.keys());
  const last = Math.max(...counts.keys());
  const columns: ColumnDatum[] = [];
  for (let hour = first; hour <= last; hour += 1) {
    columns.push({
      label: formatHour(hour),
      fullLabel: `${formatHour(hour)} – ${formatHour((hour + 1) % 24)}`,
      values: { count: counts.get(hour) ?? 0 },
    });
  }
  return columns;
}

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-foreground">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="min-h-11 rounded-full border border-border bg-surface-raised px-3 text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-primary-500"
      />
    </label>
  );
}

/** "4.5", or "under 1" for thin ranges where rounding would read as zero. */
function perDay(value: number): string {
  return value < 1 ? "under 1" : formatCompact(Math.round(value * 10) / 10);
}
