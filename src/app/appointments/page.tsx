"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { SessionPicker } from "@/components/appointments/session-picker";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { AvailabilitySession, ParentAppointment } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatAppointmentTime,
  formatClock,
  formatDayShort,
} from "@/lib/format";

/** Null when there's no session, so the caller can send them home. */
async function loadAppointments(): Promise<ParentAppointment[] | null> {
  const api = getBrowserApi();
  if (!(await api.auth.getCurrentUserId())) return null;
  return api.appointments.listMyAppointments();
}

export default function MyAppointmentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [appointments, setAppointments] = useState<ParentAppointment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<ParentAppointment | null>(null);

  const refresh = useCallback(
    () =>
      loadAppointments()
        .then((result) => {
          if (result === null) router.replace("/");
          else setAppointments(result);
        })
        .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      }),
    [router, toast]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function cancel(appointment: ParentAppointment) {
    try {
      await getBrowserApi().appointments.cancel(appointment.appointmentId);
      toast("Appointment cancelled", "success");
      await refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  }

  return (
    <ParentShell>
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
        <p className="text-sm text-foreground-muted">
          Booking a time doesn&apos;t skip the queue — check in when you arrive and
          you&apos;ll get a token as usual.
        </p>
      </header>

      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {appointments === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : appointments === null ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No upcoming appointments"
            description="Book a time that suits you, up to a week ahead."
          />
        ) : (
          appointments.map((appointment) => (
            <Card key={appointment.appointmentId} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{appointment.childName}</p>
                  <p className="text-sm text-foreground-muted">
                    {formatDayShort(appointment.date)} · {formatAppointmentTime(appointment)}
                  </p>
                </div>
                <AppointmentStatusPill status={appointment.status} />
              </div>

              {appointment.status === "pending" && (
                <p className="rounded-lg bg-status-skipped/10 px-3 py-2 text-sm text-foreground">
                  Under review — waiting for the doctor&apos;s approval. We&apos;ll let
                  you know as soon as it&apos;s decided.
                </p>
              )}

              {appointment.status === "rejected" ? (
                <p className="rounded-lg bg-status-removed/10 px-3 py-2 text-sm text-foreground">
                  The doctor couldn&apos;t take this slot. Please book another time.
                </p>
              ) : (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setRescheduling(appointment)}
                >
                  Reschedule
                </Button>
                <ConfirmButton
                  className="flex-1"
                  variant="ghost"
                  label="Cancel"
                  confirmLabel="Tap again to cancel"
                  onConfirm={() => cancel(appointment)}
                />
              </div>
              )}
            </Card>
          ))
        )}
      </div>

      <StickyActionBar aboveNav>
        <Link href="/appointments/book">
          <Button fullWidth variant="accent">
            Book an appointment
          </Button>
        </Link>
      </StickyActionBar>

      {rescheduling && (
        <RescheduleSheet
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => void refresh()}
        />
      )}
    </ParentShell>
  );
}

function RescheduleSheet({
  appointment,
  onClose,
  onDone,
}: {
  appointment: ParentAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [sessions, setSessions] = useState<AvailabilitySession[] | null>(null);
  const [selected, setSelected] = useState<AvailabilitySession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const api = getBrowserApi().appointments;
    api
      .getBookingWindow()
      .then((window) => api.listSessions(window.clinicId, window.fromDate, window.toDate))
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch((caught) => toast(errorMessage(caught), "error"));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    try {
      const moved = await getBrowserApi().appointments.reschedule(
        appointment.appointmentId,
        selected.id
      );
      void getBrowserApi().notifications.dispatchPending();
      toast(
        `Moved to ${formatDayShort(selected.date)}${
          moved.slotTime ? `, ${formatClock(moved.slotTime)}` : ""
        } — waiting for the doctor's approval`,
        "success"
      );
      onDone();
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Reschedule ${appointment.childName}`}
      footer={
        <Button fullWidth loading={busy} disabled={!selected} onClick={() => void confirm()}>
          Move appointment
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          Currently {formatDayShort(appointment.date)}, {formatAppointmentTime(appointment)}.
        </p>
        {sessions === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <SessionPicker
            sessions={sessions}
            selectedSessionId={selected?.id ?? null}
            onSelect={setSelected}
            excludeSessionId={appointment.sessionId}
          />
        )}
      </div>
    </Sheet>
  );
}
