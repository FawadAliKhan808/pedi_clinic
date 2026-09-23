"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { InstallAndNotifications } from "@/components/parent/install-and-notifications";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import type { ParentQueueEntry, VisitStatus } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, visitReasonLabels } from "@/lib/format";

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

/** Returns null when there's no session, so the caller can send them home. */
async function loadQueue(): Promise<ParentQueueEntry[] | null> {
  const api = getBrowserApi();
  const userId = await api.auth.getCurrentUserId();
  if (!userId) return null;
  return api.queue.getParentQueueView();
}

export default function QueuePage() {
  const router = useRouter();
  const toast = useToast();
  const [entries, setEntries] = useState<ParentQueueEntry[] | null>(null);

  const refresh = useCallback(
    () =>
      loadQueue()
        .then((view) => {
          if (view === null) router.replace("/");
          else setEntries(view);
        })
        .catch((caught) => toast(errorMessage(caught), "error")),
    [router, toast]
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

      {entries === null ? (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-5 py-6">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No token yet"
          description="Check in to get today's token and follow the queue live."
          action={
            <Link href="/check-in">
              <Button variant="accent">Check in</Button>
            </Link>
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

                {entry.status === "completed" && (
                  <Link href={`/visits/${entry.visitId}`}>
                    <Button fullWidth variant="accent">
                      View visit summary
                    </Button>
                  </Link>
                )}
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
