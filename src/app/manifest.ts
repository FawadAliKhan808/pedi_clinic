import type { MetadataRoute } from "next";
import { brand, brandPrimary } from "@/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id per brand, so two demos installed on one phone stay two apps.
    id: `/?brand=${brand.id}`,
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: brandPrimary,
    icons: [
      {
        src: "/icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
