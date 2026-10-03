import { staffManifestResponse } from "@/lib/pwa/staff-manifest";

// Built once per deployment, like the parent manifest.
export const dynamic = "force-static";

/** "<Clinic> Desk": installed from /reception, opens straight to it. */
export function GET() {
  return staffManifestResponse("receptionist");
}
