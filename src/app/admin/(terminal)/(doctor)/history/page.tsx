"use client";

import { ChevronLeft, ChevronRight, History, Search, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  PatientTimelineSheet,
  type TimelinePatient,
} from "@/components/admin/patient-timeline-sheet";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import type { ConsultedChild, DayPatient, UUID, VisitReason } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  addDays,
  cn,
  errorMessage,
  formatAge,
  formatDate,
  formatDayShort,
  formatPhone,
  visitReasonLabels,
} from "@/lib/format";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

/**
 * The doctor's patient directory — only children who have actually been
 * consulted. By default: today's completed consultations, live. Any other day
 * is a tap away, and search reaches every consulted child by child name,
 * parent name or phone.
 */
export default function PatientHistoryPage() {
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<VisitReason | "all">("all");
  const [open, setOpen] = useState<TimelinePatient | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        setClinicId(staff?.clinicId ?? null);
        setToday(window.today);
        setDate(window.today);
      })
      .catch((caught) => setSetupError(errorMessage(caught)));
  }, []);

  // --- the day's patients ---------------------------------------------------
  const [day, setDay] = useState<
    { date: string; patients: DayPatient[] } | { date: string; error: string } | null
  >(null);

  const loadDay = useCallback(() => {
    if (!clinicId || !date) return;
    return getBrowserApi()
      .visits.listPatientsOn(clinicId, date)
      .then((patients) => setDay({ date, patients }))
      .catch((caught) => setDay({ date, error: errorMessage(caught) }));
  }, [clinicId, date]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  // Today's list follows the queue as it moves.
  useLiveRefresh("queue", date === today ? clinicId : null, loadDay);

  // --- search (debounced) ---------------------------------------------------
  const trimmed = query.trim();
  const [search, setSearch] = useState<
    { query: string; results: ConsultedChild[] } | { query: string; error: string } | null
  >(null);

  useEffect(() => {
    if (!clinicId || trimmed === "") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getBrowserApi()
        .visits.searchConsultedChildren(clinicId, trimmed)
        .then((results) => {
          if (!cancelled) setSearch({ query: trimmed, results });
        })
        .catch((caught) => {
          if (!cancelled) setSearch({ query: trimmed, error: errorMessage(caught) });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clinicId, trimmed]);

  const searching = trimmed !== "";
  const currentSearch = search?.query === trimmed ? search : null;
  const currentDay = day?.date === date ? day : null;

  const dayPatients =
    currentDay && "patients" in currentDay
      ? currentDay.patients.filter(
          (patient) => reasonFilter === "all" || patient.reason === reasonFilter
        )
      : [];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-col gap-3 px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patient history</h1>
          <p className="text-sm text-foreground-muted">
            Children who have been consulted. Tap one to see every past consultation.
          </p>
        </div>

        <div className="relative max-w-2xl">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-foreground-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search child, parent or phone"
            aria-label="Search patients by child name, parent name or phone number"
            className="min-h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-11 text-base text-foreground placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-1 focus:outline-primary-500"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {setupError ? (
        <ErrorState message={setupError} onRetry={() => window.location.reload()} />
      ) : searching ? (
        <section className="flex flex-col gap-3 px-5 py-3" aria-live="polite">
          {!currentSearch ? (
            <Skeleton className="h-20 w-full max-w-2xl" />
          ) : "error" in currentSearch ? (
            <ErrorState message={currentSearch.error} />
          ) : currentSearch.results.length === 0 ? (
            <EmptyState
              icon={<Search className="size-8" />}
              title="No one found"
              description="Only children who have had a consultation are listed. Try part of the child's name, the parent's name, or the phone number."
            />
          ) : (
            <>
              <p className="text-sm text-foreground-muted">
                {currentSearch.results.length}{" "}
                {currentSearch.results.length === 1 ? "child" : "children"} found
              </p>
              <ul className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
                {currentSearch.results.map((result) => (
                  <li key={result.childId}>
                    <PatientCard
                      onOpen={() =>
                        setOpen({
                          childId: result.childId,
                          childName: result.childName,
                          childDob: result.dob,
                          parentName: result.parentName,
                          parentPhone: result.parentPhone,
                        })
                      }
                      name={result.childName}
                      dob={result.dob}
                      parentName={result.parentName}
                      parentPhone={result.parentPhone}
                      footer={`${result.consultationCount} ${
                        result.consultationCount === 1 ? "consultation" : "consultations"
                      } · last ${formatDate(result.lastConsultationDate)}`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3 px-5 py-3">
          {date && today && (
            <DayPicker date={date} today={today} onChange={setDate} />
          )}

          <div className="flex flex-col gap-2">
            <FilterRow label="Reason">
              <FilterChip active={reasonFilter === "all"} onClick={() => setReasonFilter("all")}>
                All reasons
              </FilterChip>
              {(Object.keys(visitReasonLabels) as VisitReason[]).map((reason) => (
                <FilterChip
                  key={reason}
                  active={reasonFilter === reason}
                  onClick={() => setReasonFilter(reason)}
                >
                  {visitReasonLabels[reason]}
                </FilterChip>
              ))}
            </FilterRow>
          </div>

          {!currentDay ? (
            <div className="grid gap-3 @2xl:grid-cols-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : "error" in currentDay ? (
            <ErrorState message={currentDay.error} onRetry={() => void loadDay()} />
          ) : currentDay.patients.length === 0 ? (
            <EmptyState
              icon={<History className="size-8" />}
              title={date === today ? "No consultations yet today" : "No consultations that day"}
              description="Children appear here once their consultation is completed. Pick another day, or search."
            />
          ) : dayPatients.length === 0 ? (
            <EmptyState
              title="No one matches"
              description="Try another reason."
              action={
                <button
                  type="button"
                  onClick={() => setReasonFilter("all")}
                  className="min-h-12 rounded-lg px-4 font-semibold text-primary-600"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <>
              <p className="text-sm text-foreground-muted" aria-live="polite">
                {dayPatients.length} {dayPatients.length === 1 ? "consultation" : "consultations"}
              </p>
              <ul className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
                {dayPatients.map((patient) => (
                  <li key={patient.visitId}>
                    <PatientCard
                      onOpen={() =>
                        setOpen({
                          childId: patient.childId,
                          childName: patient.childName,
                          childDob: patient.childDob,
                          parentName: patient.parentName,
                          parentPhone: patient.parentPhone,
                        })
                      }
                      token={patient.seq}
                      name={patient.childName}
                      dob={patient.childDob}
                      parentName={patient.parentName}
                      parentPhone={patient.parentPhone}
                      footer={`${visitReasonLabels[patient.reason]} · ${patient.visitCount} ${
                        patient.visitCount === 1 ? "consultation" : "consultations"
                      } in total`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {open && <PatientTimelineSheet patient={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Today by default; step a day either way, or jump to any date. */
function DayPicker({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const label =
    date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : formatDayShort(date);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl border border-border bg-surface">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => onChange(addDays(date, -1))}
          className="flex size-12 items-center justify-center rounded-l-xl text-foreground hover:bg-surface-sunken"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-28 px-2 text-center font-semibold text-foreground" aria-live="polite">
          {label}
        </span>
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => onChange(addDays(date, 1))}
          className="flex size-12 items-center justify-center rounded-r-xl text-foreground hover:bg-surface-sunken disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <label className="sr-only" htmlFor="history-date">
        Pick a day
      </label>
      <input
        id="history-date"
        type="date"
        max={today}
        value={date}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-primary-500"
      />
      {date !== today && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="min-h-12 rounded-xl px-3 font-semibold text-primary-600 hover:bg-surface-sunken"
        >
          Back to today
        </button>
      )}
    </div>
  );
}

function PatientCard({
  onOpen,
  token,
  name,
  dob,
  parentName,
  parentPhone,
  status,
  footer,
}: {
  onOpen: () => void;
  token?: number;
  name: string;
  dob: string;
  parentName: string | null;
  parentPhone: string;
  status?: ReactNode;
  footer: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full items-start gap-3 rounded-xl border border-border bg-surface-raised p-4 text-left shadow-sm transition-colors hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-primary-500"
    >
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-bold tabular-nums text-foreground"
      >
        {token ?? name.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold text-foreground">{name}</span>
          {status}
        </span>
        <span className="text-sm text-foreground-muted">
          {formatAge(dob)} · {parentName || "Parent's name not given"}
        </span>
        <span className="text-sm text-foreground-muted">{formatPhone(parentPhone)}</span>
        <span className="text-sm font-medium text-foreground">{footer}</span>
      </span>
      <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-foreground-muted" />
    </button>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={`Filter by ${label.toLowerCase()}`}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
    >
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary-600 bg-primary-600 text-foreground-on-primary"
          : "border-border bg-surface text-foreground hover:bg-surface-sunken"
      )}
    >
      {children}
    </button>
  );
}
