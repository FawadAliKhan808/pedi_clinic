/** Shades of one colour, as in globals.css (--color-primary-50 … -900). */
export type Palette = Partial<
  Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>
>;

/**
 * Everything that makes a white-label demo look like its clinic's own app.
 * Clinic *content* (the doctor's profile, session times, medicines…) is not
 * here: it lives in that demo's database, like any other clinic data.
 */
export interface Brand {
  /** What NEXT_PUBLIC_BRAND is set to for this demo, e.g. "crescent". */
  id: string;
  /** Full name: page titles, headers, install prompts. */
  name: string;
  /** Label under the home-screen icon. Keep it ≤ 12 characters or phones cut it off. */
  shortName: string;
  /** Store-style one-liner: the manifest and search results. */
  description: string;
  /** The glyph drawn on the app icon and logo (see src/brand/mark.tsx). */
  mark: "cross" | "crescent";
  /**
   * Colour overrides. Anything left out keeps the base palette in
   * globals.css, so a brand can change just its primary, or nothing.
   */
  colors?: { primary?: Palette; accent?: Palette };
}
