// apps/web/src/lib/outline.ts - The words Next step uses about how well projects are outlined. The rubric
// (what counts, which parts are the minimum) is packages/domain/src/caliber.ts; this turns its result into
// the lines on Home, where each Continue link goes, and what the verification step says is still short.


import { joinWords, type Outline, type OutlineTip } from "@1neon/domain";


/** The project's own page for a tip: the overview, or the layer tab (and item) it points at */
export function tipPath(base: string, o: Pick<Outline, "key">, tip: Pick<OutlineTip, "where" | "itemId"> | undefined, slug: (layer: "needs" | "observation") => string): string {
  const at = `${base}/projects/${o.key}`;
  if (!tip || tip.where === "overview") return at;
  const layer = tip.where === "observation" ? "observation" : "needs";
  return `${at}/${slug(layer)}${tip.itemId ? `#item-${tip.itemId}` : ""}`;
}


/** One project that still has something to add: what's true, and the one thing to add next */
export interface OutlineLine {
  outline: Outline;
  /** "You've begun outlining ABC-1." */
  lead: string;
  /** "Add what done looks like and one real example." */
  tip?: string;
  /** Where Continue goes: the first thing missing, core before depth */
  next?: OutlineTip;
}

export interface OutlineStatus {
  /** One line each for projects that aren't well outlined yet */
  lines: OutlineLine[];
  /** The well-outlined ones, as one sentence */
  strong?: { keys: string[]; text: string; outlines: Outline[] };
  /** The sentence before the request: which projects are in and what to do */
  closing: string;
}


/** The lines for every live project (at most a free account's three) */
export function outlineStatus(outlines: readonly Outline[]): OutlineStatus {
  const lines: OutlineLine[] = [];
  for (const o of outlines) {
    if (o.level === "strong") continue;
    if (o.level === "begun") {
      lines.push({ outline: o, lead: `You've begun outlining ${o.key}.`, tip: `Add ${joinWords(o.missingCore.map((t) => t.label))}.`, next: o.missingCore[0] });
    } else {
      // The basics are there; depth is optional, and at most two ideas are offered
      const more = o.missingDepth.slice(0, 2);
      lines.push({ outline: o, lead: `${o.key} has the basics.`, tip: more.length ? `You can still add ${joinWords(more.map((t) => t.label))}.` : undefined, next: o.missingDepth[0] });
    }
  }
  const strong = outlines.filter((o) => o.level === "strong");
  const keys = strong.map((o) => o.key);
  const names = joinWords(outlines.map((o) => o.key));
  const anyReady = outlines.some((o) => o.level !== "begun");
  const closing = outlines.length === 0 ? "Start a project to have something to assess."
    : anyReady ? `I see you've outlined ${names}. If you're ready for eyes, request the assessment below.`
    : "You can request the assessment now, or add more first.";
  return { lines, closing, ...(strong.length ? { strong: { keys, outlines: strong, text: `${joinWords(keys)} ${keys.length === 1 ? "is" : "are"} well outlined.` } } : {}) };
}


/** What the verification step says about the chosen projects that are below the basics, one line each */
export function shortNotes(chosen: readonly Outline[]): { key: string; text: string }[] {
  return chosen.filter((o) => o.missingCore.length > 0).map((o) => ({ key: o.key, text: `You can still optionally add ${joinWords(o.missingCore.map((t) => t.label))} to ${o.key}.` }));
}
