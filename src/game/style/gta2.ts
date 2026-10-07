// GTA 2-flavoured look for Level 2: Downtown greys, sodium-lamp warmth and
// gold-on-black messages. Everything is original; no GTA art is used.
export const GTA2 = {
  width: 640,
  height: 480,
  /** Backing-store multiplier: 640×480 logical, drawn into 1280×960 so text and vectors stay crisp when the page scales it. */
  render: 2,
  palette: {
    backdrop: "#202020", paper: "#f8f8f8", gold: "#e8c068",
    hudGold: "#f5c518", hudRed: "#e8262b", pager: "#9fd36b", pagerInk: "#14260f",
  },
  fonts: { fallback: "Impact, 'Arial Narrow Bold', 'Arial Black', sans-serif" },
} as const;

/** The condensed display font loaded by next/font (see app/layout.tsx). */
export function gtaFontFamily() {
  if (typeof document === "undefined") return GTA2.fonts.fallback;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-gta").trim();
  return family ? `${family}, ${GTA2.fonts.fallback}` : GTA2.fonts.fallback;
}

/** Resolves once the GTA font can be drawn into canvases (never rejects). */
export async function loadGtaFont() {
  if (typeof document === "undefined" || !document.fonts) return;
  const pixel = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  const loads = [document.fonts.load(`40px ${gtaFontFamily()}`), ...(pixel ? [document.fonts.load(`10px ${pixel}`)] : [])];
  try { await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fallback font */ }
}
