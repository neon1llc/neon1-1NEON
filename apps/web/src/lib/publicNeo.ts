// apps/web/src/lib/publicNeo.ts - A hand to the public Neo window (neon1.tech's /shared/chat.js), which main.tsx mounts outside React.
// Wherever the signed-in Neo isn't shown, the public window is the Neo people see, and components/PublicTalk.tsx
// adds the chat with Pradeep to it as a second tab through this hand.


import { useSyncExternalStore } from "react";


/** What a tab added to the window gives back */
export interface PublicTab {
  // Where the tab's content goes
  el: HTMLElement;
  // How many are new in it: shown on the tab and on the launcher
  badge: (n: number) => void;
  // Open the window on this tab
  show: () => void;
  remove: () => void;
}

/** The public window: open and close it, add a tab beside Neo, or open it on a tab */
export interface PublicNeo {
  open: () => void;
  close: () => void;
  addTab: (spec: { id: string; label: string; launcher?: { label: string; aria: string }; onselect?: (inView: boolean) => void }) => PublicTab;
  show: (id: string) => void;
}

let current: PublicNeo | undefined;
const listeners = new Set<() => void>();

/** main.tsx hands over the window once the site's module has loaded */
export function setPublicNeo(neo: PublicNeo) {
  current = neo;
  for (const l of listeners) l();
}

/** The public window, once it has loaded (undefined before, and where it never loads: the walkthrough, a blocked module) */
export function usePublicNeo(): PublicNeo | undefined {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current);
}
