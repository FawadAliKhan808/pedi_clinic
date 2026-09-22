import type { ISODateString, VisitReason, VisitStatus } from "@/lib/api";

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
    case "ACTIVE_TOKEN_EXISTS":
      return "This child already has a token for today.";
    case "DAILY_TOKEN_LIMIT_REACHED":
      return "You've reached today's token limit for this phone number. Please check with reception.";
    case "ACTIVE_CONSULTATION_EXISTS":
      return "Finish or skip the current consultation first.";
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
