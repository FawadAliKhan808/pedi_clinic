"use client";

import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  ListOrdered,
  Pencil,
  Stethoscope,
  Syringe,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { AddChildSheet } from "@/components/parent/add-child-sheet";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  BookingWindow,
  Child,
  ChildVisitHistoryEntry,
  ParentAppointment,
  ParentQueueEntry,
  VisitReason,
} from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatAge,
  formatCurrency,
  formatDate,
  formatDayShort,
  formatSession,
  visitReasonLabels,
} from "@/lib/format";

interface ChildDetail {
  child: Child;
  window: BookingWindow;
  /** Finished visits, newest first. */
  visits: ChildVisitHistoryEntry[];
  /** Confirmed bookings from today on, soonest first. */
  upcoming: ParentAppointment[];
  /** Today's token while it's still in play. */
  token: ParentQueueEntry | null;
}

const reasonIcons: Record<VisitReason, typeof Syringe> = {
  vaccination: Syringe,
  general_checkup: Stethoscope,
};

/** Null when signed out; "missing" when this child isn't the parent's (or was deleted). */
async function loadChildDetail(childId: string): Promise<ChildDetail | "missing" | null> {
  const api = getBrowserApi();
  if (!(await api.auth.getCurrentUserId())) return null;

  const [children, window, history, appointments, queue] = await Promise.all([
    api.parents.listMyChildren(),
    api.appointments.getBookingWindow(),
    api.visits.getChildHistory(childId).catch(() => [] as ChildVisitHistoryEntry[]),
    api.appointments.listMyAppointments(),
    api.queue.getParentQueueView(),
  ]);
  const child = children.find((item) => item.id === childId);
  if (!child) return "missing";

  return {
    child,
    window,
    visits: history
      .filter((visit) => visit.status === "completed")
      .sort((a, b) => (b.completedAt ?? b.visitDate).localeCompare(a.completedAt ?? a.visitDate)),
    upcoming: appointments
      .filter((item) => item.childId === childId && item.status === "booked" && item.date >= window.today)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    token:
      queue.find(
        (entry) =>
          entry.childId === childId &&
          ["waiting", "called", "in_consultation", "skipped"].includes(entry.status)
      ) ?? null,
  };
}

/**
 * One child, in one place: who they are, whether they're in today's queue,
 * what's booked, and every past visit. Editing their details lives here too.
 */
export default function ChildDetailPage() {
  const router = useRouter();
  const { childId } = useParams<{ childId: string }>();
  const [data, setData] = useState<ChildDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(
    () =>
      loadChildDetail(childId)
        .then((result) => {
          if (result === null) router.replace("/");
          // Not theirs, or just deleted from the edit sheet: back to Home.
          else if (result === "missing") router.replace("/");
          else setData(result);
        })
        .catch((caught) => setLoadError(errorMessage(caught))),
    [childId, router]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const today = data?.window.today;
  const nextFollowUp =
    data && today
      ? data.visits
          .map((visit) => visit.followUpDate)
          .filter((date): date is string => Boolean(date) && date! >= today)
          .sort()[0] ?? null
      : null;

  return (
    <ParentShell>
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <Link
          href="/"
          aria-label="Back to Home"
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-raised"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="truncate text-xl font-bold text-foreground">
          {data?.child.name ?? "Child"}
        </h1>
      </header>

      {data === null && loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : data === null ? (
        <div className="flex w-full max-w-2xl flex-col gap-4 px-5 py-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <div className="flex w-full max-w-2xl flex-col gap-6 px-5 py-3 pb-8">
          {/* Who they are */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display text-2xl font-bold text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
              >
                {data.child.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-bold text-foreground">
                  {data.child.name}
                </p>
                <p className="text-sm text-foreground-muted">{formatAge(data.child.dob)}</p>
                <p className="text-sm text-foreground-muted">Born {formatDate(data.child.dob)}</p>
              </div>
            </div>

            {data.token && (
              <Link
                href="/queue"
                className="flex min-h-12 items-center gap-3 rounded-lg bg-primary-50 px-4 py-2 dark:bg-primary-900/30"
              >
                <ListOrdered aria-hidden className="size-5 shrink-0 text-primary-700 dark:text-primary-300" />
                <span className="flex-1 text-sm font-semibold text-foreground">
                  In today&apos;s queue · Token {data.token.seq}
                </span>
                <StatusPill status={data.token.status} />
                <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-muted" />
              </Link>
            )}

            <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-4" />
              Edit child details
            </Button>
          </Card>

          {/* At a glance */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Visits" value={String(data.visits.length)} />
            <Stat
              label="Last visit"
              value={data.visits[0] ? dayMonth(data.visits[0].visitDate) : "—"}
            />
            <Stat label="Next follow-up" value={nextFollowUp ? dayMonth(nextFollowUp) : "—"} />
          </div>

          <Section title="Upcoming appointments">
            {data.upcoming.length === 0 ? (
              <Card className="flex flex-col items-start gap-3">
                <p className="text-sm text-foreground-muted">
                  No appointments booked for {data.child.name}.
                </p>
                <Link
                  href="/appointments/book"
                  className="flex min-h-12 items-center gap-2 font-display font-bold text-primary-700 dark:text-primary-300"
                >
                  <CalendarPlus aria-hidden className="size-5" />
                  Book an appointment
                </Link>
              </Card>
            ) : (
              data.upcoming.map((appointment) => (
                <Card key={appointment.appointmentId} className="flex items-center gap-3">
                  <CalendarClock aria-hidden className="size-5 shrink-0 text-primary-700 dark:text-primary-300" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      {formatDayShort(appointment.date)} ·{" "}
                      {formatSession(appointment, data.window.sessionPresets)}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {visitReasonLabels[appointment.visitReason]}
                    </p>
                  </div>
                  <AppointmentStatusPill status={appointment.status} />
                </Card>
              ))
            )}
          </Section>

          <Section title="Past visits">
            {data.visits.length === 0 ? (
              <EmptyState
                title="No visits yet"
                description={`${data.child.name}'s visits appear here once they've seen the doctor.`}
              />
            ) : (
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-raised shadow-md">
                {data.visits.map((visit) => {
                  const ReasonIcon = reasonIcons[visit.reason];
                  return (
                    <Link
                      key={visit.visitId}
                      href={`/visits/${visit.visitId}`}
                      className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-sunken"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        <ReasonIcon aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-foreground">
                          {formatDate(visit.visitDate)}
                        </span>
                        <span className="block text-sm text-foreground-muted">
                          {visitReasonLabels[visit.reason]}
                          {visit.followUpDate ? ` · Follow-up ${formatDayShort(visit.followUpDate)}` : ""}
                        </span>
                      </span>
                      {visit.feeTotal !== null && (
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {formatCurrency(visit.feeTotal)}
                        </span>
                      )}
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-muted" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      )}

      {data && editing && (
        <AddChildSheet
          key={data.child.id}
          open
          child={data.child}
          onClose={() => setEditing(false)}
          onChanged={() => void load()}
        />
      )}
    </ParentShell>
  );
}

/** "27 Sept": short enough for a third of a phone. */
function dayMonth(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
      <span className="text-xs text-foreground-muted">{label}</span>
      <span className="truncate font-display text-lg font-bold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-foreground-muted">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
