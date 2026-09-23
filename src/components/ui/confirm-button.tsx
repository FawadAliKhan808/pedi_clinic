"use client";

import { useEffect, useState } from "react";
import { Button } from "./button";

/**
 * Destructive actions take two taps instead of a confirmation dialog: the
 * first arms the button ("Tap again to cancel"), the second acts. It disarms
 * itself after a few seconds.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className,
  variant = "secondary",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  className?: string;
  variant?: "secondary" | "ghost";
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      className={className}
      variant={armed ? "danger" : variant}
      loading={busy}
      onClick={async () => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
