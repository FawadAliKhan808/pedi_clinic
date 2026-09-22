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
  | "appointment_changed";

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
        body: `The doctor asked to see ${child} again on ${text(payload, "follow_up_date", "the planned date")}.`,
        url: "/records",
      };
    case "appointment_tomorrow":
      return {
        title: `Appointment tomorrow for ${child}`,
        body: `${text(payload, "session_label", "Your session")} — check in when you arrive.`,
        url: "/",
      };
    case "appointment_today":
      return {
        title: `Appointment today for ${child}`,
        body: `${text(payload, "session_label", "Your session")} — check in when you arrive.`,
        url: "/",
      };
    case "appointment_changed":
      return {
        title: `Appointment update for ${child}`,
        body: text(
          payload,
          "message",
          "The clinic changed your appointment. Open the app for details."
        ),
        url: "/",
      };
  }
}
