"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/format";

export default function OwnerLoginPage() {
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
      const staff = await api.auth.getStaffRole();
      if (staff?.role !== "owner") {
        // Clinic staff have their own terminal; don't leave them signed in here.
        await api.auth.signOut();
        setError("This sign-in is for the Pedi Clinic team only. Clinic staff sign in at /admin.");
        setBusy(false);
        return;
      }
      router.replace("/owner");
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
        <h1 className="text-2xl font-bold text-foreground">Team sign in</h1>
        <p className="text-foreground-muted">
          For the Pedi Clinic product team: ratings, adoption, and usage.
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
    </form>
  );
}
