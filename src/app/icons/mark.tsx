import type { ReactElement } from "react";
import { brand, brandPrimary } from "@/brand";

const ON_PRIMARY = "#ffffff";
const ACCENT = brand.colors?.accent?.[500] ?? "#f2703a";

/**
 * Shared glyph for all generated app icons/favicons (rendered via next/og
 * ImageResponse — Satori requires explicit flex + inline styles). The glyph
 * comes from this deployment's brand.
 * `markScale` controls how large the glyph sits relative to the canvas,
 * so maskable variants can stay inside the OS safe zone.
 */
export function iconMark(size: number, markScale = 0.62): ReactElement {
  const glyphSize = size * markScale;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brandPrimary,
      }}
    >
      {brand.mark === "crescent" ? crescentGlyph(glyphSize) : crossGlyph(glyphSize)}
    </div>
  );
}

/** The brand's glyph alone (white on the primary colour), for splash screens. */
export function brandGlyph(size: number): ReactElement {
  return brand.mark === "crescent" ? crescentGlyph(size) : crossGlyph(size);
}

function crossGlyph(barLength: number): ReactElement {
  const barThickness = barLength * 0.34;
  return (
    <div style={{ position: "relative", width: barLength, height: barLength, display: "flex" }}>
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
  );
}

/**
 * A crescent: a white disc with a primary-coloured disc laid over its upper
 * right, plus a small accent dot in the hollow.
 */
function crescentGlyph(diameter: number): ReactElement {
  const cut = diameter * 0.8;
  const dot = diameter * 0.2;
  return (
    <div style={{ position: "relative", width: diameter, height: diameter, display: "flex" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          background: ON_PRIMARY,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: diameter * 0.32,
          top: -diameter * 0.1,
          width: cut,
          height: cut,
          borderRadius: cut / 2,
          background: brandPrimary,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: diameter * 0.62,
          top: diameter * 0.52,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          background: ACCENT,
          display: "flex",
        }}
      />
    </div>
  );
}
