import type { Metadata } from "next";
import type { ReactNode } from "react";
import { staffApp } from "@/brand";

/**
 * Everything under /admin installs as the staff app: its own manifest
 * (opens at /admin) and its own home-screen label on iPhone.
 */
export const metadata: Metadata = {
  manifest: "/admin/staff.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: staffApp.shortName,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
