import type { ISODateString, PaymentMode, VisitReason, VisitStatus } from "@/lib/api";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Exact age from a date of birth, in whole years, months and days — so the
 * doctor can track vaccine schedules. Computed like a calendar: count whole
 * years, then whole months, then the days left (borrowing the length of the
 * previous month when needed). `asOf` defaults to today.
 */
export function ageParts(
  dob: ISODateString,
  asOf: Date = new Date()
): { years: number; months: number; days: number } {
  const [birthYear, birthMonth, birthDay] = dob.split("-").map(Number);
  let years = asOf.getFullYear() - birthYear;
  let months = asOf.getMonth() + 1 - birthMonth;
  let days = asOf.getDate() - birthDay;

  if (days < 0) {
    months -= 1;
    // Days in the month before asOf's month.
    days += new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: 0, months: 0, days: 0 };
  return { years, months, days };
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * "2 years, 3 months, 5 days"; for infants "3 months, 5 days" or "12 days".
 * Age is always derived from date of birth — never stored.
 */
export function formatAge(dob: ISODateString, asOf?: Date): string {
  const { years, months, days } = ageParts(dob, asOf);
  if (years > 0) {
    return [plural(years, "year"), plural(months, "month"), plural(days, "day")].join(", ");
  }
  if (months > 0) return `${plural(months, "month")}, ${plural(days, "day")}`;
  return plural(days, "day");
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

/**
 * Phone numbers are exactly 10 digits — no more, no less, digits only
 * (spaces are tolerated while typing). Used by every phone field.
 */
export function isValidPhone(input: string): boolean {
  return /^\d{10}$/.test(input.replace(/\s/g, ""));
}

/** The message a phone field shows while its value isn't a valid number yet. */
export function phoneError(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (/[^\d\s]/.test(trimmed)) return "Use digits only.";
  const digits = trimmed.replace(/\s/g, "").length;
  if (digits < 10) return `Enter all 10 digits (${digits} so far).`;
  if (digits > 10) return "That's more than 10 digits.";
  return undefined;
}

/** Today as "YYYY-MM-DD" on this device — the max for date-of-birth pickers. */
export function todayISO(): ISODateString {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

/** 12.4 → "12.4 kg"; 12 → "12 kg"; 3.25 → "3.25 kg". */
export function formatWeight(kg: number): string {
  return `${Number(kg.toFixed(2)).toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;
}

/**
 * What someone typed in a weight box ("12.4", "12,4", " 9 ") as kg, or null
 * if it isn't a plausible child's weight (above 0, under 200 kg).
 */
export function parseWeightInput(text: string): number | null {
  const value = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(value) || value <= 0 || value >= 200) return null;
  return Math.round(value * 100) / 100;
}

/** Turns an ApiError code into copy a parent or doctor can act on. */
export function errorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "ACTIVE_CONSULTATION_EXISTS":
      return "Finish or skip the current consultation first.";
    case "PAYMENT_TOTAL_MISMATCH":
      return "The payment amounts must add up to the total exactly.";
    case "PRESCRIPTION_UPLOAD_FAILED":
      return "That photo didn't upload. Check your connection and retake it.";
    case "SESSION_FULL":
      return "That session just filled up. Please pick another time.";
    case "WRONG_PASSWORD":
      return "Your current password isn't right.";
    case "WEAK_PASSWORD":
      return "Choose a longer password — at least 6 characters.";
    case "SAME_PASSWORD":
      return "The new password must be different from the current one.";
    case "CHECKIN_CODE_INVALID":
      return "That check-in code isn't valid any more. Scan the QR code at reception again.";
    case "ACTIVE_TOKEN_EXISTS":
      return "This child is already in the queue. They can check in again once this visit is over.";
    case "APPOINTMENT_EXISTS_FOR_DAY":
      return "This child already has an appointment that day.";
    case "INVALID_PHONE":
      return "Enter a 10-digit phone number.";
    case "INVALID_DOB":
      return "The date of birth can't be in the future.";
    case "CHILD_HAS_VISITS":
      return "This child has visit records, so they can't be deleted. You can still edit their details.";
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
    case "INVALID_WEIGHT":
      return "Enter the weight in kg, for example 12.4.";
    case "VISIT_NOT_ACTIVE":
      return "This visit is over, so its weight can't be changed here any more.";
    case "NOT_AUTHORIZED":
      return "You don't have access to do that.";
    default:
      return "Something went wrong. Please try again.";
  }
}
