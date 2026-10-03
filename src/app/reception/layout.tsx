import type { Metadata } from "next";
import type { ReactNode } from "react";
import { staffApps } from "@/brand";
import { appleStartupImages } from "@/lib/pwa/splash";

/** Everything under /reception installs as "<Clinic> Desk", opening at /reception. */
export const metadata: Metadata = {
  manifest: "/reception/app.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: staffApps.receptionist.shortName,
    startupImage: appleStartupImages("receptionist"),
  },
};

export default function ReceptionLayout({ children }: { children: ReactNode }) {
  return children;
}
