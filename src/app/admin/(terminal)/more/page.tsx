import type { Metadata } from "next";
import { MoreScreen } from "@/components/admin/more-screen";

export const metadata: Metadata = { title: "More" };

/** The doctor's last tab: less-used screens and the account. The layout checks the role. */
export default function DoctorMorePage() {
  return <MoreScreen role="doctor" />;
}
