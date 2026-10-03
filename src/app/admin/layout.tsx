import type { Metadata } from "next";
import type { ReactNode } from "react";
import { staffApps } from "@/brand";
import { appleStartupImages } from "@/lib/pwa/splash";

/**
 * Everything under /admin installs as the doctor's app ("<Clinic> Doctor"):
 * its own manifest (opens at /admin) and its own home-screen label on iPhone.
 */
export const metadata: Metadata = {
  manifest: "/admin/staff.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: staffApps.doctor.shortName,
    startupImage: appleStartupImages("doctor"),
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
