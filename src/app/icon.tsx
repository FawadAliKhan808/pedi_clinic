import { ImageResponse } from "next/og";
import { iconMark } from "./icons/mark";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(iconMark(48), size);
}
