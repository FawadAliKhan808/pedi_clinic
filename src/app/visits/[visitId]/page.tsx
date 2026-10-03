"use client";

import { ArrowLeft, CalendarClock, Scale } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ParentShell } from "@/components/parent/parent-shell";
import { RatingPrompt } from "@/components/parent/rating-prompt";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PrescriptionThumbs } from "@/components/visits/prescription-photos";
import type { VisitSummary } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { useAppBack } from "@/lib/navigation/back";
import {
  errorMessage,
  formatCurrency,
  formatDate,
  formatWeight,
  visitReasonLabels,
} from "@/lib/format";

export default function VisitSummaryPage() {
  const goBack = useAppBack("/records");
  const params = useParams<{ visitId: string }>();
  const [summary, setSummary] = useState<VisitSummary | null | "missing">(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Asked once per parent, ever: only while they have never rated the app.
  const [askForRating, setAskForRating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const api = getBrowserApi();
    Promise.all([
      api.visits.getVisitSummary(params.visitId),
      // If the check fails, don't ask — better than asking twice.
      api.visits.hasRatedApp().catch(() => true),
    ])
      .then(([result, hasRated]) => {
        if (cancelled) return;
        setSummary(result ?? "missing");
        setAskForRating(!hasRated);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      });

    return () => {
      cancelled = true;
    };
  }, [params.visitId]);

  return (
    <ParentShell>
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        {/* Back to the screen it was opened from (a child's screen, Last visits,
            or wherever the finished visit popped it up). Opened directly — say
            from a notification — there's nothing to go back to: Last visits. */}
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Visit summary</h1>
      </header>

      {summary === null && loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : summary === null ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : summary === "missing" ? (
        <EmptyState
          title="Visit not found"
          description="This visit isn't available on your account."
        />
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-4">
          <Card className="flex flex-col gap-1">
            <p className="text-lg font-bold text-foreground">{summary.childName}</p>
            <p className="text-sm text-foreground-muted">
              {formatDate(summary.visitDate)} · {visitReasonLabels[summary.reason]}
            </p>
            {summary.weightKg !== null && (
              <p className="flex items-center gap-1.5 pt-1 text-sm text-foreground">
                <Scale aria-hidden className="size-4 text-primary-600" />
                Weight <strong className="tabular-nums">{formatWeight(summary.weightKg)}</strong>
              </p>
            )}
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

          {summary.status === "completed" && askForRating && (
            <RatingPrompt visitId={summary.visitId} />
          )}
        </div>
      )}
    </ParentShell>
  );
}
