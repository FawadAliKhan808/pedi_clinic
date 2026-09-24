import type { AppointmentStatus } from "@/lib/api";
import { cn } from "@/lib/format";

// "pending" and "rejected" only appear on bookings from the retired approval flow.
const styles: Record<AppointmentStatus, { label: string; className: string }> = {
  pending: { label: "Awaiting approval", className: "bg-status-skipped" },
  booked: { label: "Booked", className: "bg-primary-600" },
  rejected: { label: "Not approved", className: "bg-status-removed" },
  attended: { label: "Arrived", className: "bg-status-completed" },
  missed: { label: "Missed", className: "bg-status-removed" },
  cancelled: { label: "Cancelled", className: "bg-status-waiting" },
};

export function AppointmentStatusPill({ status }: { status: AppointmentStatus }) {
  const { label, className } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-neutral-0",
        className
      )}
    >
      {label}
    </span>
  );
}
