// apps/web/src/lib/style.ts - The style neon1.tech's landing screen chooses for the whole of neon1: stylized (the rain, the neon, the
// glows) or business (plain, with no effects). It is kept in the same localStorage key the site uses ("neon1.style", same origin), so the
// landing's switch wins here too (Pradeep, 2026-11-17). Each style has a light and a dark theme: awake and matrix when stylized, alert
// and lamp when business. 1NEON reads them as html[data-theme] "awake" or "matrix" (so every light and dark rule written for those still
// applies) with html[data-style="business"] over them (styles/business.css), exactly as neon1.tech does.


export type Look = "awake" | "matrix" | "alert" | "lamp";
export type Style = "stylized" | "business";

const KEY_STYLE = "neon1.style";
const KEY = "neon1.theme";               // stylized: awake or matrix
const KEY_BIZ = "neon1.theme.business";  // business: alert or lamp

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* not kept: this page still switches */ } };

export const isBusiness = (t: string): boolean => t === "alert" || t === "lamp";
export const isDarkLook = (t: string): boolean => t === "matrix" || t === "lamp";
const darkDevice = () => matchMedia("(prefers-color-scheme: dark)").matches;

/** The landing's choice, or null when this browser never made one (an account's own theme then stands as it is) */
export function styleChoice(): Style | null {
  const v = read(KEY_STYLE);
  return v === "business" || v === "stylized" ? v : null;
}
export function setStyleChoice(s: Style) { write(KEY_STYLE, s); }

/** The public screens' look: the style, then that style's saved theme. Stylized is awake until a pick; business follows the
 * device's light or dark setting on its first visit only, as on the site */
export function readLook(): Look {
  if (styleChoice() === "business") {
    const v = read(KEY_BIZ);
    return v === "lamp" || v === "alert" ? v : darkDevice() ? "lamp" : "alert";
  }
  return read(KEY) === "matrix" ? "matrix" : "awake";
}
/** Keep a pick made on a public screen, in the style's own key (a business pick also makes business the style) */
export function saveLook(look: Look) {
  if (isBusiness(look)) { setStyleChoice("business"); write(KEY_BIZ, look); }
  else { setStyleChoice("stylized"); write(KEY, look); }
}

/** An account's saved theme as it shows on this browser: the landing's style wins. Stylized themes read as their business twin when
 * the landing chose business, and the other way round; "device" follows the device's light or dark setting inside the chosen style */
export function resolveTheme(theme: string): string {
  const s = styleChoice();
  if (!s) return theme;
  const biz = s === "business";
  const t = theme === "device" ? (biz ? (darkDevice() ? "matrix" : "awake") : "device") : theme;
  if (t === "device") return t;
  const dark = isDarkLook(t);
  return biz ? (dark ? "lamp" : "alert") : dark ? "matrix" : "awake";
}
