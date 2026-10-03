import { staffManifestResponse } from "@/lib/pwa/staff-manifest";

// Built once per deployment, like the parent manifest.
export const dynamic = "force-static";

/** "<Clinic> Pharmacy": installed from /pharmacy, opens straight to it. */
export function GET() {
  return staffManifestResponse("pharmacist");
}
