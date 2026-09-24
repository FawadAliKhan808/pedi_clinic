"use client";

import { BellRing } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  isStandalone,
  NOTIFY_AFTER_BOOKING,
  NOTIFY_AFTER_TOKEN,
  NOTIFY_DISMISSED_THIS_VISIT,
  NOTIFY_HOME_SHOWN_THIS_VISIT,
  sessionFlag,
} from "@/lib/pwa/environment";
import { useJustInstalled } from "@/lib/pwa/install-prompt";
import { enableNotifications, useNotificationPermission } from "@/lib/pwa/push";

type Moment = "home" | "token" | "booking";

const copy: Record<Moment, { title: string; body: string }> = {
  home: {
    title: "Get live alerts when your turn is approaching",
    body: "We'll let you know when you're 3rd in line and the moment the doctor calls you — no need to keep watching the screen.",
  },
  token: {
    title: "Want an alert when it's almost your turn?",
    body: "You're in the queue. Turn on notifications and we'll tell you when you're 3rd in line and when the doctor calls you.",
  },
  booking: {
    title: "Get reminded about this appointment",
    body: "Turn on notifications for a reminder the evening before and on the day, and live alerts once you're in the queue.",
  },
};

/**
 * Asks for notification permission at the moments it makes sense, and never
 * nags:
 *   - a soft modal once per visit, the first time the parent lands on Home;
 *   - the same modal right after they join the queue or book an appointment
 *     (the check-in and booking screens leave a flag for the next screen);
 *   - "Not now" ends modals for the visit; a compact banner at the top keeps a
 *     one-tap way to turn them on.
 * Once the browser's answer is granted or denied, everything here disappears.
 *
 * Modals only appear in the installed app. In a browser tab the install prompt
 * owns those moments, so notifications get the banner only. Where there's no
 * push support at all (Safari before the app is installed) nothing shows.
 */
export function NotificationPermissionPrompt() {
  const toast = useToast();
  const pathname = usePathname();
  const permission = useNotificationPermission();
  const justInstalled = useJustInstalled();
  const [moment, setMoment] = useState<Moment | null>(null);
  // Read on the client after mount: whether modals are allowed here, and
  // whether the parent already said "Not now" this visit.
  const [context, setContext] = useState<{ standalone: boolean; dismissed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const turnOnRef = useRef<HTMLButtonElement>(null);

  const undecided = permission === "default" && !justInstalled;

  useEffect(() => {
    if (!undecided) return;
    // A tick after the screen draws, so the modal isn't the first thing painted.
    const timer = setTimeout(() => {
      const standalone = isStandalone();
      const dismissed = sessionFlag.get(NOTIFY_DISMISSED_THIS_VISIT);
      setContext({ standalone, dismissed });
      if (!standalone || dismissed) return;

      // High-intent moments first: the parent just joined the queue or booked.
      if (sessionFlag.get(NOTIFY_AFTER_TOKEN)) {
        sessionFlag.set(NOTIFY_AFTER_TOKEN, false);
        setMoment("token");
      } else if (sessionFlag.get(NOTIFY_AFTER_BOOKING)) {
        sessionFlag.set(NOTIFY_AFTER_BOOKING, false);
        setMoment("booking");
      } else if (pathname === "/" && !sessionFlag.get(NOTIFY_HOME_SHOWN_THIS_VISIT)) {
        sessionFlag.set(NOTIFY_HOME_SHOWN_THIS_VISIT, true);
        setMoment("home");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [undecided, pathname]);

  const modalOpen = undecided && moment !== null;

  useEffect(() => {
    if (!modalOpen) return;
    turnOnRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  function dismiss() {
    sessionFlag.set(NOTIFY_DISMISSED_THIS_VISIT, true);
    setContext((current) => current && { ...current, dismissed: true });
    setMoment(null);
  }

  async function turnOn() {
    setBusy(true);
    try {
      const result = await enableNotifications();
      if (result === "granted") toast("Notifications are on", "success");
      else if (result === "denied")
        toast("Notifications are blocked — you can allow them in your phone's settings.", "info");
      setMoment(null);
    } catch {
      toast("Couldn't turn on notifications. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!undecided || !context) return null;

  if (modalOpen) {
    const { title, body } = copy[moment];
    return (
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-neutral-900/50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
        onClick={(event) => {
          if (event.target === event.currentTarget) dismiss();
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
              {title}
            </h2>
            <p id="notify-body" className="text-foreground-muted">
              {body}
            </p>
          </div>
          <Button ref={turnOnRef} fullWidth variant="accent" loading={busy} onClick={() => void turnOn()}>
            Turn on notifications
          </Button>
          <Button fullWidth variant="ghost" disabled={busy} onClick={dismiss}>
            Not now
          </Button>
        </div>
      </div>
    );
  }

  // After "Not now" (or in a browser tab): a compact, non-blocking banner.
  if (context.dismissed || !context.standalone) {
    return (
      <div
        role="region"
        aria-label="Notifications"
        className="sticky top-0 z-30 flex items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] dark:border-accent-900 dark:bg-accent-900/30"
      >
        <BellRing aria-hidden className="size-4 shrink-0 text-accent-600" />
        <p className="min-w-0 flex-1 text-sm text-foreground">
          Enable notifications for live queue alerts
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void turnOn()}
          className="min-h-9 shrink-0 rounded-full bg-accent-600 px-4 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60"
        >
          Turn on
        </button>
      </div>
    );
  }

  return null;
}
