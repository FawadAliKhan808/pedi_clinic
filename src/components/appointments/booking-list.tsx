import { Phone, Stethoscope, Syringe } from "lucide-react";
import type { ReactNode } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import type { ClinicAppointment } from "@/lib/api";
import { cn, formatAge, formatPhone, visitReasonLabels } from "@/lib/format";

/**
 * Who booked a session and why — one row per child: name, reason, age,
 * parent and a tap-to-call number, status, and the token once they arrive.
 * `actions` renders extra controls under a row (e.g. reschedule / cancel).
 */
export function BookingList({
  appointments,
  actions,
  className,
}: {
  appointments: ClinicAppointment[];
  actions?: (appointment: ClinicAppointment) => ReactNode;
  className?: string;
}) {
  if (appointments.length === 0) {
    return <p className="text-sm text-foreground-muted">No bookings yet.</p>;
  }

  return (
    <ol className={cn("flex flex-col divide-y divide-border", className)}>
      {appointments.map((appointment, index) => {
        const ReasonIcon = appointment.visitReason === "vaccination" ? Syringe : Stethoscope;
        return (
          <li key={appointment.appointmentId} className="flex flex-col gap-2 py-3">
            <div className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-bold tabular-nums text-foreground-muted">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold text-foreground">{appointment.childName}</p>
                  <AppointmentStatusPill status={appointment.status} />
                </div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <ReasonIcon aria-hidden className="size-4 text-primary-600" />
                  {visitReasonLabels[appointment.visitReason]}
                </p>
                <p className="text-sm text-foreground-muted">
                  {appointment.childDob ? `${formatAge(appointment.childDob)} · ` : ""}
                  {appointment.parentName || "Parent's name not given yet"}
                  {appointment.tokenSeq !== null ? ` · token ${appointment.tokenSeq}` : ""}
                </p>
                <a
                  href={`tel:${appointment.parentPhone}`}
                  className="flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-primary-700 dark:text-primary-300"
                >
                  <Phone aria-hidden className="size-3.5" />
                  {formatPhone(appointment.parentPhone)}
                </a>
              </div>
            </div>
            {actions?.(appointment)}
          </li>
        );
      })}
    </ol>
  );
}
