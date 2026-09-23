"use client";

import { Phone, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import type { ClinicAppointment, ClinicSessionSchedule, ISODateString } from "@/lib/api";
import { cn, formatAge, formatClock, formatPhone } from "@/lib/format";

type SlotState = "free" | "requested" | "booked" | "arrived" | "past";

interface Slot {
  time: string; // "HH:MM:00"
  state: SlotState;
  appointment: ClinicAppointment | null;
}

/** Tint + label per state: colour helps at a glance, the label carries the meaning. */
const slotStyles: Record<SlotState, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "border-success/40 bg-success/10 text-foreground",
  },
  requested: {
    label: "Requested",
    className: "border-warning/50 bg-warning/15 text-foreground hover:bg-warning/25",
  },
  booked: {
    label: "Booked",
    className: "border-danger/40 bg-danger/10 text-foreground hover:bg-danger/20",
  },
  arrived: {
    label: "Arrived",
    className: "border-danger/40 bg-danger/10 text-foreground hover:bg-danger/20",
  },
  past: {
    label: "Past",
    className: "border-border bg-surface-sunken text-foreground-muted",
  },
};

const HOLDING: Partial<Record<ClinicAppointment["status"], SlotState>> = {
  pending: "requested",
  booked: "booked",
  attended: "arrived",
};

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
}

/** Every slot of the session, with who (if anyone) holds it. */
function buildSlots(
  session: ClinicSessionSchedule,
  slotMinutes: number,
  today: ISODateString
): Slot[] {
  const start = minutesOf(session.startTime);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return Array.from({ length: session.maxBookings }, (_, index) => {
    const minutes = start + index * slotMinutes;
    const time = clockOf(minutes);
    const appointment =
      session.appointments.find(
        (item) => item.slotTime && minutesOf(item.slotTime) === minutes && HOLDING[item.status]
      ) ?? null;
    const isPast =
      session.date < today || (session.date === today && minutes + slotMinutes <= nowMinutes);

    const state: SlotState = appointment
      ? HOLDING[appointment.status]!
      : isPast
        ? "past"
        : "free";
    return { time, state, appointment };
  });
}

/**
 * The session's 30-minute slots as a colour-coded grid. Tapping a booked or
 * requested slot opens who holds it, right under the grid.
 */
export function SessionSlotGrid({
  session,
  slotMinutes,
  today,
}: {
  session: ClinicSessionSchedule;
  slotMinutes: number;
  today: ISODateString;
}) {
  const [openTime, setOpenTime] = useState<string | null>(null);
  const slots = buildSlots(session, slotMinutes, today);
  const open = slots.find((slot) => slot.time === openTime && slot.appointment) ?? null;
  const free = slots.filter((slot) => slot.state === "free").length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground-muted">
        {free} of {slots.length} {slots.length === 1 ? "slot" : "slots"} free · {slotMinutes}{" "}
        minutes each
      </p>

      <ul className="grid grid-cols-3 gap-2 @sm:grid-cols-4">
        {slots.map((slot) => {
          const style = slotStyles[slot.state];
          const content = (
            <>
              <span className="text-sm font-semibold tabular-nums">{formatClock(slot.time)}</span>
              <span className="text-[11px] font-medium text-foreground-muted">{style.label}</span>
            </>
          );
          const base =
            "flex min-h-14 w-full flex-col items-center justify-center rounded-lg border px-1 text-center";

          return (
            <li key={slot.time}>
              {slot.appointment ? (
                <button
                  type="button"
                  aria-expanded={openTime === slot.time}
                  aria-label={`${formatClock(slot.time)}, ${style.label}: ${slot.appointment.childName}. Show details`}
                  onClick={() => setOpenTime((current) => (current === slot.time ? null : slot.time))}
                  className={cn(
                    base,
                    style.className,
                    openTime === slot.time && "ring-2 ring-primary-500 ring-offset-1 ring-offset-surface-raised"
                  )}
                >
                  {content}
                </button>
              ) : (
                <div className={cn(base, style.className)}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>

      {open?.appointment && (
        <div
          role="region"
          aria-label={`Booking at ${formatClock(open.time)}`}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                {formatClock(open.time)}
              </p>
              <p className="truncate font-semibold text-foreground">{open.appointment.childName}</p>
              <p className="text-sm text-foreground-muted">
                {open.appointment.childDob ? formatAge(open.appointment.childDob) : ""}
                {open.appointment.tokenSeq !== null ? ` · token ${open.appointment.tokenSeq}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close details"
              onClick={() => setOpenTime(null)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="text-sm text-foreground">
            Parent:{" "}
            <span className="font-semibold">
              {open.appointment.parentName || "Name not given yet"}
            </span>
          </p>
          <a
            href={`tel:${open.appointment.parentPhone}`}
            className="flex min-h-11 items-center gap-2 self-start rounded-lg text-sm font-semibold text-primary-700 dark:text-primary-300"
          >
            <Phone aria-hidden className="size-4" />
            {formatPhone(open.appointment.parentPhone)}
          </a>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <AppointmentStatusPill status={open.appointment.status} />
            <Link
              href="/admin/appointments"
              className="flex min-h-11 items-center text-sm font-semibold text-primary-700 dark:text-primary-300"
            >
              {open.appointment.status === "pending" ? "Approve or reject" : "Manage booking"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
