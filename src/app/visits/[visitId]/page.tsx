"use client";

import { ArrowLeft, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ParentTabs } from "@/components/parent/parent-tabs";
import { RatingPrompt } from "@/components/parent/rating-prompt";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { PrescriptionThumbs } from "@/components/visits/prescription-photos";
import type { VisitSummary } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatCurrency,
  formatDate,
  visitReasonLabels,
} from "@/lib/format";

export default function VisitSummaryPage() {
  const params = useParams<{ visitId: string }>();
  const toast = useToast();
  const [summary, setSummary] = useState<VisitSummary | null | "missing">(null);

  useEffect(() => {
    let cancelled = false;
    getBrowserApi()
      .visits.getVisitSummary(params.visitId)
      .then((result) => {
        if (!cancelled) setSummary(result ?? "missing");
      })
      .catch((caught) => toast(errorMessage(caught), "error"));

    return () => {
      cancelled = true;
    };
  }, [params.visitId, toast]);

  return (
    <div className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <Link
          href="/"
          aria-label="Back"
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold text-foreground">Visit summary</h1>
      </header>

      {summary === null ? (
        <div className="flex flex-col gap-4 px-5 py-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : summary === "missing" ? (
        <EmptyState
          title="Visit not found"
          description="This visit isn't available on your account."
        />
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4">
          <Card className="flex flex-col gap-1">
            <p className="text-lg font-bold text-foreground">{summary.childName}</p>
            <p className="text-sm text-foreground-muted">
              {formatDate(summary.visitDate)} · {visitReasonLabels[summary.reason]}
            </p>
          </Card>

          {summary.feeTotal !== null && (
            <Card className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Total paid</span>
              <span className="text-xl font-bold tabular-nums text-foreground">
                {formatCurrency(summary.feeTotal)}
              </span>
            </Card>
          )}

          {summary.followUpDate && (
            <Card className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary-600" />
              <div>
                <p className="font-semibold text-foreground">Follow-up visit</p>
                <p className="text-sm text-foreground-muted">
                  {formatDate(summary.followUpDate)} — we&apos;ll remind you beforehand.
                </p>
              </div>
            </Card>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Prescription
            </h2>
            {summary.storageKeys.length === 0 ? (
              <Card className="text-sm text-foreground-muted">
                No prescription photo was added for this visit.
              </Card>
            ) : (
              <Card>
                <PrescriptionThumbs storageKeys={summary.storageKeys} />
                <p className="pt-3 text-sm text-foreground-muted">
                  Tap a photo to zoom, download, or share it.
                </p>
              </Card>
            )}
          </section>

          {summary.status === "completed" && (
            <RatingPrompt
              visitId={summary.visitId}
              existingStars={summary.ratingStars}
            />
          )}
        </div>
      )}

      <ParentTabs />
    </div>
  );
}
