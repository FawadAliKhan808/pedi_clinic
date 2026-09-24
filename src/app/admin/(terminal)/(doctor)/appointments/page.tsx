"use client";

import { CalendarDays, Stethoscope, Syringe } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BookingList } from "@/components/appointments/booking-list";
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
  SessionPreset,
  UUID,
} from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { addDays, errorMessage, formatDayShort, formatSession } from "@/lib/format";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

const DAYS_SHOWN = 14;

interface Range {
  clinicId: UUID;
  today: string;
  to: string;
  presets: SessionPreset[];
}

/** "3 booked · 2 vaccination, 1 general checkup" — the session at a glance. */
function sessionSummary(session: ClinicSessionSchedule): string {
  const live = session.appointments.filter((item) => item.status !== "missed");
  if (live.length === 0) return "No bookings yet";
  const vaccination = live.filter((item) => item.visitReason === "vaccination").length;
  const checkup = live.length - vaccination;
  const parts = [
    vaccination > 0 && `${vaccination} vaccination`,
    checkup > 0 && `${checkup} general checkup`,
  ].filter(Boolean);
  return `${live.length} booked · ${parts.join(", ")}`;
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
          presets: window.sessionPresets,
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
  }, [refresh]);

  // New bookings, cancellations and moves from any device appear as they happen.
  useLiveRefresh("appointments", range?.clinicId, refresh);

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
          Who is coming, and why — today and the next two weeks. Parents are told about
          any change you make.
        </p>
      </header>

      <div className="flex flex-col gap-6 px-5 py-3">
        {schedule === null && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : schedule === null ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : byDate.size === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No sessions scheduled"
            description="Open a session from the Availability tab."
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
                <Card key={session.sessionId} className="flex flex-col gap-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatSession(session, range?.presets)}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-foreground-muted">
                      {session.appointments.some((item) => item.visitReason === "vaccination") ? (
                        <Syringe aria-hidden className="size-3.5" />
                      ) : (
                        <Stethoscope aria-hidden className="size-3.5" />
                      )}
                      {sessionSummary(session)}
                    </p>
                  </div>

                  <BookingList
                    appointments={session.appointments}
                    actions={(appointment) =>
                      appointment.status === "booked" && (
                        <div className="flex gap-2 pl-10">
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
                                () => getBrowserApi().appointments.cancel(appointment.appointmentId),
                                "Appointment cancelled — parent notified"
                              )
                            }
                          />
                        </div>
                      )
                    }
                  />

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
                        "Session cancelled"
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

  const load = useCallback(
    () =>
      getBrowserApi()
        .appointments.listSessions(range.clinicId, range.today, range.to)
        .then((list) => {
          setSessions(list);
          setSelected((current) =>
            current && list.some((item) => item.id === current.id) ? current : null
          );
        }),
    [range]
  );

  useEffect(() => {
    load().catch((caught) => toast(errorMessage(caught), "error"));
  }, [load, toast]);

  useLiveRefresh("appointments", range.clinicId, () => load().catch(() => undefined));

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
          presets={range.presets}
          selectedSessionId={selected?.id ?? null}
          onSelect={setSelected}
          excludeSessionId={currentSessionId}
        />
      )}
    </Sheet>
  );
}
