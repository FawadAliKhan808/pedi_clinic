import type { Metadata } from "next";
import { MoreScreen } from "@/components/admin/more-screen";

export const metadata: Metadata = { title: "More" };

/** The pharmacist's last tab: the check-in QR and the account. */
export default function PharmacyMorePage() {
  return <MoreScreen role="pharmacist" />;
}
