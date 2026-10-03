"use client";

import { CalendarCheck, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AddWalkInSheet } from "@/components/admin/add-walk-in-sheet";
import { ChildHistorySheet } from "@/components/visits/child-history-sheet";
import { CompleteVisitFlow } from "@/components/admin/complete-visit-flow";
import { SearchChildrenSheet } from "@/components/admin/search-children-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import type { DoctorQueueEntry, EndOfDaySummary, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, formatAge, formatDayShort, visitReasonLabels } from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";

type QueueAction = "call" | "recall" | "startConsultation" | "skip" | "remove";

/** The one action the doctor most likely wants next, given where the visit is. */
function primaryAction(
  status: DoctorQueueEntry["status"]
): { label: string; action: QueueAction } | null {
  switch (status) {
    case "waiting":
      return { label: "Call", action: "call" };
    case "called":
      return { label: "Start consultation", action: "startConsultation" };
    case "skipped":
      return { label: "Recall", action: "recall" };
    default:
      return null;
  }
}

/** Completing is its own flow, not a one-tap action, so it sits outside `act`. */
function opensCompletion(status: DoctorQueueEntry["status"]): boolean {
  return status === "in_consultation";
}

export default function DoctorQueuePage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(() => lastShown<UUID>("staff-clinic") ?? null);
  const [entries, setEntries] = useState<DoctorQueueEntry[] | null>(
    () => lastShown<DoctorQueueEntry[]>("doctor-queue") ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingVisitId, setPendingVisitId] = useState<UUID | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [childSheetFor, setChildSheetFor] = useState<{
    childId: UUID;
    childName: string;
    childDob: string;
    parentName: string | null;
    parentPhone: string;
  } | null>(null);
  const [completingVisit, setCompletingVisit] = useState<DoctorQueueEntry | null>(null);
  const [today, setToday] = useState<string | null>(() => lastShown<string>("clinic-today") ?? null);
  const [daySummary, setDaySummary] = useState<EndOfDaySummary | null>(
    () => lastShown<EndOfDaySummary>("doctor-day-summary") ?? null
  );
  // Read by refresh without making it a dependency: "today" arriving must not refetch the queue.
  const todayRef = useRef(today);

  useEffect(() => {
    todayRef.current = today;
  }, [today]);
  // Coming back to Queue shows the last queue at once while a fresh one loads.
  useRememberShown("staff-clinic", clinicId);
  useRememberShown("doctor-queue", entries);
  useRememberShown("clinic-today", today);
  useRememberShown("doctor-day-summary", daySummary);

  useEffect(() => {
    const api = getBrowserApi();
    void api.auth
      .getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
    // Only for the summary line; the queue works without it.
    void api.appointments
      .getBookingWindow()
      .then((window) => setToday(window.today))
      .catch(() => undefined);
  }, [toast]);

  const refreshSummary = useCallback(() => {
    const day = todayRef.current;
    if (!clinicId || !day) return;
    void getBrowserApi()
      .analytics.getEndOfDaySummary(clinicId, day)
      .then(setDaySummary)
      .catch(() => undefined);
  }, [clinicId]);

  // The summary's first load waits for "today"; later ones ride along with each refresh.
  useEffect(() => {
    if (today) refreshSummary();
  }, [today, refreshSummary]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    const api = getBrowserApi();
    refreshSummary();
    return api.queue
      .getDoctorQueue(clinicId)
      .then(setEntries)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [clinicId, refreshSummary, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!clinicId) return;
    return getBrowserApi().realtime.subscribeToQueue(clinicId, () => {
      void refresh().catch(() => undefined);
    });
  }, [clinicId, refresh]);

  async function act(visitId: UUID, action: QueueAction) {
    setPendingVisitId(visitId);
    try {
      const api = getBrowserApi();
      const updated = await api.queue[action](visitId);
      // Calling, recalling, skipping or removing can each create a
      // "your turn" / "3rd in line" notification; push it out now.
      void api.notifications.dispatchPending();
      // Show the new status the moment the server confirms it; the full
      // refetch (new order, other changes) follows without holding the button.
      setEntries((current) =>
        current
          ?.map((entry) => (entry.visitId === visitId ? { ...entry, status: updated.status } : entry))
          .filter((entry) => entry.status !== "removed" && entry.status !== "completed") ?? null
      );
      void refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setPendingVisitId(null);
    }
  }

  const openChild = (entry: DoctorQueueEntry) =>
    setChildSheetFor({
      childId: entry.childId,
      childName: entry.childName,
      childDob: entry.childDob,
      parentName: entry.parentName,
      parentPhone: entry.parentPhone,
    });

  const withDoctor = (entries ?? []).filter(
    (entry) => entry.status === "in_consultation" || entry.status === "called"
  );
  const waiting = (entries ?? []).filter((entry) => entry.status === "waiting");
  const skipped = (entries ?? []).filter((entry) => entry.status === "skipped");
  const [nextUp, ...laterWaiting] = waiting;

  const card = (entry: DoctorQueueEntry, emphasis: CardEmphasis) => (
    <QueueCard
      key={entry.visitId}
      entry={entry}
      emphasis={emphasis}
      pending={pendingVisitId === entry.visitId}
      onOpenChild={() => openChild(entry)}
      onAct={(action) => void act(entry.visitId, action)}
      onComplete={() => setCompletingVisit(entry)}
    />
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-start justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Queue</h1>
          {today && <p className="text-sm text-foreground-muted">Today, {formatDayShort(today)}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Search children"
            onClick={() => setSearchOpen(true)}
            className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
          >
            <Search className="size-5" />
          </button>
          <button
            aria-label="Add walk-in"
            onClick={() => setWalkInOpen(true)}
            className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </header>

      {entries !== null && (
        <dl className="grid grid-cols-3 gap-2 px-5 py-2">
          <DayStat label="Waiting" value={waiting.length} />
          <DayStat label="Seen today" value={daySummary?.patientsSeen} />
          <DayStat label="Bookings to arrive" value={daySummary?.appointments.notArrived} />
        </dl>
      )}

      <div className="flex flex-col gap-5 px-5 py-3">
        {entries === null && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : entries === null ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No one in the queue"
            description="Tokens appear here the moment a parent checks in."
            action={<Button onClick={() => setWalkInOpen(true)}>Add walk-in</Button>}
          />
        ) : (
          <>
            {withDoctor.length > 0 && (
              <QueueSection title="With you now">{withDoctor.map((entry) => card(entry, "now"))}</QueueSection>
            )}
            {nextUp && <QueueSection title="Next up">{card(nextUp, "next")}</QueueSection>}
            {laterWaiting.length > 0 && (
              <QueueSection title={`Waiting · ${laterWaiting.length}`}>
                {laterWaiting.map((entry) => card(entry, "compact"))}
              </QueueSection>
            )}
            {skipped.length > 0 && (
              <QueueSection title={`Skipped · ${skipped.length}`}>
                {skipped.map((entry) => card(entry, "compact"))}
              </QueueSection>
            )}
          </>
        )}
      </div>

      {childSheetFor && (
        <ChildHistorySheet
          open
          {...childSheetFor}
          onClose={() => setChildSheetFor(null)}
        />
      )}

      {completingVisit && (
        <CompleteVisitFlow
          // Keyed by visit: every consultation starts with an empty form (follow-up included).
          key={completingVisit.visitId}
          open
          visitId={completingVisit.visitId}
          childName={completingVisit.childName}
          onClose={() => setCompletingVisit(null)}
          onCompleted={() => void refresh()}
        />
      )}

      {clinicId && (
        <>
          <SearchChildrenSheet
            clinicId={clinicId}
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onSelectChild={(result) => {
              setSearchOpen(false);
              setChildSheetFor({
                childId: result.childId,
                childName: result.childName,
                childDob: result.dob,
                parentName: result.parentName,
                parentPhone: result.parentPhone,
              });
            }}
          />
          <AddWalkInSheet
            clinicId={clinicId}
            open={walkInOpen}
            onClose={() => setWalkInOpen(false)}
            onAdded={() => void refresh()}
          />
        </>
      )}
    </div>
  );
}

