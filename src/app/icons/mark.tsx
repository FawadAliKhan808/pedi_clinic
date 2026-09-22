import type { ReactElement } from "react";

const PRIMARY = "#23716d";
const ON_PRIMARY = "#ffffff";

/**
 * Shared glyph for all generated app icons/favicons (rendered via next/og
 * ImageResponse — Satori requires explicit flex + inline styles).
 * `markScale` controls how large the cross sits relative to the canvas,
 * so maskable variants can stay inside the OS safe zone.
 */
export function iconMark(size: number, markScale = 0.62): ReactElement {
  const barLength = size * markScale;
  const barThickness = size * markScale * 0.34;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PRIMARY,
      }}
    >
      <div
        style={{
          position: "relative",
          width: barLength,
          height: barLength,
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: (barLength - barThickness) / 2,
            left: 0,
            width: barLength,
            height: barThickness,
            borderRadius: barThickness / 2,
            background: ON_PRIMARY,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: (barLength - barThickness) / 2,
            top: 0,
            width: barThickness,
            height: barLength,
            borderRadius: barThickness / 2,
            background: ON_PRIMARY,
            display: "flex",
          }}
        />
      </div>
    </div>
  );
}
