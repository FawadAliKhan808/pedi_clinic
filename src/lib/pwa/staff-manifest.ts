import type { MetadataRoute } from "next";
import { brand, brandPrimary, staffApps, type StaffAppId } from "@/brand";

const descriptions: Record<StaffAppId, string> = {
  doctor: "the live queue, visits, appointments and the day's numbers.",
  pharmacist: "today's prescriptions to dispense, and the medicine stock.",
  receptionist: "today's queue, and adding walk-ins.",
};

/**
 * One staff app's manifest. Each has its own `id` and scope, so the parents'
 * app and all three staff apps can sit on one phone as separate icons, and
 * each opens straight to its own screens.
 */
export function staffManifestResponse(id: StaffAppId): Response {
  const app = staffApps[id];
  const manifest: MetadataRoute.Manifest = {
    id: `${app.base}?brand=${brand.id}`,
    name: app.name,
    short_name: app.shortName,
    description: `${brand.name} for the ${id === "receptionist" ? "front desk" : id === "pharmacist" ? "pharmacy" : "doctor"}: ${descriptions[id]}`,
    start_url: app.base,
    scope: app.base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: brandPrimary,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
