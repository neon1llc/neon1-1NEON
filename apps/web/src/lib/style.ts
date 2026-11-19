// apps/web/src/lib/style.ts - Matrix/sentinel preferences shared with neon1.tech, with an independent mode.


export type Look = "awake" | "plugged" | "providence" | "desert-of-the-real";
export type Style = "matrix" | "sentinel";
const KEY_STYLE = "neon1.style";
const KEY_MODE = "neon1.mode";
const KEY_SHARED = "neon1.theme.shared";
const memory = new Map<string, string>();

// Storage may be blocked; a choice still applies for this page's lifetime
const read = (key: string): string | null => { if (memory.has(key)) return memory.get(key)!; try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); memory.delete(key); } catch { memory.set(key, value); } };

/** Old names remain readable while saved profiles and browser preferences migrate */
export function normalizeLook(theme: string): Look {
  if (theme === "matrix" || theme === "plugged") return "plugged";
  if (theme === "alert" || theme === "providence") return "providence";
  if (theme === "lamp" || theme === "desert-of-the-real") return "desert-of-the-real";
  return "awake";
}
export const isSentinel = (theme: string): boolean => ["providence", "desert-of-the-real"].includes(normalizeLook(theme));
export const isDarkLook = (theme: string): boolean => ["plugged", "desert-of-the-real"].includes(normalizeLook(theme));
const darkDevice = () => matchMedia("(prefers-color-scheme: dark)").matches;
export const lookFor = (style: Style, dark: boolean): Look => style === "sentinel" ? (dark ? "desert-of-the-real" : "providence") : dark ? "plugged" : "awake";

/** Null means this browser has no family override for an account's saved preference */
export function styleChoice(): Style | null {
  const value = read(KEY_STYLE);
  if (value === "sentinel" || value === "business") return "sentinel";
  if (value === "matrix" || value === "stylized") return "matrix";
  return null;
}
export function setStyleChoice(style: Style) { write(KEY_STYLE, style); }
// Whether the person has chosen a browser-wide theme that takes priority over the saved profile
export const sharedThemeChoice = () => read(KEY_SHARED) === "1";
// The browser's mode, with older saved looks used until a shared choice exists
export const modeChoice = (): "light" | "dark" => {
  const value = read(KEY_MODE);
  if (value === "light" || value === "dark") return value;
  const old = read((styleChoice() ?? "sentinel") === "sentinel" ? "neon1.theme.business" : "neon1.theme");
  return old && isDarkLook(old) ? "dark" : "light";
};

/** Prefer the common mode; migrate the active family's old saved choice once */
export function readLook(): Look {
  const style = styleChoice() ?? "sentinel";
  let mode = read(KEY_MODE);
  if (mode !== "light" && mode !== "dark") {
    mode = modeChoice();
    write(KEY_MODE, mode);
  }
  return lookFor(style, mode === "dark");
}

/** A named selection explicitly sets both axes, including when saved from the profile */
export function saveLook(look: Look) {
  write(KEY_MODE, isDarkLook(look) ? "dark" : "light");
  setStyleChoice(isSentinel(look) ? "sentinel" : "matrix");
  write(KEY_SHARED, "1");
}

/** The landing's family overrides the account's family, preserving the account's light/dark mode */
export function resolveTheme(theme: string): string {
  if (sharedThemeChoice()) return readLook();
  const style = styleChoice();
  if (theme === "device") return style === "sentinel" ? lookFor(style, darkDevice()) : "device";
  const look = normalizeLook(theme);
  return style ? lookFor(style, isDarkLook(look)) : look;
}
