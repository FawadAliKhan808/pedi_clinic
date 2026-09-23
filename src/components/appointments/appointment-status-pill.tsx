import type { AppointmentStatus } from "@/lib/api";
import { cn } from "@/lib/format";

const styles: Record<AppointmentStatus, { label: string; className: string }> = {
  booked: { label: "Booked", className: "bg-primary-600" },
  attended: { label: "Arrived", className: "bg-status-completed" },
  missed: { label: "Missed", className: "bg-status-removed" },
  cancelled: { label: "Cancelled", className: "bg-status-waiting" },
};

export function AppointmentStatusPill({ status }: { status: AppointmentStatus }) {
  const { label, className } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-neutral-0",
        className
      )}
    >
      {label}
    </span>
  );
}
