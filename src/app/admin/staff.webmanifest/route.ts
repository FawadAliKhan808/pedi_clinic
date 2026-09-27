import type { MetadataRoute } from "next";
import { brand, brandPrimary, staffApp } from "@/brand";

// Built once per deployment, like the parent manifest.
export const dynamic = "force-static";

/**
 * The staff app's manifest. Doctor and pharmacist install from /admin and
 * the icon opens straight to their terminal, not the parent sign-in. A
 * different `id` from the parent app, so both can sit on one phone.
 */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: `/admin?brand=${brand.id}`,
    name: staffApp.name,
    short_name: staffApp.shortName,
    description: `${brand.name} for the doctor and pharmacy: the live queue, visits and stock.`,
    start_url: "/admin",
    scope: "/admin",
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