type CardEmphasis = "now" | "next" | "compact";

function QueueSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{title}</h2>
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">{children}</div>
    </section>
  );
}

/** A number for the day; "–" until the summary loads (or if it can't). */
function DayStat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-raised px-3 py-2">
      <dt className="order-2 text-xs text-foreground-muted">{label}</dt>
      <dd className="order-1 text-2xl font-bold tabular-nums text-foreground">{value ?? "–"}</dd>
    </div>
  );
}

/**
 * "now": the child with the doctor, set apart in the accent colour.
 * "next": the next child to call, with one large Call button.
 * "compact": everyone after that — the same actions in a single row.
 */
function QueueCard({
  entry,
  emphasis,
  pending,
  onOpenChild,
  onAct,
  onComplete,
}: {
  entry: DoctorQueueEntry;
  emphasis: CardEmphasis;
  pending: boolean;
  onOpenChild: () => void;
  onAct: (action: QueueAction) => void;
  onComplete: () => void;
}) {
  const primary = primaryAction(entry.status);
  const compact = emphasis === "compact";

  return (
    <Card
      className={cn(
        "flex flex-col gap-3",
        compact && "p-4 shadow-sm",
        emphasis === "now" && "border-2 border-accent-500",
        emphasis === "next" && "border-2 border-primary-500"
      )}
    >
      <button type="button" onClick={onOpenChild} className="flex items-start gap-3 text-left">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg font-bold tabular-nums",
            compact ? "size-12 text-lg" : "size-16 text-2xl",
            emphasis === "now" && "bg-accent-500 text-foreground-on-accent",
            emphasis === "next" && "bg-primary-600 text-foreground-on-primary",
            compact && "bg-surface-sunken text-foreground"
          )}
        >
          {entry.seq}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={cn("truncate font-semibold text-foreground", !compact && "text-lg")}>
            {entry.childName}
          </p>
          <p className="text-sm text-foreground-muted">
            {formatAge(entry.childDob)} · {visitReasonLabels[entry.reason]}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <StatusPill status={entry.status} />
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground-muted">
              {entry.isReturning ? "Returning" : "New"}
            </span>
            {entry.hasAppointment && (
              <span className="flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
                <CalendarCheck className="size-3" />
                Appointment
              </span>
            )}
          </div>
        </div>
      </button>

      {compact ? (
        <div className="flex gap-2">
          {primary && (
            <Button className="flex-1 px-3" loading={pending} onClick={() => onAct(primary.action)}>
              {primary.label}
            </Button>
          )}
          {entry.status !== "skipped" && (
            <Button variant="secondary" className="px-4" onClick={() => onAct("skip")}>
              Skip
            </Button>
          )}
          <Button variant="ghost" className="px-4" onClick={() => onAct("remove")}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {opensCompletion(entry.status) && (
            <Button fullWidth variant="accent" onClick={onComplete}>
              Complete visit
            </Button>
          )}
          {primary && (
            <Button fullWidth loading={pending} onClick={() => onAct(primary.action)}>
              {primary.label}
            </Button>
          )}
          <div className="flex gap-2">
            {entry.status === "called" && (
              <Button variant="secondary" className="flex-1" onClick={() => onAct("recall")}>
                Recall
              </Button>
            )}
            {entry.status !== "skipped" && (
              <Button variant="secondary" className="flex-1" onClick={() => onAct("skip")}>
                Skip
              </Button>
            )}
            <Button variant="ghost" className="flex-1" onClick={() => onAct("remove")}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
