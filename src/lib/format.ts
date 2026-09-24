import type { ISODateString, PaymentMode, VisitReason, VisitStatus } from "@/lib/api";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Age is always derived from date of birth — never stored. */
export function formatAge(dob: ISODateString): string {
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();

  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;

  if (months < 1) {
    const days = Math.max(
      0,
      Math.floor((now.getTime() - birth.getTime()) / 86_400_000)
    );
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (months < 24) return `${months} mo`;

  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder === 0 ? `${years}y` : `${years}y ${remainder}m`;
}

export function formatDate(date: ISODateString): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Wed, 24 Sept" — for session and appointment lists. */
export function formatDayShort(date: ISODateString): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "09:30:00" → "9:30 am". Session times are clinic-local wall-clock times. */
export function formatClock(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

/**
 * "Evening · 6:00 pm – 9:00 pm" when a session matches one of the clinic's
 * presets, otherwise just the time range.
 */
export function formatSession(
  session: { startTime: string; endTime: string },
  presets: { label: string; startTime: string; endTime: string }[] = []
): string {
  const range = formatTimeRange(session.startTime, session.endTime);
  const preset = presets.find(
    (item) =>
      item.startTime.slice(0, 5) === session.startTime.slice(0, 5) &&
      item.endTime.slice(0, 5) === session.endTime.slice(0, 5)
  );
  return preset ? `${preset.label} · ${range}` : range;
}

/**
 * Reads a clock time typed any common way — "6", "6pm", "6:30 pm", "18:30",
 * "1830" — as "HH:MM" (24-hour), or null if it can't be read. A bare hour
 * from 1 to 12 without am/pm takes `fallbackPeriod` (the AM/PM toggle next
 * to the field); with no fallback it's ambiguous and left unread. Typed am/pm
 * always wins.
 */
export function parseClockInput(input: string, fallbackPeriod?: "am" | "pm"): string | null {
  const match = input
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .match(/^(\d{1,2})(?:[:\s]?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const period =
    match[3]?.[0] ?? (hours >= 1 && hours <= 12 ? fallbackPeriod?.[0] : undefined);
  if (minutes > 59) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (period === "p" ? 12 : 0);
  } else if (hours < 13 && hours !== 0) {
    return null;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Adds days to a 'YYYY-MM-DD' date without timezone drift. */
export function addDays(date: ISODateString, days: number): ISODateString {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
export function weekStart(date: ISODateString): ISODateString {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

/** Tolerates empty/partial input from a money field; never returns NaN. */
export function parseAmount(input: string): number {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

export const paymentModeLabels: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
};

export const visitReasonLabels: Record<VisitReason, string> = {
  vaccination: "Vaccination",
  general_checkup: "General checkup",
};

export const visitStatusLabels: Record<VisitStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  in_consultation: "In consultation",
  completed: "Completed",
  skipped: "Skipped",
  removed: "Removed",
};

/** Tailwind colour token per status — keeps status colour coding consistent everywhere. */
export const visitStatusColors: Record<VisitStatus, string> = {
  waiting: "bg-status-waiting",
  called: "bg-status-called",
  in_consultation: "bg-status-in-consultation",
  completed: "bg-status-completed",
  skipped: "bg-status-skipped",
  removed: "bg-status-removed",
};

/**
 * Supabase stores phone numbers as digits only, and this demo's test numbers
 * are registered as bare 10-digit Indian mobiles — so we send exactly what was
 * typed, minus formatting. Production (with DLT-registered SMS) will need
 * proper E.164 handling.
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

/** Turns an ApiError code into copy a parent or doctor can act on. */
export function errorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "DAILY_TOKEN_LIMIT_REACHED":
      return "You've reached today's token limit for this phone number. Please check with reception.";
    case "ACTIVE_CONSULTATION_EXISTS":
      return "Finish or skip the current consultation first.";
    case "PAYMENT_TOTAL_MISMATCH":
      return "The payment amounts must add up to the total exactly.";
    case "PRESCRIPTION_UPLOAD_FAILED":
      return "That photo didn't upload. Check your connection and retake it.";
    case "SESSION_FULL":
      return "That session just filled up. Please pick another time.";
    case "APPOINTMENT_NOT_FOUND":
      return "That booking isn't available any more.";
    case "OUTSIDE_BOOKING_WINDOW":
      return "That date is too far ahead to book yet.";
    case "SESSION_IN_PAST":
      return "That session has already finished.";
    case "SESSION_CANCELLED":
      return "That session was cancelled. Please pick another time.";
    case "SESSION_OVERLAP":
      return "That overlaps another session on the same day.";
    case "INVALID_SESSION_TIMES":
      return "The end time must be after the start time.";
    case "ALREADY_RATED":
      return "You've already rated the app — thank you!";
    case "INVALID_RANGE":
      return "Pick a range of one year or less, with the start before the end.";
    case "INVALID_APPOINTMENT_STATUS":
      return "That appointment can't be changed any more.";
    case "INVALID_STATUS_TRANSITION":
      return "That action isn't available for this token any more.";
    case "FORBIDDEN":
      return "You don't have access to do that.";
    case "AUTH_OTP_VERIFY_FAILED":
      return "That code didn't work. Check it and try again.";
    case "AUTH_OTP_REQUEST_FAILED":
      return "We couldn't send the code. Check the number and try again.";
    case "AUTH_PASSWORD_SIGNIN_FAILED":
      return "Wrong email or password.";
    case "NO_CLINIC_CONFIGURED":
      return "The clinic isn't set up yet.";
    default:
      return "Something went wrong. Please try again.";
  }
}
