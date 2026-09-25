"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, isValidPhone, normalizePhone, phoneError } from "@/lib/format";

export function ParentAuth({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizePhone(phone);

  async function sendCode() {
    // Exactly 10 digits, or nothing is sent.
    if (!isValidPhone(phone)) return;
    setBusy(true);
    setError(null);
    try {
      await getBrowserApi().auth.requestPhoneOtp(normalized);
      setStep("code");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      await getBrowserApi().auth.verifyPhoneOtp(normalized, code.trim());
      onSignedIn();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-foreground">Pedi Clinic</h1>
        <p className="text-foreground-muted">
          {step === "phone"
            ? "Check in for your child's visit and follow the queue from your phone."
            : `Enter the 6-digit code we sent to ${normalized}.`}
        </p>
      </div>

      {step === "phone" ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <TextField
            label="Mobile number"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="10-digit mobile number"
            maxLength={12}
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setError(null);
            }}
            error={phoneError(phone) ?? error ?? undefined}
          />
          <Button type="submit" fullWidth loading={busy} disabled={!isValidPhone(phone)}>
            Send code
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyCode();
          }}
        >
          <TextField
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth loading={busy} disabled={code.trim().length < 6}>
            Verify
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={() => {
              setStep("phone");
              setCode("");
              setError(null);
            }}
          >
            Use a different number
          </Button>
        </form>
      )}
    </div>
  );
}
