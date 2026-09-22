"use client";

export type Platform = "ios" | "android" | "other";

/** Running as the installed home-screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's pre-standard flag.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/.test(ua)) return "android";
  return "other";
}

/**
 * Links opened from WhatsApp, Instagram, Facebook and similar land in an
 * embedded browser that can't install web apps at all, so the parent has to
 * be sent to Safari or Chrome first.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Snapchat|MicroMessenger|; wv\)/i.test(
    navigator.userAgent
  );
}

/**
 * sessionStorage can throw (private mode, blocked storage), and everything
 * here is a convenience, so failures just mean "not remembered".
 */
export const sessionFlag = {
  get(key: string): boolean {
    try {
      return window.sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  },
  set(key: string, value: boolean): void {
    try {
      if (value) window.sessionStorage.setItem(key, "1");
      else window.sessionStorage.removeItem(key);
    } catch {
      // Not remembered for this visit; harmless.
    }
  },
};

/** Set by check-in so the install popup reappears right after getting a token. */
export const SHOW_INSTALL_AFTER_TOKEN = "pedi.showInstallAfterToken";
/** "Not now" — hides the popup for the rest of this visit only. */
export const INSTALL_DISMISSED_THIS_VISIT = "pedi.installDismissed";
