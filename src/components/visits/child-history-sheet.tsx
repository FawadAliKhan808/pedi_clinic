"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { PrescriptionThumbs } from "@/components/visits/prescription-photos";
import type { ChildVisitHistoryEntry, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatAge,
  formatCurrency,
  formatDate,
  formatPhone,
  visitReasonLabels,
} from "@/lib/format";

export function ChildHistorySheet({
  childId,
  childName,
  childDob,
  parentName,
  parentPhone,
  open,
  onClose,
  summaryLinks = false,
}: {
  childId: UUID;
  childName: string;
  childDob: string;
  parentName?: string | null;
  parentPhone?: string;
  open: boolean;
  onClose: () => void;
  /** Each visit links to its full summary (for a parent's own view). */
  summaryLinks?: boolean;
}) {
  const toast = useToast();
  const [history, setHistory] = useState<ChildVisitHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    getBrowserApi()
      .visits.getChildHistory(childId)
      .then((entries) => {
        if (!cancelled) setHistory(entries);
      })
      .catch((caught) => toast(errorMessage(caught), "error"));

    return () => {
      cancelled = true;
    };
  }, [open, childId, toast]);

  const past = history?.filter((entry) => entry.status === "completed") ?? [];
  const [lastVisit, ...earlier] = past;

  return (
    <Sheet open={open} onClose={onClose} title={childName}>
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-1">
          <p className="text-lg font-bold text-foreground">{childName}</p>
          <p className="text-sm text-foreground-muted">
            {formatAge(childDob)} · born {formatDate(childDob)}
          </p>
          {parentPhone && (
            <p className="text-sm text-foreground-muted">
              Parent:{" "}
              <span className="font-semibold text-foreground">
                {parentName || "Name not given yet"}
              </span>{" "}
              · {formatPhone(parentPhone)}
            </p>
          )}
        </Card>

        {history === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : past.length === 0 ? (
          <EmptyState
            title="First visit"
            description="No completed visits yet for this child."
          />
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                Last visit
              </h3>
              <VisitCard entry={lastVisit} summaryLink={summaryLinks} />
            </section>

            {earlier.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                  Earlier visits
                </h3>
                {earlier.map((entry) => (
                  <VisitCard key={entry.visitId} entry={entry} summaryLink={summaryLinks} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function VisitCard({
  entry,
  summaryLink,
}: {
  entry: ChildVisitHistoryEntry;
  summaryLink: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{formatDate(entry.visitDate)}</p>
          <p className="text-sm text-foreground-muted">
            {visitReasonLabels[entry.reason]}
          </p>
        </div>
        {entry.feeTotal !== null && (
          <span className="font-semibold tabular-nums text-foreground">
            {formatCurrency(entry.feeTotal)}
          </span>
        )}
      </div>

      {entry.followUpDate && (
        <p className="text-sm text-foreground-muted">
          Follow-up set for {formatDate(entry.followUpDate)}
        </p>
      )}

      {entry.status !== "completed" && <StatusPill status={entry.status} />}

      <PrescriptionThumbs storageKeys={entry.storageKeys} />

      {summaryLink && entry.status === "completed" && (
        <Link
          href={`/visits/${entry.visitId}`}
          className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border text-sm font-semibold text-primary-700 hover:bg-surface-sunken dark:text-primary-300"
        >
          View visit summary
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      )}
    </Card>
  );
}
