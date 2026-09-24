"use client";

import { BellRing } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { INSTALL_DISMISSED_THIS_VISIT, isStandalone, sessionFlag } from "@/lib/pwa/environment";
import { useJustInstalled } from "@/lib/pwa/install-prompt";
import { enableNotifications, useNotificationPermission } from "@/lib/pwa/push";

/** How often the pop-up comes back while notifications are still undecided. */
const REMIND_EVERY_MS = 3 * 60 * 1000;

/**
 * "Turn on notifications", asked insistently: as soon as the parent opens the
 * app, again on every screen change, and every few minutes — for as long as
 * the browser's permission is still undecided ('default'). Once it's granted
 * (or blocked, when the browser won't ask again) it never shows again.
 *
 * In a browser tab the install prompt comes first, so this waits until that
 * has been dismissed for the visit. Where the browser has no push support
 * (e.g. Safari before the app is installed) there's nothing to ask for.
 */
export function NotificationPermissionPrompt() {
  const toast = useToast();
  const pathname = usePathname();
  const permission = useNotificationPermission();
  const justInstalled = useJustInstalled();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const turnOnRef = useRef<HTMLButtonElement>(null);

  const undecided = permission === "default" && !justInstalled;

  // Ask on open and on every screen change (after the screen has drawn)…
  useEffect(() => {
    if (!undecided) return;
    const timer = setTimeout(() => {
      if (isStandalone() || sessionFlag.get(INSTALL_DISMISSED_THIS_VISIT)) setOpen(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [undecided, pathname]);

  // …and every few minutes while it's still undecided.
  useEffect(() => {
    if (!undecided) return;
    const interval = setInterval(() => {
      if (isStandalone() || sessionFlag.get(INSTALL_DISMISSED_THIS_VISIT)) setOpen(true);
    }, REMIND_EVERY_MS);
    return () => clearInterval(interval);
  }, [undecided]);

  const visible = open && undecided;

  useEffect(() => {
    if (!visible) return;
    turnOnRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  async function turnOn() {
    setBusy(true);
    try {
      const result = await enableNotifications();
      if (result === "granted") toast("Notifications are on", "success");
      else if (result === "denied") toast("Notifications are blocked — you can allow them in your phone's settings.", "info");
      setOpen(false);
    } catch {
      toast("Couldn't turn on notifications. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-neutral-900/60 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notify-title"
        aria-describedby="notify-body"
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface-raised p-6 shadow-2xl"
      >
        <span className="flex size-14 items-center justify-center self-center rounded-full bg-accent-50 dark:bg-accent-900/30">
          <BellRing aria-hidden className="size-7 text-accent-600" />
        </span>
        <div className="flex flex-col gap-2 text-center">
          <h2 id="notify-title" className="text-xl font-bold text-foreground">
            Turn on notifications
          </h2>
          <p id="notify-body" className="text-foreground-muted">
            We&apos;ll tell you when you&apos;re 3rd in line, when it&apos;s your turn, and
            about your appointments — so you don&apos;t have to keep watching the screen.
          </p>
        </div>
        <Button ref={turnOnRef} fullWidth variant="accent" loading={busy} onClick={() => void turnOn()}>
          Turn on notifications
        </Button>
        <Button fullWidth variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
