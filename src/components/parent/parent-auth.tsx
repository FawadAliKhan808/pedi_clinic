"use client";

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CircleCheck,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DoctorProfileView } from "@/components/parent/doctor-profile-view";
import { InstallPrompt } from "@/components/parent/install-and-notifications";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { DoctorProfile } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, formatPhone } from "@/lib/format";

const CODE_LENGTH = 6;
/** Seconds before "Resend" unlocks, so a parent doesn't fire off several SMS. */
const RESEND_AFTER = 30;

/**
 * Digits only, at most 10. Autofill and paste often bring "+91 98765 43210"
 * or "098765 43210", so a leading country code or trunk 0 is dropped first.
 */
function toTenDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * Parent sign-in: mobile number, then the 6-digit SMS code. The clinic's
 * doctor is introduced up top (from the doctor_profile setting, when it can be
 * read), and the install banner sits at the bottom in a browser tab.
 */
export function ParentAuth({ onSignedIn }: { onSignedIn: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);

  const phoneValid = phone.length === 10;

  useEffect(() => {
    let cancelled = false;
    // Optional: without it the screen simply leaves the doctor out.
    getBrowserApi()
      .clinic.getDoctorProfile()
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    if (!phoneValid) {
      setPhoneTouched(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getBrowserApi().auth.requestPhoneOtp(phone);
      setCode("");
      setStep("code");
      setResendIn(RESEND_AFTER);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError(null);
    try {
      await getBrowserApi().auth.requestPhoneOtp(phone);
      setCode("");
      setResendIn(RESEND_AFTER);
      toast("New code sent", "success");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function verifyCode(value = code) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await getBrowserApi().auth.verifyPhoneOtp(phone, value);
      onSignedIn();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  function changeNumber() {
    setStep("phone");
    setCode("");
    setError(null);
  }

  const phoneHint =
    phoneTouched && phone.length > 0 && !phoneValid
      ? `Enter all 10 digits (${phone.length} so far).`
      : null;

  return (
    <div className="flex w-full flex-1 flex-col bg-surface-sunken">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          {step === "code" && (
            <button
              type="button"
              aria-label="Back to mobile number"
              onClick={changeNumber}
              className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-primary-700 active:scale-95 dark:text-primary-300"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <BrandMark />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-foreground">
              Pedi Clinic
            </p>
            {/* The doctor has their own card below; up here, just where the clinic is. */}
            {profile?.location && (
              <p className="truncate text-sm text-foreground-muted">{profile.location}</p>
            )}
          </div>
        </header>

        {profile && step === "phone" && (
          <DoctorCard profile={profile} onOpen={() => setDoctorOpen(true)} />
        )}

        <main className="my-auto rounded-xl border border-border bg-surface-raised p-5 shadow-md">
          {step === "phone" ? (
            <form
              className="flex flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void sendCode();
              }}
            >
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Parent sign in
              </h1>
              <p className="mt-1 text-sm text-foreground-muted">
                Enter your 10-digit mobile number to check in.
              </p>

              <label htmlFor="parent-phone" className="sr-only">
                Mobile number
              </label>
              <div
                className={cn(
                  "mt-5 flex h-14 items-center gap-2 rounded-full border bg-surface px-4 transition-colors",
                  "focus-within:border-primary-600 focus-within:ring-1 focus-within:ring-primary-600",
                  phoneHint || error ? "border-danger" : "border-border"
                )}
              >
                <Phone aria-hidden className="size-5 shrink-0 text-foreground-muted" />
                <span className="font-display text-base font-bold text-foreground">+91</span>
                <span aria-hidden className="h-6 w-px bg-border" />
                <input
                  id="parent-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={formatPhone(phone)}
                  onChange={(event) => {
                    setPhone(toTenDigits(event.target.value));
                    setError(null);
                  }}
                  onBlur={() => setPhoneTouched(true)}
                  aria-invalid={Boolean(phoneHint || error)}
                  aria-describedby="parent-phone-note"
                  className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold tracking-wide text-foreground placeholder:font-normal placeholder:text-neutral-400 focus:outline-none dark:placeholder:text-neutral-600"
                />
                {phoneValid ? (
                  <CircleCheck aria-label="Valid number" className="size-5 shrink-0 text-success" />
                ) : (
                  phone.length > 0 && (
                    <button
                      type="button"
                      aria-label="Clear number"
                      onClick={() => {
                        setPhone("");
                        setPhoneTouched(false);
                        document.getElementById("parent-phone")?.focus();
                      }}
                      className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
                    >
                      <X className="size-4" />
                    </button>
                  )
                )}
              </div>

              <p id="parent-phone-note" className="mt-2.5 flex items-start gap-1.5 text-sm">
                {phoneHint || error ? (
                  <span className="text-danger">{phoneHint ?? error}</span>
                ) : (
                  <>
                    <ShieldCheck
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-primary-700 dark:text-primary-300"
                    />
                    <span className="text-foreground-muted">
                      We&apos;ll send a 6-digit verification code. No password needed.
                    </span>
                  </>
                )}
              </p>

              <PillButton type="submit" loading={busy} disabled={!phoneValid} className="mt-5">
                Send verification code
              </PillButton>
            </form>
          ) : (
            <form
              className="flex flex-col items-center text-center"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyCode();
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                <MessageSquareText aria-hidden className="size-6" />
              </span>
              <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
                Enter verification code
              </h1>
              <p className="mt-2 text-sm text-foreground-muted">
                We sent a 6-digit code to{" "}
                <strong className="whitespace-nowrap font-display text-base font-bold tabular-nums text-foreground">
                  +91 {formatPhone(phone)}
                </strong>{" "}
                <button
                  type="button"
                  onClick={changeNumber}
                  className="inline-flex min-h-10 items-center px-1 font-semibold text-primary-700 underline underline-offset-4 dark:text-primary-300"
                >
                  Change
                </button>
              </p>

              <CodeInput
                value={code}
                invalid={Boolean(error)}
                onChange={(value) => {
                  setCode(value);
                  setError(null);
                  // A full code (typed, pasted or filled in from the SMS) goes straight in.
                  if (value.length === CODE_LENGTH) void verifyCode(value);
                }}
              />

              <p className="mt-3 min-h-5 text-sm" aria-live="polite">
                {error ? (
                  <span className="text-danger">{error}</span>
                ) : (
                  <span className="text-foreground-muted">
                    Your phone may offer to fill in the code from the SMS.
                  </span>
                )}
              </p>

              {resendIn > 0 ? (
                <p className="mt-2 flex min-h-12 items-center text-sm text-foreground-muted tabular-nums">
                  Resend code in 0:{String(resendIn).padStart(2, "0")}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void resendCode()}
                  className="mt-2 min-h-12 px-3 text-sm font-bold text-primary-700 underline underline-offset-4 dark:text-primary-300"
                >
                  Resend SMS code now
                </button>
              )}

              <PillButton
                type="submit"
                loading={busy}
                disabled={code.length !== CODE_LENGTH}
                className="mt-3 w-full"
              >
                Verify &amp; continue
              </PillButton>
            </form>
          )}
        </main>

        {/* A browser tab asks to install from the very first screen; the installed app never does. */}
        <InstallPrompt variant="bar" />
      </div>

      {profile && (
        <Sheet open={doctorOpen} onClose={() => setDoctorOpen(false)} title="Your doctor">
          <DoctorProfileView profile={profile} />
        </Sheet>
      )}
    </div>
  );
}

/** The app mark: the white cross on teal, same as the home-screen icon. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-600 shadow-sm"
    >
      <span className="absolute h-2.5 w-7 rounded-full bg-neutral-0" />
      <span className="absolute h-7 w-2.5 rounded-full bg-neutral-0" />
    </span>
  );
}

function DoctorCard({ profile, onOpen }: { profile: DoctorProfile; onOpen: () => void }) {
  const details = [profile.experience, ...profile.qualifications.slice(0, 2)]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-primary-100 bg-primary-50 px-3 py-2.5 text-left dark:border-primary-900 dark:bg-primary-900/20"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-primary-700 shadow-sm dark:text-primary-300">
        <Stethoscope aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{profile.name}</span>
        <span className="block truncate text-xs text-primary-800 dark:text-primary-200">
          {details}
        </span>
      </span>
      <span className="flex shrink-0 items-center text-sm font-bold text-primary-700 dark:text-primary-300">
        {/* On the narrowest phones the name needs the room; the chevron still says "more". */}
        <span className="hidden min-[360px]:inline">Know doctor</span>
        <ChevronRight aria-hidden className="size-4" />
      </span>
    </button>
  );
}

/** The coral, full-pill main action from the design. */
function PillButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      variant="accent"
      className={cn(
        "min-h-[52px] rounded-full font-display text-base font-bold shadow-md active:scale-[0.98]",
        className
      )}
    >
      {children}
      {!props.loading && <ArrowRight aria-hidden className="size-5" />}
    </Button>
  );
}

/**
 * Six boxes over one real input, so the phone's "fill in code from SMS",
 * paste and the number pad all work as usual. The boxes only draw the value.
 */
function CodeInput({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative mt-6 w-full max-w-[21rem]">
      <label htmlFor="parent-code" className="sr-only">
        Verification code
      </label>
      <input
        ref={inputRef}
        id="parent-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={invalid}
        className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0"
      />
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const digit = value[index];
          const active = focused && index === Math.min(value.length, CODE_LENGTH - 1);
          return (
            <span
              key={index}
              className={cn(
                "relative flex h-14 items-center justify-center rounded-md border font-display text-3xl font-bold tabular-nums transition-colors",
                invalid
                  ? "border-danger bg-surface text-danger"
                  : active
                    ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
                    : "border-border bg-surface-sunken text-primary-700 dark:text-primary-200"
              )}
            >
              {digit ??
                (active ? (
                  <span className="h-6 w-0.5 rounded-full bg-primary-600 motion-safe:animate-pulse" />
                ) : (
                  <span className="size-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                ))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
