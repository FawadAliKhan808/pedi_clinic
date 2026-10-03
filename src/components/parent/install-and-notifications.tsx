"use client";

import {
  BellRing,
  Bookmark,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  ListOrdered,
  Share,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  X,
} from "lucide-react";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { brand, staffApps, type StaffAppId } from "@/brand";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { getBrowserApi } from "@/lib/api/browser";
import { cn } from "@/lib/format";
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
 *  - in a browser tab: get the app installed (popup on every visit in a tab,
 *    for any account; "Not now" hides it for this visit only, leaving a
 *    small banner). Only opening from the home screen makes it go away;
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

/**
 * The install popup alone: for the sign-in screens and the staff terminal.
 * Nothing in the installed app; the popup and banner in a browser tab. (The
 * installed-app half of InstallAndNotifications needs a signed-in parent.)
 * Renders only in the browser, since whether it's the installed app, and
 * whether "Not now" was tapped this visit, can't be known on the server.
 */
export function InstallPrompt({
  variant = "card",
  audience = "parent",
  autoOpen = true,
}: {
  variant?: BannerVariant;
  audience?: Audience;
  /** False: only the banner; the how-to opens when tapped (e.g. over a sign-in form). */
  autoOpen?: boolean;
}) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!inBrowser || isStandalone()) return null;
  return <BrowserInstallPrompt variant={variant} audience={audience} autoOpen={autoOpen} />;
}

const noSubscription = () => () => undefined;

/** `card`: inline on Home, the queue and staff screens. `bar`: a sign-in screen's bottom bar. */
type BannerVariant = "card" | "bar";

/**
 * Who's installing. Parents install the app for queue alerts; each clinic
 * role installs its own app, which opens straight to its own screens.
 */
type Audience = "parent" | StaffAppId;

/** What every staff app shares; each role adds its own lines. */
const staffReasons = (first: string) => [
  { icon: ListOrdered, text: first },
  { icon: Smartphone, text: "Its own icon on your home screen, next to your other apps" },
  { icon: ShieldCheck, text: "Stays signed in on this device" },
];

const installCopy = {
  parent: {
    // Where the app opens: the link to copy into Safari or Chrome.
    path: "/",
    appName: brand.name,
    shortName: brand.shortName,
    barLine: "Get an alert when it's your turn",
    cardLine: "Install the app to get an alert when it's your turn.",
    intro:
      "Then we can send you a notification when you're 3rd in line and when it's your turn — no need to keep this page open.",
    reasons: [
      { icon: BellRing, text: "An alert when you're 3rd in line and when the doctor calls you" },
      { icon: Smartphone, text: "Opens straight from your home screen, full screen" },
      { icon: ShieldCheck, text: "No app store and no password — just your mobile number" },
    ],
  },
  doctor: {
    path: staffApps.doctor.base,
    appName: staffApps.doctor.name,
    shortName: staffApps.doctor.shortName,
    barLine: "Open the queue in one tap",
    cardLine: `Install ${staffApps.doctor.shortName} to open the queue in one tap from your home screen.`,
    intro:
      "Then the queue opens in one tap, full screen — no browser tab to find and no address to type.",
    reasons: staffReasons("Opens straight to the queue, full screen"),
  },
  pharmacist: {
    path: staffApps.pharmacist.base,
    appName: staffApps.pharmacist.name,
    shortName: staffApps.pharmacist.shortName,
    barLine: "Open prescriptions in one tap",
    cardLine: `Install ${staffApps.pharmacist.shortName} to open today's prescriptions in one tap.`,
    intro:
      "Then today's prescriptions open in one tap, full screen — no browser tab to find and no address to type.",
    reasons: staffReasons("Opens straight to today's prescriptions, full screen"),
  },
  receptionist: {
    path: staffApps.receptionist.base,
    appName: staffApps.receptionist.name,
    shortName: staffApps.receptionist.shortName,
    barLine: "Open the queue in one tap",
    cardLine: `Install ${staffApps.receptionist.shortName} to open the queue in one tap from your home screen.`,
    intro:
      "Then the queue opens in one tap, full screen — no browser tab to find and no address to type.",
    reasons: staffReasons("Opens straight to today's queue, full screen"),
  },
};

