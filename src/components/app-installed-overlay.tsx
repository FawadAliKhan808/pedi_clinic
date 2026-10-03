"use client";

import { CheckCircle2, Smartphone } from "lucide-react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { brand, staffAppForPath, staffApps } from "@/brand";
import { getBrowserApi } from "@/lib/api/browser";
import { useJustInstalled } from "@/lib/pwa/install-prompt";

/**
 * Mobile browsers can't launch a PWA they've just installed, so once the
 * native `appinstalled` event fires this covers the browser tab and tells the
 * parent to continue from the home-screen icon — where notifications work.
 * Deliberately has no close button: carrying on in the tab is the thing to avoid.
 */
export function AppInstalledOverlay() {
  const installed = useJustInstalled();
  // Installed from a staff page: that's a staff app, and not a parent install.
  const staffAppId = staffAppForPath(usePathname());
  const staff = staffAppId !== null;
  const appName = staffAppId ? staffApps[staffAppId].name : brand.name;

  useEffect(() => {
    if (!installed || staff) return;
    // Count the install now, so the owner dashboard updates straight away.
    // (The installed app records it again on first open; repeats are ignored.)
    void getBrowserApi().notifications.recordInstall().catch(() => undefined);
  }, [installed, staff]);

  if (!installed) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-installed-title"
      aria-describedby="app-installed-body"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/80 p-6 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-surface-raised p-6 text-center shadow-2xl">
        <span className="flex size-16 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 aria-hidden className="size-9 text-success" />
        </span>
        <h2 id="app-installed-title" className="text-xl font-bold text-foreground">
          App installed successfully!
        </h2>
        <p id="app-installed-body" className="text-foreground">
          Please close this browser tab and open <strong>{appName}</strong> directly from
          your phone&apos;s home screen to continue.
        </p>
        <p className="flex items-center gap-2 rounded-xl bg-surface-sunken px-4 py-3 text-sm text-foreground-muted">
          <Smartphone aria-hidden className="size-5 shrink-0 text-primary-600" />
          Look for the {appName} icon on your home screen or in your app list.
        </p>
      </div>
    </div>
  );
}
