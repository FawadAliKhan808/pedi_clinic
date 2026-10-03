"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstallPrompt } from "@/components/parent/install-and-notifications";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/format";
import { forgetShown } from "@/lib/last-shown";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await getBrowserApi().auth.signInWithPassword(email.trim(), password);
      forgetShown();
      // /admin routes each role to its own home (the owner to /owner).
      router.replace("/admin");
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
        <h1 className="text-2xl font-bold text-foreground">Staff sign in</h1>
        <p className="text-foreground-muted">
          For the doctor and pharmacy team. Parents sign in with their phone number.
        </p>
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

      {/* In a browser tab, ask to install the staff app (opens straight to /admin). */}
      <InstallPrompt variant="bar" audience="staff" />
    </form>
  );
}
