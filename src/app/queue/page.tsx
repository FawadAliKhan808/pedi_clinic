"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { InstallAndNotifications } from "@/components/parent/install-and-notifications";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import type { ParentQueueEntry, VisitStatus } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, visitReasonLabels } from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";

/** Reassuring, plain-language copy for every state a parent can land in. */
function statusCopy(entry: ParentQueueEntry): string {
  switch (entry.status) {
    case "waiting":
      return entry.patientsAhead === 0
        ? "You're next — please stay close by."
        : `${entry.patientsAhead} ${
            entry.patientsAhead === 1 ? "patient" : "patients"
          } ahead of you.`;
    case "called":
      return "It's your turn now — please go in.";
    case "in_consultation":
      return "You're with the doctor now.";
    case "completed":
      return "This visit is complete.";
    case "skipped":
      return "You were skipped, please check with reception.";
    case "removed":
      return "This token was removed. Please check with reception.";
  }
}

const accentByStatus: Record<VisitStatus, string> = {
  waiting: "bg-primary-600 text-foreground-on-primary",
  called: "bg-accent-500 text-foreground-on-accent",
  in_consultation: "bg-primary-700 text-foreground-on-primary",
  completed: "bg-status-completed text-neutral-0",
  skipped: "bg-status-skipped text-neutral-0",
  removed: "bg-status-removed text-neutral-0",
};

/**
 * Tokens still in play today. Finished visits leave this screen — their
 * summaries live in Last visits — and so do tokens reception removed.
 */
const ACTIVE_STATUSES = new Set<VisitStatus>(["waiting", "called", "in_consultation", "skipped"]);

/** Returns null when there's no session, so the caller can send them home. */
async function loadQueue(): Promise<ParentQueueEntry[] | null> {
  const api = getBrowserApi();
  const userId = await api.auth.getCurrentUserId();
  if (!userId) return null;
  const entries = await api.queue.getParentQueueView();
  return entries.filter((entry) => ACTIVE_STATUSES.has(entry.status));
}

export default function QueuePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<ParentQueueEntry[] | null>(
    () => lastShown<ParentQueueEntry[]>("parent-queue") ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  useRememberShown("parent-queue", entries);

  const refresh = useCallback(
    () =>
      loadQueue()
        .then((view) => {
          if (view === null) router.replace("/");
          else {
            setEntries(view);
            setLoadError(null);
          }
        })
        // Shown only until the first load succeeds; after that a failed
        // refresh keeps the last queue on screen (the offline banner explains).
        .catch((caught) => setLoadError(errorMessage(caught))),
    [router]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clinicId = entries?.[0]?.clinicId;

  useEffect(() => {
    if (!clinicId) return;
    // Refetches on every queue change, and again on reconnect after a drop.
    return getBrowserApi().realtime.subscribeToQueue(clinicId, () => {
      void refresh().catch(() => undefined);
    });
  }, [clinicId, refresh]);

  return (
    <ParentShell>
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <Link
          href="/"
          aria-label="Back"
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">Your queue</h1>
      </header>

      {entries === null && loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : entries === null ? (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-5 py-6">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No active token"
          description="Check in to get today's token and follow the queue live. Summaries of finished visits are in Last visits."
          action={
            <div className="flex flex-col items-center gap-2">
              <Link href="/check-in">
                <Button variant="accent">Check in</Button>
              </Link>
              <Link
                href="/records"
                className="flex min-h-12 items-center px-4 font-semibold text-primary-600"
              >
                Go to Last visits
              </Link>
            </div>
          }
        />
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-5 py-4">
          {entries.map((entry) => (
            <section
              key={entry.visitId}
              className="overflow-hidden rounded-2xl border border-border shadow-md"
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-1 px-6 py-8 transition-colors duration-300",
                  accentByStatus[entry.status]
                )}
              >
                <span className="text-sm font-semibold uppercase tracking-widest opacity-90">
                  {entry.childName}&apos;s token
                </span>
                <span className="text-token-display font-bold tabular-nums">
                  {entry.seq}
                </span>
                <span className="text-sm font-medium opacity-90">
                  {visitReasonLabels[entry.reason]}
                </span>
              </div>

              <div className="flex flex-col gap-4 bg-surface-raised px-6 py-5">
                <div className="flex items-center justify-between">
                  <StatusPill status={entry.status} />
                  <span className="text-sm text-foreground-muted">
                    Now serving{" "}
                    <strong className="text-foreground tabular-nums">
                      {entry.nowServingSeq ?? "—"}
                    </strong>
                  </span>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {statusCopy(entry)}
                </p>

              </div>
            </section>
          ))}

          <InstallAndNotifications />

          <Card className="text-center text-sm text-foreground-muted">
            This screen updates on its own — no need to refresh.
          </Card>
        </div>
      )}
    </ParentShell>
  );
}
