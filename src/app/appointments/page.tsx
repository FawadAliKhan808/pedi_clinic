"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { BookingWindow, ParentAppointment } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatDayShort,
  formatSession,
  visitReasonLabels,
} from "@/lib/format";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

interface AppointmentsData {
  window: BookingWindow;
  appointments: ParentAppointment[];
}

/** Null when there's no session, so the caller can send them home. */
async function loadAppointments(): Promise<AppointmentsData | null> {
  const api = getBrowserApi();
  if (!(await api.auth.getCurrentUserId())) return null;
  const [window, appointments] = await Promise.all([
    api.appointments.getBookingWindow(),
    api.appointments.listMyAppointments(),
  ]);
  return { window, appointments };
}

export default function MyAppointmentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<AppointmentsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      loadAppointments()
        .then((result) => {
          if (result === null) router.replace("/");
          else setData(result);
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

  // New bookings (from another phone) and arrivals show up without a refresh.
  useLiveRefresh("appointments", data?.window.clinicId, refresh);

  const presets = data?.window.sessionPresets ?? [];

  return (
    <ParentShell>
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
        <p className="text-sm text-foreground-muted">
          Booking a session doesn&apos;t skip the queue — check in when you arrive and
          you&apos;ll get a token as usual. Bookings can&apos;t be changed once made.
        </p>
      </header>

      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {data === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : data === null ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : data.appointments.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No upcoming appointments"
            description="Book a session that suits you, up to a week ahead."
          />
        ) : (
          data.appointments.map((appointment) => (
            <Card key={appointment.appointmentId} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{appointment.childName}</p>
                  <p className="text-sm text-foreground-muted">
                    {formatDayShort(appointment.date)} · {formatSession(appointment, presets)}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {visitReasonLabels[appointment.visitReason]}
                  </p>
                </div>
                <AppointmentStatusPill status={appointment.status} />
              </div>

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

    </ParentShell>
  );
}
