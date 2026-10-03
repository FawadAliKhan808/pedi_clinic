import { ImageResponse } from "next/og";
import { brand, brandPrimary, staffApps } from "@/brand";
import { brandGlyph } from "@/app/icons/mark";
import { SPLASH_APPS, SPLASH_SCREENS, splashPixelSize, type SplashApp } from "@/lib/pwa/splash";

// Every app × screen size is drawn once, at build time.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SPLASH_APPS.flatMap((app) =>
    SPLASH_SCREENS.map((screen) => ({ app, size: splashPixelSize(screen) }))
  );
}

const names: Record<SplashApp, { name: string; line: string }> = {
  parent: { name: brand.name, line: "Your child's visits, queue and care" },
  doctor: { name: staffApps.doctor.name, line: "Your clinic day, in one place" },
  pharmacist: { name: staffApps.pharmacist.name, line: "Today's prescriptions and stock" },
  receptionist: { name: staffApps.receptionist.name, line: "Today's queue and walk-ins" },
};

/**
 * The iOS launch screen: the brand colour edge to edge, the glyph in the
 * middle and the app's name below — the same look Android builds from the
 * manifest, so both phones open the same way.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ app: string; size: string }> }) {
  const { app, size } = await params;
  const [width, height] = size.split("x").map(Number);
  const short = Math.min(width, height);
  const text = names[app as SplashApp] ?? names.parent;

  return new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: brandPrimary,
          color: "#ffffff",
        }}
      >
        {brandGlyph(Math.round(short * 0.26))}
        <div
          style={{
            display: "flex",
            marginTop: Math.round(short * 0.09),
            fontSize: Math.round(short * 0.075),
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          {text.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: Math.round(short * 0.025),
            fontSize: Math.round(short * 0.04),
            opacity: 0.8,
          }}
        >
          {text.line}
        </div>
      </div>
    ),
    { width, height }
  );
}
