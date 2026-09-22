"use client";

import { CalendarCheck, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AddWalkInSheet } from "@/components/admin/add-walk-in-sheet";
import { ChildHistorySheet } from "@/components/visits/child-history-sheet";
import { CompleteVisitFlow } from "@/components/admin/complete-visit-flow";
import { SearchChildrenSheet } from "@/components/admin/search-children-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import type { DoctorQueueEntry, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, visitReasonLabels } from "@/lib/format";

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
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [entries, setEntries] = useState<DoctorQueueEntry[] | null>(null);
  const [pendingVisitId, setPendingVisitId] = useState<UUID | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [childSheetFor, setChildSheetFor] = useState<{
    childId: UUID;
    childName: string;
    childDob: string;
    parentPhone: string;
  } | null>(null);
  const [completingVisit, setCompletingVisit] = useState<DoctorQueueEntry | null>(null);

  useEffect(() => {
    void getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    return getBrowserApi()
      .queue.getDoctorQueue(clinicId)
      .then(setEntries)
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [clinicId, toast]);

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
      await api.queue[action](visitId);
      // Calling, recalling, skipping or removing can each create a
      // "your turn" / "3rd in line" notification; push it out now.
      void api.notifications.dispatchPending();
      await refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setPendingVisitId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Queue</h1>
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

      <div className="flex flex-col gap-3 px-5 py-3">
        {entries === null ? (
          <>
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
          entries.map((entry) => (
            <Card key={entry.visitId} className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() =>
                  setChildSheetFor({
                    childId: entry.childId,
                    childName: entry.childName,
                    childDob: entry.childDob,
                    parentPhone: entry.parentPhone,
                  })
                }
                className="flex items-start gap-3 text-left"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-bold tabular-nums text-foreground">
                  {entry.seq}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-semibold text-foreground">
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

              <div className="flex flex-col gap-2">
                {opensCompletion(entry.status) && (
                  <Button
                    fullWidth
                    variant="accent"
                    onClick={() => setCompletingVisit(entry)}
                  >
                    Complete visit
                  </Button>
                )}
                {primaryAction(entry.status) && (
                  <Button
                    fullWidth
                    loading={pendingVisitId === entry.visitId}
                    onClick={() =>
                      void act(entry.visitId, primaryAction(entry.status)!.action)
                    }
                  >
                    {primaryAction(entry.status)!.label}
                  </Button>
                )}

                <div className="flex gap-2">
                  {entry.status === "called" && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => void act(entry.visitId, "recall")}
                    >
                      Recall
                    </Button>
                  )}
                  {entry.status !== "skipped" && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => void act(entry.visitId, "skip")}
                    >
                      Skip
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => void act(entry.visitId, "remove")}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))
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
