"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstallPrompt } from "@/components/parent/install-and-notifications";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getBrowserApi } from "@/lib/api/browser";
import { homeFor, staffAreas, type ClinicStaffRole } from "@/lib/auth/staff-areas";
import { errorMessage } from "@/lib/format";
import { forgetShown } from "@/lib/last-shown";

const blurbs: Record<ClinicStaffRole, string> = {
  doctor: "For the doctor. Parents sign in with their phone number.",
  pharmacist: "For the clinic's pharmacy: today's prescriptions and stock.",
  receptionist: "For the front desk: today's queue and walk-ins.",
};

/**
 * Email and password sign-in for one clinic role. Whoever signs in lands in
 * their own area, even from another role's page, so a wrong link never
 * strands anyone.
 */
export function StaffLogin({ area }: { area: ClinicStaffRole }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const api = getBrowserApi();
    try {
      await api.auth.signInWithPassword(email.trim(), password);
      forgetShown();
      const staff = await api.auth.getStaffRole();
      if (!staff) {
        await api.auth.signOut();
        setError("This account isn't set up for the clinic. Ask the clinic to add you.");
        setBusy(false);
        return;
      }
      router.replace(homeFor(staff.role));
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10"
      onSubmit={(event) => {
        event.preventDefault();
        void signIn();
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">{staffAreas[area].name} sign in</h1>
        <p className="text-foreground-muted">{blurbs[area]}</p>
      </div>

      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error ?? undefined}
      />

      <Button type="submit" fullWidth loading={busy} disabled={!email.trim() || !password}>
        Sign in
      </Button>

      {/* In a browser tab, ask to install this area's app. */}
      <InstallPrompt variant="bar" audience={area} />
    </form>
  );
}
