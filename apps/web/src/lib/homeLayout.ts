// apps/web/src/lib/homeLayout.ts - Where one person keeps Home's cards in one organization: which are
// hidden, and each card's place on the wide grid and on a phone. Saved on the profile (PATCH /me), so it
// follows them to any device, with this browser's copy used until the profile answers or when it can't.


import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, HttpError } from "./api.ts";
import { prefs } from "./prefs.ts";
import type { Cell } from "./homeGrid.ts";
import type { Me } from "./types.ts";

// hidden: cards turned off; shown: cards that start off and were turned on
export interface Layout { hidden: string[]; shown?: string[]; wide?: Cell[]; narrow?: Cell[] }
const EMPTY: Layout = { hidden: [] };
const localKey = (userId: string, orgId: string) => `1neon.home.${userId}.${orgId}`;

function fromBrowser(userId: string, orgId: string): Layout | undefined {
  try { return JSON.parse(prefs.get(localKey(userId, orgId)) ?? "null") ?? undefined; } catch { return undefined; }
}


/** The layout, and one way to change it. Changes show at once and save a moment after the last one */
export function useHomeLayout(me: Me, orgId: string) {
  const qc = useQueryClient();
  const [layout, setLayout] = useState<Layout>(() => me.user.home?.[orgId] ?? fromBrowser(me.user.id, orgId) ?? EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A switch of organization reads that organization's layout
  useEffect(() => setLayout(me.user.home?.[orgId] ?? fromBrowser(me.user.id, orgId) ?? EMPTY), [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next: Layout, retry = true) => {
    // The profile as last read, so the version is current; a save that lost a race reads it again once
    const cur = qc.getQueryData<Me>(["me"]) ?? me;
    try {
      const user = await api<Me["user"]>("/me", { method: "PATCH", body: { version: cur.user.version, home: { ...cur.user.home, [orgId]: next } } });
      if (user) qc.setQueryData<Me>(["me"], (m) => (m ? { ...m, user } : m));
    } catch (e) {
      if (retry && e instanceof HttpError && e.status === 409) {
        await qc.refetchQueries({ queryKey: ["me"] });
        return save(next, false);
      }
      // Kept in this browser either way, so nothing is lost
    }
  };

  const change = (fn: (l: Layout) => Layout) => {
    setLayout((l) => {
      const next = fn(l);
      prefs.set(localKey(me.user.id, orgId), JSON.stringify(next));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next), 700);
      return next;
    });
  };
  return { layout, change };
}
