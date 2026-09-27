import { Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";

export const nunito = localFont({
  src: "./nunito-variable.woff2",
  variable: "--font-nunito",
  weight: "200 1000",
  display: "swap",
});

/**
 * Headings and big numbers. next/font downloads it at build time and serves
 * it from this app, so the browser never calls Google Fonts.
 */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
