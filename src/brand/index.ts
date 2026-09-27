import type { CSSProperties } from "react";
import { crescent } from "./brands/crescent";
import { pediclinic } from "./brands/pediclinic";
import type { Brand, Palette } from "./types";

export type { Brand, Palette } from "./types";

/**
 * The platform's name. White-label demos show their clinic's brand to
 * parents and staff; screens for our own team (the owner dashboard) say this.
 */
export const PLATFORM_NAME = "PediClinic";

/** Every white-label demo. Adding one: a file in ./brands, then a line here. */
const brands: Record<string, Brand> = { pediclinic, crescent };

function selectBrand(): Brand {
  // Read literally so Next.js inlines it into the browser bundle at build time.
  const id = process.env.NEXT_PUBLIC_BRAND || pediclinic.id;
  const selected = brands[id];
  if (!selected) {
    // Fail the build loudly rather than ship a demo with the wrong name on it.
    throw new Error(
      `Unknown NEXT_PUBLIC_BRAND "${id}". Known brands: ${Object.keys(brands).join(", ")}.`
    );
  }
  return selected;
}

/** This deployment's brand, fixed when the app is built. */
export const brand: Brand = selectBrand();

/** The staff app (doctor, pharmacist): installed from /admin, opens straight to it. */
export const staffApp = {
  name: `${brand.name} Staff`,
  shortName: brand.staffShortName ?? `${brand.shortName} Staff`,
};

/** The base primary, for places that need a literal colour (manifest, icons). */
const BASE_PRIMARY_600 = "#23716d";

/** The brand's main colour as a literal, e.g. for the browser toolbar. */
export const brandPrimary: string = brand.colors?.primary?.[600] ?? BASE_PRIMARY_600;

/**
 * The brand's colour overrides as CSS variables, set on <html> so they win
 * over the defaults in globals.css. Empty for a brand that keeps the base.
 */
export function brandColorVariables(): CSSProperties {
  const variables: Record<string, string> = {};
  const add = (name: "primary" | "accent", palette: Palette | undefined) => {
    for (const [shade, value] of Object.entries(palette ?? {})) {
      if (value) variables[`--color-${name}-${shade}`] = value;
    }
  };
  add("primary", brand.colors?.primary);
  add("accent", brand.colors?.accent);
  return variables as CSSProperties;
}
