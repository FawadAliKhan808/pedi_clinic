import type { Metadata } from "next";

/** The four home-screen apps, each with its own splash. */
export type SplashApp = "parent" | "doctor" | "pharmacist" | "receptionist";
export const SPLASH_APPS: SplashApp[] = ["parent", "doctor", "pharmacist", "receptionist"];

/**
 * Portrait screens of current iPhones and iPads: CSS size and pixel ratio.
 * iOS shows a startup image only when one matches the device exactly.
 */
export const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // iPhone 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // iPhone 16 Pro
  { width: 430, height: 932, ratio: 3 }, // iPhone 14/15 Pro Max, 15/16 Plus
  { width: 393, height: 852, ratio: 3 }, // iPhone 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // iPhone 12/13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // iPhone 12, 13, 14, 12/13 Pro
  { width: 375, height: 812, ratio: 3 }, // iPhone X, XS, 11 Pro, 12/13 mini
  { width: 414, height: 896, ratio: 3 }, // iPhone XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // iPhone XR, 11
  { width: 414, height: 736, ratio: 3 }, // iPhone 8 Plus
  { width: 375, height: 667, ratio: 2 }, // iPhone 8, SE (2nd/3rd gen)
  { width: 320, height: 568, ratio: 2 }, // iPhone SE (1st gen)
  { width: 1024, height: 1366, ratio: 2 }, // iPad Pro 12.9"
  { width: 834, height: 1194, ratio: 2 }, // iPad Pro 11"
  { width: 820, height: 1180, ratio: 2 }, // iPad Air, iPad 10th gen
  { width: 768, height: 1024, ratio: 2 }, // iPad, iPad mini (older)
  { width: 744, height: 1133, ratio: 2 }, // iPad mini 6th gen
];

export const splashPixelSize = (screen: (typeof SPLASH_SCREENS)[number]) =>
  `${screen.width * screen.ratio}x${screen.height * screen.ratio}`;

/** The `appleWebApp.startupImage` list for one app: one image per screen size. */
export function appleStartupImages(app: SplashApp): NonNullable<Exclude<Metadata["appleWebApp"], boolean | null | undefined>["startupImage"]> {
  return SPLASH_SCREENS.map((screen) => ({
    url: `/splash/${app}/${splashPixelSize(screen)}`,
    media: `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`,
  }));
}