type InstallCopy = (typeof installCopy)[Audience];
const CopyContext = createContext<InstallCopy>(installCopy.parent);

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
      return `Open your iPhone's Settings → Notifications → ${brand.shortName}, and turn on Allow Notifications.`;
    case "android":
      return `Open your phone's Settings → Apps → ${brand.name} → Notifications, and turn them on.`;
    default:
      return "Allow notifications for this app in your browser or device settings, then reopen it.";
  }
}

// ---------------------------------------------------------------------------
// In a browser tab
// ---------------------------------------------------------------------------

/**
 * Shown on every visit in a browser tab, whoever is signed in. Whether to ask
 * depends only on how this page was opened: the home-screen app (standalone)
 * never gets here, a browser tab always does — even on a phone where the app
 * is already installed, since a tab can't tell.
 */
function BrowserInstallPrompt({
  variant = "card",
  audience = "parent",
  autoOpen = true,
}: {
  variant?: BannerVariant;
  audience?: Audience;
  autoOpen?: boolean;
}) {
  const copy = installCopy[audience];
  const [open, setOpen] = useState(() => {
    if (!autoOpen) return false;
    // Right after getting a token, show it again even if dismissed earlier:
    // they're waiting, and the alert is exactly what the app is for.
    if (sessionFlag.get(SHOW_INSTALL_AFTER_TOKEN)) {
      sessionFlag.set(SHOW_INSTALL_AFTER_TOKEN, false);
      return true;
    }
    // Parents meeting the app for the first time see the small card only —
    // a guide covering the screen before they've seen anything confused them.
    if (audience === "parent") return false;
    return !sessionFlag.get(INSTALL_DISMISSED_THIS_VISIT);
  });
  const toast = useToast();
  const deferredPrompt = useInstallPrompt();
  const [inAppBrowser] = useState(isInAppBrowser);
  const [platform] = useState<Platform>(detectPlatform);
  // Where the browser offers its own install dialog (Android Chrome), the
  // banner's button opens that directly; elsewhere it opens the how-to guide.
  // The label follows the phone: "Install" on Android, "Add" on iPhone.
  const canInstallDirectly = deferredPrompt !== null && !inAppBrowser;

  async function install() {
    if (await promptInstall()) {
      toast(`Installed — open ${copy.appName} from your home screen`, "success");
    }
  }

  const action = canInstallDirectly ? (
    <Button
      variant={variant === "bar" ? "primary" : "secondary"}
      className={cn(variant === "bar" && "rounded-full px-4")}
      onClick={() => void install()}
    >
      {/* On the narrowest phones the brand name needs the room more than the icon. */}
      {variant === "bar" && <Download aria-hidden className="hidden size-4 min-[360px]:block" />}
      Install
    </Button>
  ) : (
    <Button
      variant="secondary"
      className={cn(variant === "bar" && "rounded-full px-4")}
      onClick={() => setOpen(true)}
    >
      {platform === "ios" ? "Add" : "Install"}
    </Button>
  );

  return (
    <CopyContext.Provider value={copy}>
      {variant === "bar" ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 shadow-sm">
          {/* The icon they'll look for on their home screen afterwards. */}
          <BrandLogo className="size-10" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-bold text-foreground">
              Install {copy.shortName}
            </span>
            <span className="block text-xs text-foreground-muted">
              {copy.barLine}
            </span>
          </span>
          {action}
        </div>
      ) : (
        <Card className="flex items-center gap-3">
          <Smartphone className="size-5 shrink-0 text-primary-600" />
          <p className="flex-1 text-sm text-foreground">
            {copy.cardLine}
          </p>
          {action}
        </Card>
      )}

      <InstallSheet
        open={open}
        onClose={() => {
          sessionFlag.set(INSTALL_DISMISSED_THIS_VISIT, true);
          setOpen(false);
        }}
      />
    </CopyContext.Provider>
  );
}

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const copy = useContext(CopyContext);
  const toast = useToast();
  const deferredPrompt = useInstallPrompt();
  const [platform] = useState<Platform>(detectPlatform);
  const [inAppBrowser] = useState(isInAppBrowser);
  // iPhone: a small hint at the bottom first; the full step-by-step on request.
  const [showSteps, setShowSteps] = useState(false);
  const close = () => {
    setShowSteps(false);
    onClose();
  };

  if (open && platform === "ios" && !inAppBrowser && !showSteps) {
    return <IosQuickHint onClose={close} onShowSteps={() => setShowSteps(true)} />;
  }

  async function install() {
    const accepted = await promptInstall();
    if (accepted) {
      toast(`Installed — open ${copy.appName} from your home screen`, "success");
      onClose();
    }
  }

  async function copyLink() {
    try {
      // Each app's own start page: staff their area, parents the app itself.
      await navigator.clipboard.writeText(`${window.location.origin}${copy.path === "/" ? "" : copy.path}`);
      toast("Link copied — paste it into Safari or Chrome", "success");
    } catch {
      toast(`Open ${window.location.host} in Safari or Chrome`, "info");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={`Install ${copy.appName}`}
      footer={
        <div className="flex flex-col gap-2">
          {!inAppBrowser && platform !== "ios" && deferredPrompt && (
            <Button
              fullWidth
              variant="accent"
              className="rounded-full font-display font-bold"
              onClick={() => void install()}
            >
              <Download className="size-5" />
              Install app
            </Button>
          )}
          {platform === "ios" && !inAppBrowser ? (
            <Button
              fullWidth
              variant="accent"
              className="rounded-full font-display font-bold"
              onClick={onClose}
            >
              <CircleCheck className="size-5" />
              Got it
            </Button>
          ) : (
            <Button fullWidth variant="ghost" onClick={onClose}>
              Not now
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-wider text-accent-600">
            Takes a few seconds
          </p>
          <p className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
            {platform === "ios" ? "Add to your home screen" : "Install the app"}
          </p>
          <p className="mt-1 text-sm text-foreground-muted">
            {copy.intro}
          </p>
        </div>

        {inAppBrowser ? (
          <div className="flex flex-col gap-3 rounded-xl border border-accent-200 bg-accent-50 p-4 dark:border-accent-900 dark:bg-accent-900/20">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-foreground-on-accent">
                <ExternalLink aria-hidden className="size-4" />
              </span>
              <div>
                <p className="font-display font-bold text-foreground">
                  Open this in your browser first
                </p>
                <p className="mt-1 text-sm text-foreground-muted">
                  This page is open inside another app (like WhatsApp or Instagram),
                  which can&apos;t install {copy.appName}. Tap the menu (⋯) and choose{" "}
                  <strong>Open in {platform === "ios" ? "Safari" : "Chrome"}</strong>, or
                  copy the link and paste it there.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="self-end rounded-full"
              onClick={() => void copyLink()}
            >
              <Copy aria-hidden className="size-4" />
              Copy link
            </Button>
          </div>
        ) : platform === "ios" ? (
          <IosInstallSteps />
        ) : deferredPrompt ? (
          <p className="text-sm text-foreground-muted">
            Tap <strong>Install app</strong> below. It takes a second and uses
            almost no space.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            <GuideStep number={1} of={3} title="Open the browser menu">
              Tap <strong>⋮</strong> in the top corner of Chrome.
            </GuideStep>
            {/* Android says "Install"; "Add to Home Screen" is iPhone wording. */}
            <GuideStep number={2} of={3} title="Choose Install app">
              Tap <strong>Install app</strong>.
            </GuideStep>
            <GuideStep number={3} of={3} title="Open it from your home screen">
              Look for the {copy.appName} icon.
            </GuideStep>
          </ol>
        )}

        <WhyInstall />
      </div>
    </Sheet>
  );
}

/**
 * The first thing an iPhone shows: a card at the bottom of the screen, above
 * Safari's toolbar where Share lives, with the two taps in one line each. The
 * page stays visible and usable behind it; "Show me how" opens the full
 * picture-by-picture guide.
 */
function IosQuickHint({ onClose, onShowSteps }: { onClose: () => void; onShowSteps: () => void }) {
  const copy = useContext(CopyContext);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div
        role="dialog"
        aria-labelledby="ios-hint-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-4 shadow-2xl motion-safe:animate-[sheet-in_180ms_ease-out]"
      >
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/192" alt="" className="size-11 shrink-0 rounded-[11px] shadow-sm" />
          <div className="min-w-0 flex-1">
            <p id="ios-hint-title" className="font-display font-bold text-foreground">
              Add {copy.shortName} to your home screen
            </p>
            <p className="text-sm text-foreground-muted">{copy.barLine}.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
          >
            <X className="size-5" />
          </button>
        </div>
        <ol className="mt-3 flex flex-col gap-2 text-sm text-foreground">
          <li className="flex items-center gap-2">
            <StepDot>1</StepDot>
            <span>
              Tap <Share aria-hidden className="mx-0.5 inline size-4 align-[-2px] text-[#007aff]" />{" "}
              <strong>Share</strong> in Safari
            </span>
          </li>
          <li className="flex items-center gap-2">
            <StepDot>2</StepDot>
            <span>
              Choose <SquarePlus aria-hidden className="mx-0.5 inline size-4 align-[-2px]" />{" "}
              <strong>Add to Home Screen</strong>, then <strong>Add</strong>
            </span>
          </li>
        </ol>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1 px-3" onClick={onShowSteps}>
            Show me how
          </Button>
          <Button className="flex-1 px-3" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-700 font-display text-xs font-bold text-neutral-0">
      {children}
    </span>
  );
}

/**
 * iPhones have no install dialog a page can open, so the parent does it by
 * hand. Each step shows a small picture of the thing to tap, drawn to look
 * like Safari's own buttons, so it's recognisable at a glance. No arrow at the
 * screen edge: where Share sits depends on the iOS version and Safari layout.
 */
function IosInstallSteps() {
  const copy = useContext(CopyContext);
  return (
    <>
      <ol className="flex flex-col gap-3">
        <GuideStep number={1} of={3} title="Tap Safari's Share button">
          <span className="block">
            It looks like this. Don&apos;t see it? Tap <strong>•••</strong> first, then{" "}
            <strong>Share</strong>.
          </span>
          <IosMock>
            <span className="flex size-10 items-center justify-center rounded-md bg-surface-raised shadow-sm">
              <Share aria-hidden className="size-5 text-[#007aff]" />
            </span>
            <span className="font-semibold text-foreground">Share</span>
          </IosMock>
        </GuideStep>
        <GuideStep number={2} of={3} title="Choose Add to Home Screen">
          <span className="block">Scroll down the list until you find it.</span>
          <IosMock>
            <span className="flex w-full flex-col gap-1.5">
              <span className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-foreground-muted">
                <Bookmark aria-hidden className="size-4" />
                Add Bookmark
              </span>
              <span className="flex min-h-11 items-center gap-3 rounded-lg bg-primary-50 px-3 font-semibold text-primary-800 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-200 dark:ring-primary-800">
                <SquarePlus aria-hidden className="size-5" />
                Add to Home Screen
              </span>
            </span>
          </IosMock>
        </GuideStep>
        <GuideStep number={3} of={3} title="Tap Add">
          <span className="block">It&apos;s in the top-right corner.</span>
          <IosMock>
            <span className="flex w-full items-center justify-between text-sm">
              <span className="text-[#007aff]">Cancel</span>
              <span className="font-semibold text-foreground">Add to Home Screen</span>
              <span className="rounded-md bg-[#007aff]/10 px-2 py-0.5 font-semibold text-[#007aff]">
                Add
              </span>
            </span>
          </IosMock>
        </GuideStep>
      </ol>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-raised p-4">
        {/* The app's real home-screen icon. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/192" alt="" className="size-14 shrink-0 rounded-[14px] shadow-md" />
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-wider text-primary-700 dark:text-primary-300">
            Then look for this icon
          </p>
          <p className="mt-0.5 text-sm text-foreground-muted">
            Open {copy.appName} from your home screen — it opens full screen, without
            the browser bars.
          </p>
        </div>
      </div>
    </>
  );
}

/** A small, Safari-like picture of what to tap. */
function IosMock({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="mt-3 flex min-h-12 items-center gap-3 rounded-lg bg-surface-sunken p-2"
    >
      {children}
    </span>
  );
}

/** One install step as its own card: number, title, "Step 1 of 3", details. */
function GuideStep({
  number,
  of,
  title,
  children,
}: {
  number: number;
  of: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-700 font-display text-sm font-bold text-neutral-0">
          {number}
        </span>
        <p className="flex-1 font-display font-bold text-foreground">{title}</p>
        <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-foreground-muted">
          Step {number} of {of}
        </span>
      </div>
      <div className="mt-2 text-sm text-foreground-muted">{children}</div>
    </li>
  );
}

/** Why bother — only things the app really does. */
function WhyInstall() {
  const { reasons } = useContext(CopyContext);
  return (
    <div className="rounded-xl bg-surface-sunken p-4">
      <p className="font-display text-xs font-bold uppercase tracking-wider text-foreground-muted">
        Why install?
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {reasons.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 rounded-md bg-surface-raised px-3 py-2.5 text-sm text-foreground"
          >
            <Icon aria-hidden className="size-4 shrink-0 text-success" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
