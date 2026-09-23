"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { SessionPicker } from "@/components/appointments/session-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type {
  AvailabilitySession,
  ClinicAppointment,
  ClinicSessionSchedule,
  UUID,
} from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { onNotificationsChanged } from "@/lib/notifications/unread";
import {
  addDays,
  errorMessage,
  formatAge,
  formatDayShort,
  formatPhone,
  formatTimeRange,
} from "@/lib/format";

const DAYS_SHOWN = 14;

interface Range {
  clinicId: UUID;
  today: string;
  to: string;
}

export default function DoctorAppointmentsPage() {
  const toast = useToast();
  const [range, setRange] = useState<Range | null>(null);
  const [schedule, setSchedule] = useState<ClinicSessionSchedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<{
    appointment: ClinicAppointment;
    sessionId: UUID;
  } | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        if (!staff?.clinicId) return;
        setRange({
          clinicId: staff.clinicId,
          today: window.today,
          to: addDays(window.today, DAYS_SHOWN - 1),
        });
      })
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  const refresh = useCallback(() => {
    if (!range) return Promise.resolve();
    return getBrowserApi()
      .appointments.listClinicSchedule(range.clinicId, range.today, range.to)
      .then(setSchedule)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [range, toast]);

  useEffect(() => {
    void refresh();
    // A new booking request arriving (see the Alerts tab) refreshes this too.
    return onNotificationsChanged(() => void refresh());
  }, [refresh]);

  /** Every change here notifies the affected parents immediately. */
  async function change(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast(success, "success");
      void getBrowserApi().notifications.dispatchPending();
      await refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  }

  const byDate = new Map<string, ClinicSessionSchedule[]>();
  for (const session of schedule ?? []) {
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
        <p className="text-sm text-foreground-muted">
          Today and the next two weeks. Parents are told about any change you make.
        </p>
      </header>

      <div className="flex flex-col gap-6 px-5 py-3">
        {schedule === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : schedule === null ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : byDate.size === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No sessions scheduled"
            description="Open appointment slots from the Availability tab."
          />
        ) : (
          [...byDate.entries()].map(([date, sessions]) => (
            <section key={date} className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
              <div className="col-span-full flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">
                  {date === range?.today ? "Today" : formatDayShort(date)}
                </h2>
                {range && (
                  <ConfirmButton
                    variant="ghost"
                    label="Cancel day"
                    confirmLabel="Tap again to cancel day"
                    onConfirm={() =>
                      change(
                        () => getBrowserApi().appointments.closeDay(range.clinicId, date),
                        `${formatDayShort(date)} cancelled — parents notified`
                      )
                    }
                  />
                )}
              </div>

              {sessions.map((session) => (
                <Card key={session.sessionId} className="flex flex-col gap-3">
                  <div>
                    <p className="whitespace-nowrap font-semibold text-foreground">
                      {formatTimeRange(session.startTime, session.endTime)}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {session.bookedCount} of {session.maxBookings} booked
                    </p>
                  </div>

                  {session.appointments.length === 0 ? (
                    <p className="text-sm text-foreground-muted">No bookings yet.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border">
                      {session.appointments.map((appointment) => (
                        <li key={appointment.appointmentId} className="flex flex-col gap-2 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {appointment.childName}
                              </p>
                              <p className="text-sm text-foreground-muted">
                                {formatAge(appointment.childDob)} ·{" "}
                                {formatPhone(appointment.parentPhone)}
                                {appointment.tokenSeq !== null
                                  ? ` · token ${appointment.tokenSeq}`
                                  : ""}
                              </p>
                            </div>
                            <AppointmentStatusPill status={appointment.status} />
                          </div>

                          {appointment.status === "booked" && (
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() =>
                                  setRescheduling({ appointment, sessionId: session.sessionId })
                                }
                              >
                                Reschedule
                              </Button>
                              <ConfirmButton
                                className="flex-1"
                                variant="ghost"
                                label="Cancel"
                                confirmLabel="Tap again"
                                onConfirm={() =>
                                  change(
                                    () =>
                                      getBrowserApi().appointments.cancel(
                                        appointment.appointmentId
                                      ),
                                    "Appointment cancelled — parent notified"
                                  )
                                }
                              />
                            </div>
                          )}

                          {appointment.status === "pending" && (
                            <div className="flex gap-2">
                              <Button
                                className="flex-1"
                                onClick={() =>
                                  change(
                                    () =>
                                      getBrowserApi().appointments.approve(
                                        appointment.appointmentId
                                      ),
                                    "Approved — parent notified"
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <ConfirmButton
                                className="flex-1"
                                label="Reject"
                                confirmLabel="Tap again to reject"
                                onConfirm={() =>
                                  change(
                                    () =>
                                      getBrowserApi().appointments.reject(
                                        appointment.appointmentId
                                      ),
                                    "Rejected — parent notified"
                                  )
                                }
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <ConfirmButton
                    variant="ghost"
                    label="Cancel session"
                    confirmLabel={
                      session.bookedCount > 0
                        ? `Tap again — ${session.bookedCount} parent(s) will be told`
                        : "Tap again to cancel"
                    }
                    onConfirm={() =>
                      change(
                        () => getBrowserApi().appointments.cancelSession(session.sessionId),
                        "Session cancelled — parents notified"
                      )
                    }
                  />
                </Card>
              ))}
            </section>
          ))
        )}
      </div>

      {rescheduling && range && (
        <DoctorRescheduleSheet
          range={range}
          appointment={rescheduling.appointment}
          currentSessionId={rescheduling.sessionId}
          onClose={() => setRescheduling(null)}
          onMove={(sessionId) =>
            change(
              () =>
                getBrowserApi().appointments.reschedule(
                  rescheduling.appointment.appointmentId,
                  sessionId
                ),
              "Appointment moved — parent notified"
            )
          }
        />
      )}
    </div>
  );
}

function DoctorRescheduleSheet({
  range,
  appointment,
  currentSessionId,
  onClose,
  onMove,
}: {
  range: Range;
  appointment: ClinicAppointment;
  currentSessionId: UUID;
  onClose: () => void;
  onMove: (sessionId: UUID) => Promise<void>;
}) {
  const toast = useToast();
  const [sessions, setSessions] = useState<AvailabilitySession[] | null>(null);
  const [selected, setSelected] = useState<AvailabilitySession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBrowserApi()
      .appointments.listSessions(range.clinicId, range.today, range.to)
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch((caught) => toast(errorMessage(caught), "error"));
    return () => {
      cancelled = true;
    };
  }, [range, toast]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Move ${appointment.childName}`}
      footer={
        <Button
          fullWidth
          loading={busy}
          disabled={!selected}
          onClick={async () => {
            if (!selected) return;
            setBusy(true);
            await onMove(selected.id);
            setBusy(false);
            onClose();
          }}
        >
          Move and notify parent
        </Button>
      }
    >
      {sessions === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <SessionPicker
          sessions={sessions}
          selectedSessionId={selected?.id ?? null}
          onSelect={setSelected}
          excludeSessionId={currentSessionId}
        />
      )}
    </Sheet>
  );
}
