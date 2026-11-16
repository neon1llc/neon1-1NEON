// apps/web/src/lib/preview.ts - A profile choice shown before it is saved. The theme is applied straight to the page; the
// menu style has to reach the frame, so the profile puts its pick here and the frame reads it (Shell.tsx) until the
// profile is saved or left, when it is cleared and the saved choice shows again.


import { useSyncExternalStore } from "react";


let menu: string | undefined;
const listeners = new Set<() => void>();

/** Show this menu style ("default" or "mini") instead of the saved one; undefined goes back to the saved one */
export function previewMenu(m: string | undefined) {
  if (m === menu) return;
  menu = m;
  listeners.forEach((l) => l());
}

/** The menu style being previewed, if any */
export function usePreviewedMenu() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => menu);
}
