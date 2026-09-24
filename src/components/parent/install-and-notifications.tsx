"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { getBrowserApi } from "@/lib/api/browser";
import {
  detectPlatform,
  INSTALL_DISMISSED_THIS_VISIT,
  isInAppBrowser,
  isStandalone,
  sessionFlag,
  SHOW_INSTALL_AFTER_TOKEN,
  type Platform,
} from "@/lib/pwa/environment";
import { promptInstall, useInstallPrompt } from "@/lib/pwa/install-prompt";
import { syncPushSubscription, useNotificationPermission } from "@/lib/pwa/push";

/**
 * Drives the two adoption steps the brief cares about:
 *  - in a browser tab: get the app installed (popup every visit until it is;
 *    "Not now" hides it for this visit only, leaving a small banner);
 *  - in the installed app: get notifications turned on (asked on every open
 *    until granted; once blocked, explain how to unblock in phone Settings).
 *
 * Only ever mounted after the parent's data has loaded, i.e. client-side, so
 * reading window/sessionStorage in state initialisers is safe here.
 */
export function InstallAndNotifications() {
  const [standalone] = useState(isStandalone);
  return standalone ? <InstalledAppNotifications /> : <BrowserInstallPrompt />;
}

// ---------------------------------------------------------------------------
// In the installed app
// ---------------------------------------------------------------------------

/**
 * In the installed app: records the install, keeps the push subscription
 * fresh, and — if notifications were blocked — explains how to unblock them.
 * Asking to turn them on is NotificationPermissionPrompt's job.
 */
function InstalledAppNotifications() {
  const permission = useNotificationPermission();
  const [platform] = useState<Platform>(detectPlatform);

  useEffect(() => {
    // Reports "installed" once per install; the server ignores repeats.
    if (!sessionFlag.get("pedi.installRecorded")) {
      sessionFlag.set("pedi.installRecorded", true);
      void getBrowserApi().notifications.recordInstall().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    // Subscriptions can rotate; re-sync quietly on each open.
    if (permission === "granted") {
      void syncPushSubscription().catch(() => undefined);
    }
  }, [permission]);

  if (permission !== "denied") return null;

  return (
    <Card className="flex flex-col gap-2 border-warning/40 bg-warning/10">
      <p className="font-semibold text-foreground">Notifications are blocked</p>
      <p className="text-sm text-foreground-muted">{unblockInstructions(platform)}</p>
    </Card>
  );
}

function unblockInstructions(platform: Platform): string {
  switch (platform) {
    case "ios":
      return "Open your iPhone's Settings → Notifications → Pedi Clinic, and turn on Allow Notifications.";
    case "android":
      return "Open your phone's Settings → Apps → Pedi Clinic → Notifications, and turn them on.";
    default:
      return "Allow notifications for this app in your browser or device settings, then reopen it.";
  }
}

// ---------------------------------------------------------------------------
// In a browser tab
// ---------------------------------------------------------------------------

function BrowserInstallPrompt() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(() => {
    // Right after getting a token, show it again even if dismissed earlier.
    if (sessionFlag.get(SHOW_INSTALL_AFTER_TOKEN)) {
      sessionFlag.set(SHOW_INSTALL_AFTER_TOKEN, false);
      return true;
    }
    return !sessionFlag.get(INSTALL_DISMISSED_THIS_VISIT);
  });

  useEffect(() => {
    let cancelled = false;
    getBrowserApi()
      .notifications.getMyInstallStatus()
      .then((status) => {
        if (!cancelled) setInstalled(status !== null);
      })
      .catch(() => {
        if (!cancelled) setInstalled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (installed === null) return null;

  if (installed) {
    return (
      <Card className="flex items-start gap-3 bg-surface-sunken">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary-600" />
        <p className="text-sm text-foreground-muted">
          You&apos;ve installed Pedi Clinic. Open it from your home screen to get
          alerts when it&apos;s your turn.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex items-center gap-3">
        <Smartphone className="size-5 shrink-0 text-primary-600" />
        <p className="flex-1 text-sm text-foreground">
          Install the app to get an alert when it&apos;s your turn.
        </p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          How
        </Button>
      </Card>

      <InstallSheet
        open={open}
        onClose={() => {
          sessionFlag.set(INSTALL_DISMISSED_THIS_VISIT, true);
          setOpen(false);
        }}
      />
    </>
  );
}

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const deferredPrompt = useInstallPrompt();
  const [platform] = useState<Platform>(detectPlatform);
  const [inAppBrowser] = useState(isInAppBrowser);

  async function install() {
    const accepted = await promptInstall();
    if (accepted) {
      toast("Installed — open Pedi Clinic from your home screen", "success");
      onClose();
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast("Link copied — paste it into Safari or Chrome", "success");
    } catch {
      toast(`Open ${window.location.host} in Safari or Chrome`, "info");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Install Pedi Clinic"
      footer={
        <div className="flex flex-col gap-2">
          {!inAppBrowser && platform !== "ios" && deferredPrompt && (
            <Button fullWidth variant="accent" onClick={() => void install()}>
              <Download className="size-5" />
              Install app
            </Button>
          )}
          <Button fullWidth variant="ghost" onClick={onClose}>
            Not now
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-foreground">
          Add Pedi Clinic to your home screen and we can send you a notification
          when you&apos;re 3rd in line and when it&apos;s your turn — no need to
          keep this page open.
        </p>

        {inAppBrowser ? (
          <Card className="flex flex-col gap-3">
            <p className="font-semibold text-foreground">Open this in your browser first</p>
            <p className="text-sm text-foreground-muted">
              This page is open inside another app, which can&apos;t install Pedi
              Clinic. Tap the menu (⋯) and choose{" "}
              <strong>Open in {platform === "ios" ? "Safari" : "Chrome"}</strong>, or
              copy the link and paste it there.
            </p>
            <Button variant="secondary" onClick={() => void copyLink()}>
              Copy link
            </Button>
          </Card>
        ) : platform === "ios" ? (
          <ol className="flex flex-col gap-3">
            <Step number={1}>
              Tap the <Share className="inline size-4 align-text-bottom" /> Share
              button at the bottom of Safari.
            </Step>
            <Step number={2}>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </Step>
            <Step number={3}>
              Tap <strong>Add</strong>, then open Pedi Clinic from your home screen.
            </Step>
          </ol>
        ) : deferredPrompt ? (
          <p className="text-sm text-foreground-muted">
            Tap <strong>Install app</strong> below. It takes a second and uses
            almost no space.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            <Step number={1}>
              Open your browser menu (<strong>⋮</strong>).
            </Step>
            <Step number={2}>
              Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </Step>
            <Step number={3}>Open Pedi Clinic from your home screen.</Step>
          </ol>
        )}
      </div>
    </Sheet>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
        {number}
      </span>
      <span className="pt-0.5 text-foreground">{children}</span>
    </li>
  );
}
