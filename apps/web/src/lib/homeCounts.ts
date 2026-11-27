// apps/web/src/lib/homeCounts.ts - What the View button says: only what hidden cards hold, counted once.


export interface Counts { urgent: number; suggested: number; general: number }
export interface Held { shown: boolean; counts: Counts; mirror?: boolean }

// Urgent first, then suggested; cards that repeat another card's items (mirror) never count, and what's
// on screen speaks for itself through its own badges
export function hiddenHeld(rows: Held[]): { kind: "urgent" | "suggested"; n: number } | undefined {
  const hidden = rows.filter((r) => !r.shown && !r.mirror);
  const urgent = hidden.reduce((n, r) => n + r.counts.urgent, 0);
  if (urgent) return { kind: "urgent", n: urgent };
  const suggested = hidden.reduce((n, r) => n + r.counts.suggested, 0);
  return suggested ? { kind: "suggested", n: suggested } : undefined;
}
