// packages/domain/src/outline.ts - How well a project is outlined before neon1 assesses it. Six parts,
// each read from what the project already holds, so nothing new has to be filled in to count. The API
// uses it for the assessment request (and its email); the web app uses the same parts for Home's Next
// step and the project's Overview, so the tips a person sees are the ones neon1 reads by.


import { TEMPLATES } from "./defaults.ts";


/** The parts of an outline, in the order they're asked. `tip` finishes "add ..." in a sentence */
export const OUTLINE_PARTS = [
  { id: "what", label: "What it is", tip: "what this is, in a sentence or two" },
  { id: "today", label: "How it works today", tip: "one real example of how it works today" },
  { id: "done", label: "What done looks like", tip: "what will be true when it's done" },
  { id: "who", label: "Who and what it touches", tip: "who does this work and the tools it touches" },
  { id: "measure", label: "How we'll know it worked", tip: "a measure with where it is now" },
  { id: "limits", label: "Timing and limits", tip: "a target date or any limits, such as budget or must-nots" },
] as const;
export type OutlinePart = (typeof OUTLINE_PARTS)[number]["id"];

/** The parts an outline needs before it reads as "outlined" rather than "started" */
export const OUTLINE_CORE: readonly OutlinePart[] = ["what", "today", "done"];

// Fewer characters than this reads as a placeholder, not an answer
const WORDS = 12;

// The starter titles templates add with no answer: they ask, they don't tell, so they never count alone
const STARTER = new Set(TEMPLATES.flatMap((t) => t.items.map((i) => i.title)));

// The example question the wizard and the API share (routes/projects.ts)
export const EXAMPLE_TITLE = "One real example of how it works today";

/** The bits of a project the outline reads */
export interface OutlineProject { summary?: string; outcome?: string; targetDate?: string }
/** The bits of an item the outline reads */
export interface OutlineItem { kind: string; title: string; body?: string; fields?: Record<string, unknown> }

/** One project's outline: which parts are written, what's left, and how far along it is */
export interface Outline {
  have: OutlinePart[];
  missing: OutlinePart[];
  level: "started" | "outlined" | "complete";
}

const said = (s: string | undefined) => (s ?? "").trim().length >= WORDS;


/** Read a project's outline from its basics and items. A part counts when it has real words, not when a
 * box exists: a starter question with no answer is still a question */
export function outlineOf(p: OutlineProject, items: readonly OutlineItem[]): Outline {
  const answered = (i: OutlineItem) => said(i.body);
  const own = (i: OutlineItem) => answered(i) || !STARTER.has(i.title);
  const found: Record<OutlinePart, boolean> = {
    what: said(p.summary),
    today: items.some((i) => i.kind === "discovery" && i.title === EXAMPLE_TITLE && answered(i)),
    done: said(p.outcome),
    // Who does it (an answered question) or what it touches (a system or tool named or described)
    who: items.some((i) => (i.kind === "discovery" && i.title !== EXAMPLE_TITLE && answered(i)) || (i.kind === "asset" && own(i))),
    measure: items.some((i) => i.kind === "metric" && typeof i.fields?.baseline === "number"),
    limits: Boolean(p.targetDate) || items.some((i) => i.kind === "constraint" || (i.kind === "requirement" && own(i))),
  };
  const have = OUTLINE_PARTS.map((x) => x.id).filter((id) => found[id]);
  const missing = OUTLINE_PARTS.map((x) => x.id).filter((id) => !found[id]);
  const level = missing.length === 0 ? "complete" : OUTLINE_CORE.every((id) => found[id]) ? "outlined" : "started";
  return { have, missing, level };
}


/** "a, b, and c" with the Oxford comma */
export function listWords(words: readonly string[]): string {
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
}

/** The tip for what's missing, as one line: "add what done looks like and a measure with where it is now" */
export function outlineTip(missing: readonly OutlinePart[], max = 3): string {
  if (!missing.length) return "";
  const tips = missing.slice(0, max).map((id) => OUTLINE_PARTS.find((x) => x.id === id)!.tip);
  return `add ${listWords(tips)}${missing.length > max ? ", and more" : ""}`;
}
