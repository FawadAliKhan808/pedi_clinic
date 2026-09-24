/**
 * Every word a parent sees in a notification, in one place. Push delivery and
 * the in-app list both render through here, so changing the copy never means
 * touching delivery logic. The database stores only a type and its data.
 */

export type NotificationType =
  | "third_in_line"
  | "your_turn"
  | "follow_up_reminder"
  | "appointment_tomorrow"
  | "appointment_today"
  | "appointment_changed"
  | "booking_request"
  | "booking_update";

export interface RenderedNotification {
  title: string;
  body: string;
  /** Where tapping the notification takes the parent. */
  url: string;
}

type Payload = Record<string, unknown>;

function text(payload: Payload, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function formatDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function formatClock(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** "Wed, 24 Sept, 10:30 am" — the booking's exact time, or its session for older ones. */
function sessionLabel(payload: Payload): string {
  const day = formatDay(payload.appointment_date);
  const exact = formatClock(payload.appointment_time);
  const start = formatClock(payload.start_time);
  const end = formatClock(payload.end_time);
  const time = exact ?? (start && end ? `${start}–${end}` : start);
  return [day, time].filter(Boolean).join(", ") || "your session";
}

export function renderNotification(
  type: NotificationType,
  payload: Payload
): RenderedNotification {
  const child = text(payload, "child_name", "your child");
  const token = text(payload, "seq", "");
  const tokenLabel = token ? `Token ${token}` : "Your token";

  switch (type) {
    case "third_in_line":
      return {
        title: `${tokenLabel}: you're 3rd in line`,
        body: `Two children are ahead of ${child}. Please make your way to the clinic.`,
        url: "/queue",
      };
    case "your_turn":
      return {
        title: `${tokenLabel}: it's your turn now`,
        body: `Please bring ${child} in to see the doctor.`,
        url: "/queue",
      };
    case "follow_up_reminder":
      return {
        title: `Follow-up due for ${child}`,
        body: `The doctor asked to see ${child} again on ${
          formatDay(payload.follow_up_date) ?? "the planned date"
        }. You can book an appointment in the app.`,
        url: "/appointments",
      };
    case "appointment_tomorrow":
      return {
        title: `Appointment tomorrow for ${child}`,
        body: `${sessionLabel(payload)}. Check in with the app when you arrive.`,
        url: "/appointments",
      };
    case "appointment_today":
      return {
        title: `Appointment today for ${child}`,
        body: `${sessionLabel(payload)}. Check in with the app when you arrive.`,
        url: "/appointments",
      };
    case "booking_request": {
      // Sent when a parent books, or moves a booking. No approval needed.
      const reason =
        payload.visit_reason === "vaccination"
          ? "Vaccination"
          : payload.visit_reason === "general_checkup"
            ? "General checkup"
            : null;
      return {
        title: `New appointment: ${child}`,
        body: [sessionLabel(payload), reason].filter(Boolean).join(" · "),
        url: "/admin/appointments",
      };
    }
    case "booking_update":
      return payload.decision === "approved"
        ? {
            title: `Appointment confirmed for ${child}`,
            body: `${sessionLabel(payload)}. Check in with the app when you arrive.`,
            url: "/appointments",
          }
        : {
            title: `Appointment not approved for ${child}`,
            body: `The doctor couldn't take the ${sessionLabel(payload)} slot. Please book another time.`,
            url: "/appointments",
          };
    case "appointment_changed":
      return payload.change === "cancelled"
        ? {
            title: "Your appointment has been cancelled.",
            body: `The clinic cancelled ${child}'s appointment (${sessionLabel(payload)}). You can book another time in the app.`,
            url: "/appointments",
          }
        : {
            title: `Appointment moved for ${child}`,
            body: `The clinic moved ${child}'s appointment to ${sessionLabel(payload)}.`,
            url: "/appointments",
          };
  }
}
