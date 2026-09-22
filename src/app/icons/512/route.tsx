import { ImageResponse } from "next/og";
import { iconMark } from "../mark";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(iconMark(512), { width: 512, height: 512 });
}
