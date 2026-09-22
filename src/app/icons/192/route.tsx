import { ImageResponse } from "next/og";
import { iconMark } from "../mark";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(iconMark(192), { width: 192, height: 192 });
}
