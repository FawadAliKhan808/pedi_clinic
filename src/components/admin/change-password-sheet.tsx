"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/format";

/** Matches the Auth setting (minimum_password_length in supabase/config.toml). */
const MIN_LENGTH = 6;

/**
 * Current password first (checked by signing in with it), then the new one
 * twice. Mistakes show on the field that has them.
 */
export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const same = next.length > 0 && next === current;
  const ready = current.length > 0 && next.length >= MIN_LENGTH && confirm === next && !same;

  function close() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setCurrentError(null);
    onClose();
  }

  async function save() {
    if (!ready) return;
    setBusy(true);
    setCurrentError(null);
    try {
      await getBrowserApi().auth.changePassword(current, next);
      toast("Password changed", "success");
      close();
    } catch (caught) {
      if ((caught as { code?: string }).code === "WRONG_PASSWORD") {
        setCurrentError(errorMessage(caught));
      } else {
        toast(errorMessage(caught), "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Change password"
      footer={
        <Button fullWidth loading={busy} disabled={!ready} onClick={() => void save()}>
          Change password
        </Button>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
            setCurrentError(null);
          }}
          error={currentError ?? undefined}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          hint={`At least ${MIN_LENGTH} characters.`}
          error={
            tooShort
              ? `At least ${MIN_LENGTH} characters.`
              : same
                ? "Choose a different password from your current one."
                : undefined
          }
        />
        <TextField
          label="New password again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={mismatch ? "The two new passwords don't match." : undefined}
        />
        {/* Enter submits from any field. */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  );
}
