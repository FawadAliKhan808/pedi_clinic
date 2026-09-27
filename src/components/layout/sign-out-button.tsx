"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { getBrowserApi } from "@/lib/api/browser";
import { cn } from "@/lib/format";

/**
 * Signs out and reloads at `redirectTo`. A full reload (rather than client
 * navigation) guarantees no signed-in state survives on a shared device.
 */
export function useSignOut(redirectTo: string): { signOut: () => Promise<void>; busy: boolean } {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await getBrowserApi().auth.signOut();
    } finally {
      window.location.assign(redirectTo);
    }
  }

  return { signOut, busy };
}

export function SignOutButton({
  redirectTo,
  variant,
  className,
}: {
  redirectTo: string;
  variant: "icon" | "sidebar";
  className?: string;
}) {
  const { signOut, busy } = useSignOut(redirectTo);

  if (variant === "icon") {
    return (
      <button
        aria-label="Sign out"
        disabled={busy}
        onClick={() => void signOut()}
        className={cn(
          "flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken",
          className
        )}
      >
        <LogOut className="size-5" />
      </button>
    );
  }

  // Matches the nav items: stacked in the tablet rail, a row in the laptop sidebar.
  return (
    <button
      disabled={busy}
      onClick={() => void signOut()}
      className={cn(
        "flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold text-foreground-muted hover:bg-surface-sunken",
        "lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm",
        className
      )}
    >
      <LogOut className="size-5" />
      Sign out
    </button>
  );
}
