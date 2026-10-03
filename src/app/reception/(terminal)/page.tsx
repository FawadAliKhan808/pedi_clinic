"use client";

import { CalendarCheck, Phone, Scale, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AddWalkInSheet } from "@/components/admin/add-walk-in-sheet";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import type { DoctorQueueEntry, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  cn,
  errorMessage,
  formatAge,
  formatPhone,
  formatWeight,
  visitReasonLabels,
} from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

/**
 * The front desk: today's queue as the doctor runs it, read-only, and one
 * action — add a walk-in for a parent who doesn't use the app. Calling,
 * skipping and completing visits stay with the doctor.
 */
export default function ReceptionQueuePage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(() => lastShown<UUID>("staff-clinic") ?? null);
  const [entries, setEntries] = useState<DoctorQueueEntry[] | null>(
    () => lastShown<DoctorQueueEntry[]>("reception-queue") ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  useRememberShown("staff-clinic", clinicId);
  useRememberShown("reception-queue", entries);

  useEffect(() => {
    getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    return getBrowserApi()
      .queue.getDoctorQueue(clinicId)
      .then(setEntries)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [clinicId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Check-ins, calls and completions show up the moment they happen.
  useLiveRefresh("queue", clinicId, refresh);

  const withDoctor = (entries ?? []).filter(
    (entry) => entry.status === "called" || entry.status === "in_consultation"
  );
  const waiting = (entries ?? []).filter((entry) => entry.status === "waiting");
  const skipped = (entries ?? []).filter((entry) => entry.status === "skipped");

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Today&apos;s queue</h1>
        <p className="text-sm text-foreground-muted">
          Updates live. Add a walk-in for a parent who doesn&apos;t use the app.
        </p>
      </header>

      {entries !== null && (
        <dl className="grid grid-cols-2 gap-2 px-5 py-2">
          <Stat label="Waiting" value={waiting.length} />
          <Stat label="With the doctor" value={withDoctor.length} />
        </dl>
      )}

      <div className="flex flex-col gap-5 px-5 py-3">
        {entries === null && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : entries === null ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No one in the queue"
            description="Tokens appear here the moment a parent checks in, or when you add a walk-in."
          />
        ) : (
          <>
            {withDoctor.length > 0 && (
              <Section title="With the doctor">
                {withDoctor.map((entry) => (
                  <ReceptionCard key={entry.visitId} entry={entry} now />
                ))}
              </Section>
            )}
            {waiting.length > 0 && (
              <Section title={`Waiting · ${waiting.length}`}>
                {waiting.map((entry) => (
                  <ReceptionCard key={entry.visitId} entry={entry} />
                ))}
              </Section>
            )}
            {skipped.length > 0 && (
              <Section title={`Skipped · ${skipped.length}`}>
                {skipped.map((entry) => (
                  <ReceptionCard key={entry.visitId} entry={entry} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      <StickyActionBar aboveNav>
        <Button variant="accent" fullWidth onClick={() => setWalkInOpen(true)} disabled={!clinicId}>
          <UserPlus className="size-5" />
          Add walk-in
        </Button>
      </StickyActionBar>

      {clinicId && (
        <AddWalkInSheet
          clinicId={clinicId}
          open={walkInOpen}
          onClose={() => setWalkInOpen(false)}
          onAdded={() => void refresh()}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-raised px-3 py-2">
      <dt className="order-2 text-xs text-foreground-muted">{label}</dt>
      <dd className="order-1 text-2xl font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">{title}</h2>
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">{children}</div>
    </section>
  );
}

/** One child in the queue, for looking up, not acting on. */
function ReceptionCard({ entry, now = false }: { entry: DoctorQueueEntry; now?: boolean }) {
  return (
    <Card className={cn("flex items-start gap-3 p-4", now && "border-2 border-accent-500")}>
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold tabular-nums",
          now ? "bg-accent-500 text-foreground-on-accent" : "bg-surface-sunken text-foreground"
        )}
      >
        {entry.seq}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-semibold text-foreground">{entry.childName}</p>
        <p className="text-sm text-foreground-muted">
          {formatAge(entry.childDob)} · {visitReasonLabels[entry.reason]}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <StatusPill status={entry.status} />
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              entry.weightKg === null
                ? "border border-dashed border-border text-foreground-muted"
                : "bg-surface-sunken text-foreground"
            )}
          >
            <Scale className="size-3" />
            {entry.weightKg === null ? "No weight yet" : formatWeight(entry.weightKg)}
          </span>
          {entry.hasAppointment && (
            <span className="flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
              <CalendarCheck className="size-3" />
              Appointment
            </span>
          )}
        </div>
        <a
          href={`tel:${entry.parentPhone}`}
          className="flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-primary-600"
        >
          <Phone className="size-4" />
          {entry.parentName ? `${entry.parentName} · ` : ""}
          {formatPhone(entry.parentPhone)}
        </a>
      </div>
    </Card>
  );
}
