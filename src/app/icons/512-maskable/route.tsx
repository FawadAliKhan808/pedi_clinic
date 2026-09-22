import { ImageResponse } from "next/og";
import { iconMark } from "../mark";

export const dynamic = "force-static";

export function GET() {
  // Smaller mark scale keeps the glyph inside the OS maskable safe zone.
  return new ImageResponse(iconMark(512, 0.4), { width: 512, height: 512 });
}
