"use client";

import {
  CalendarCheck,
  CalendarClock,
  Clock,
  Phone,
  Pill,
  Stethoscope,
  Syringe,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { PrescriptionThumbs } from "@/components/visits/prescription-photos";
import type { UUID, VisitTimelineEntry } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatAge,
  formatCurrency,
  formatDate,
  formatPhone,
  paymentModeLabels,
  visitReasonLabels,
} from "@/lib/format";

export interface TimelinePatient {
  childId: UUID;
  childName: string;
  childDob: string;
  parentName: string | null;
  parentPhone: string;
}

/**
 * One child's history for the doctor: every visit, newest first, as a
 * timeline of cards — reason, fees and how they were paid, follow-up,
 * prescription photos, and what the pharmacy dispensed.
 */
export function PatientTimelineSheet({
  patient,
  onClose,
}: {
  patient: TimelinePatient;
  onClose: () => void;
}) {
  const [result, setResult] = useState<
    { childId: UUID; entries: VisitTimelineEntry[] } | { childId: UUID; error: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getBrowserApi()
      .visits.getChildTimeline(patient.childId)
      .then((entries) => {
        if (!cancelled) setResult({ childId: patient.childId, entries });
      })
      .catch((caught) => {
        if (!cancelled) setResult({ childId: patient.childId, error: errorMessage(caught) });
      });
    return () => {
      cancelled = true;
    };
  }, [patient.childId]);

  const current = result?.childId === patient.childId ? result : null;
  const completed =
    current && "entries" in current
      ? current.entries.filter((entry) => entry.status === "completed").length
      : 0;

  return (
    <Sheet open onClose={onClose} title={patient.childName}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 rounded-xl bg-surface-sunken p-4">
          <p className="text-lg font-bold text-foreground">{patient.childName}</p>
          <p className="text-sm text-foreground-muted">
            {formatAge(patient.childDob)} · born {formatDate(patient.childDob)}
          </p>
          <p className="text-sm text-foreground">
            Parent:{" "}
            <span className="font-semibold">{patient.parentName || "Name not given yet"}</span>
          </p>
          <a
            href={`tel:${patient.parentPhone}`}
            className="flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-primary-700 dark:text-primary-300"
          >
            <Phone aria-hidden className="size-3.5" />
            {formatPhone(patient.parentPhone)}
          </a>
        </div>

        {!current ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : "error" in current ? (
          <ErrorState message={current.error} />
        ) : current.entries.length === 0 ? (
          <EmptyState title="No visits yet" description="This child hasn't had a token here." />
        ) : (
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              {completed} {completed === 1 ? "consultation" : "consultations"} · newest first
            </h3>
            <ol className="relative flex flex-col gap-4 border-l-2 border-border pl-5">
              {current.entries.map((entry) => (
                <li key={entry.visitId} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[1.625rem] top-5 size-3 rounded-full border-2 border-surface-raised bg-primary-600"
                  />
                  <TimelineCard entry={entry} />
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

const pharmacyLabels = { pending: "Not collected yet", dispensed: "Dispensed", skipped: "Bought elsewhere" };

function TimelineCard({ entry }: { entry: VisitTimelineEntry }) {
  const ReasonIcon = entry.reason === "vaccination" ? Syringe : Stethoscope;
  const feeTotal = entry.fees
    ? entry.fees.consultation + entry.fees.vaccination + entry.fees.other
    : null;
  const minutes = minutesBetween(entry.calledAt, entry.completedAt);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{formatDate(entry.visitDate)}</p>
          <p className="text-sm text-foreground-muted">Token {entry.seq}</p>
        </div>
        <StatusPill status={entry.status} />
      </header>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm font-medium text-foreground">
          <ReasonIcon aria-hidden className="size-4 text-primary-600" />
          {visitReasonLabels[entry.reason]}
        </span>
        {entry.fromAppointment && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm font-medium text-foreground">
            <CalendarCheck aria-hidden className="size-4 text-primary-600" />
            Booked appointment
          </span>
        )}
        {minutes !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm font-medium text-foreground">
            <Clock aria-hidden className="size-4 text-primary-600" />
            {minutes} min with the doctor
          </span>
        )}
      </div>

      {entry.fees && feeTotal !== null && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {entry.fees.consultation > 0 && (
            <>
              <dt className="text-foreground-muted">Consultation</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatCurrency(entry.fees.consultation)}
              </dd>
            </>
          )}
          {entry.fees.vaccination > 0 && (
            <>
              <dt className="text-foreground-muted">Vaccination</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatCurrency(entry.fees.vaccination)}
              </dd>
            </>
          )}
          {entry.fees.other > 0 && (
            <>
              <dt className="text-foreground-muted">Other</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatCurrency(entry.fees.other)}
              </dd>
            </>
          )}
          <dt className="border-t border-border pt-1 font-semibold text-foreground">Total</dt>
          <dd className="border-t border-border pt-1 text-right font-semibold tabular-nums text-foreground">
            {formatCurrency(feeTotal)}
          </dd>
          {entry.payments.length > 0 && (
            <>
              <dt className="text-foreground-muted">Paid</dt>
              <dd className="text-right text-foreground-muted">
                {entry.payments
                  .map((payment) => `${paymentModeLabels[payment.mode]} ${formatCurrency(payment.amount)}`)
                  .join(" · ")}
              </dd>
            </>
          )}
        </dl>
      )}

      {entry.followUpDate && (
        <p className="flex items-center gap-1.5 text-sm text-foreground">
          <CalendarClock aria-hidden className="size-4 text-accent-600" />
          Follow-up set for {formatDate(entry.followUpDate)}
        </p>
      )}

      {entry.storageKeys.length > 0 && <PrescriptionThumbs storageKeys={entry.storageKeys} />}

      {entry.pharmacy && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken p-3 text-sm">
          <p className="flex items-center justify-between gap-2 font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Pill aria-hidden className="size-4 text-primary-600" />
              Pharmacy · {pharmacyLabels[entry.pharmacy.status]}
            </span>
            {entry.pharmacy.status === "dispensed" && (
              <span className="tabular-nums">{formatCurrency(entry.pharmacy.total)}</span>
            )}
          </p>
          {entry.pharmacy.medicines.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-foreground-muted">
              {entry.pharmacy.medicines.map((medicine) => (
                <li key={medicine.name} className="flex justify-between gap-2">
                  <span>
                    {medicine.name} × {medicine.quantity} {medicine.unit}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(medicine.quantity * medicine.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
