import type { Metadata } from "next";
import type { ReactNode } from "react";
import { staffApps } from "@/brand";

/** Everything under /pharmacy installs as "<Clinic> Pharmacy", opening at /pharmacy. */
export const metadata: Metadata = {
  manifest: "/pharmacy/app.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: staffApps.pharmacist.shortName,
  },
};

export default function PharmacyLayout({ children }: { children: ReactNode }) {
  return children;
}
