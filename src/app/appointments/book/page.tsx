"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionPicker } from "@/components/appointments/session-picker";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { ChildPicker, ReasonPicker } from "@/components/parent/visit-pickers";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { AvailabilitySession, BookingWindow, Child, VisitReason } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatDayShort, formatSession } from "@/lib/format";
import { NOTIFY_AFTER_BOOKING, sessionFlag } from "@/lib/pwa/environment";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

interface BookingData {
  window: BookingWindow;
  children: Child[];
  sessions: AvailabilitySession[];
}

/** Null when there's no session, so the caller can send them home. */
async function loadBookingData(): Promise<BookingData | null> {
  const api = getBrowserApi();
  if (!(await api.auth.getCurrentUserId())) return null;

  const window = await api.appointments.getBookingWindow();
  const [children, sessions] = await Promise.all([
    api.parents.listMyChildren(),
    api.appointments.listSessions(window.clinicId, window.fromDate, window.toDate),
  ]);
  return { window, children, sessions };
}

/**
 * Booking works like joining the queue — who, why — plus when. It's
 * confirmed as soon as it's made; the doctor just gets told.
 */
export default function BookAppointmentPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<BookingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [reason, setReason] = useState<VisitReason | null>(null);
  const [session, setSession] = useState<AvailabilitySession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBookingData()
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          router.replace("/");
          return;
        }
        setData(result);
        if (result.children.length === 1) setChildId(result.children[0].id);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Sessions the doctor opens or cancels appear (or go) as it happens.
  const bookingWindow = data?.window;
  useLiveRefresh("appointments", bookingWindow?.clinicId, () => {
    if (!bookingWindow) return;
    return getBrowserApi()
      .appointments.listSessions(
        bookingWindow.clinicId,
        bookingWindow.fromDate,
        bookingWindow.toDate
      )
      .then((sessions) => {
        setData((current) => current && { ...current, sessions });
        if (session && !sessions.some((item) => item.id === session.id)) {
          toast("That session was just closed. Please pick another.", "error");
          setSession(null);
        }
      })
      .catch(() => undefined);
  });

  async function book() {
    if (!childId || !reason || !session) return;
    setBusy(true);
    try {
      const api = getBrowserApi();
      await api.appointments.book({ sessionId: session.id, childId, visitReason: reason });
      void api.notifications.dispatchPending();
      // High-intent moment: the appointments screen asks to turn notifications on.
      sessionFlag.set(NOTIFY_AFTER_BOOKING, true);
      toast(
        `Booked for ${formatDayShort(session.date)}, ${formatSession(
          session,
          data?.window.sessionPresets
        )}`,
        "success"
      );
      router.replace("/appointments");
    } catch (caught) {
      toast(errorMessage(caught), "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button
          aria-label="Back"
          onClick={() => router.back()}
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Book an appointment</h1>
      </header>

      {data === null && loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : data === null ? (
        <div className="flex flex-col gap-3 px-5 py-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data.children.length === 0 ? (
        <EmptyState
          title="Add your child first"
          description="Add your child's name and date of birth on the Home screen, then book."
        />
      ) : (
        <>
          <ChildPicker
            title="Who is the appointment for?"
            options={data.children}
            selectedId={childId}
            onSelect={setChildId}
          />
          <ReasonPicker selected={reason} onSelect={setReason} />
          <section className="flex flex-col gap-3 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              When
            </h2>
            <SessionPicker
              sessions={data.sessions}
              presets={data.window.sessionPresets}
              selectedSessionId={session?.id ?? null}
              onSelect={setSession}
            />
          </section>
        </>
      )}

      <StickyActionBar>
        <Button
          fullWidth
          variant="accent"
          loading={busy}
          disabled={!childId || !reason || !session}
          onClick={() => void book()}
        >
          Book appointment
        </Button>
      </StickyActionBar>
    </div>
  );
}
