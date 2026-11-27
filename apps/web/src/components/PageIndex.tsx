// apps/web/src/components/PageIndex.tsx - The section index for 1NEON's long documents (the legal pages, the service
// agreement, and a proposal): neon1.tech's shared/page-index.js, a rail on a wide screen and a thin line under the bar on a
// phone. Working screens don't take it, where a place in the scroll says little.

import { useEffect } from "react";

// The site serves the module; if it can't load, the document reads the same without it
const SHARED = "/shared/page-index.js";
type Item = { el: Element; name: string };
type Shared = { pageIndex(items: Item[], opts: { end: Element; top: () => number; screens: number }): () => void };


/** Indexes the h2 headings inside `within`. Mount it with the document, and key it by what changes the headings */
export function PageIndex({ within }: { within: string }) {
  useEffect(() => {
    let remove: (() => void) | undefined, gone = false;
    void import(/* @vite-ignore */ SHARED).then((m: Shared) => {
      const doc = document.querySelector(within);
      if (gone || !doc) return;
      const barFoot = () => document.querySelector("header.top, header.n1-bar")?.getBoundingClientRect().bottom ?? 0;
      const items = [...doc.querySelectorAll("h2")].map((el) => ({ el, name: el.textContent?.trim() ?? "" })).filter((i) => i.name);
      // A section picked from the index lands clear of the bar
      for (const { el } of items) (el as HTMLElement).style.scrollMarginTop = `${Math.round(barFoot()) + 16}px`;
      // A document shorter than a screen and a half needs no index; the line sits at the foot of whichever bar is showing
      remove = m.pageIndex(items, { end: doc, screens: 1.5, top: barFoot });
    }).catch(() => undefined);
    return () => { gone = true; remove?.(); };
  }, [within]);
  return null;
}
