// packages/domain/src/caliber.ts - How well a project is outlined: the rubric behind Next step on a free
// account's Home and behind what neon1 sees with an assessment request. A pure function of the project
// and its items, so the tips are the same every time and testable.
//
// Free accounts write down their needs with nothing required: every part is optional, and the rubric only
// nudges. Three parts are the minimum caliber for an assessment to be worth reading (what it is, what done
// looks like, one real example). Four more are optional depth (who does the work, the systems involved, a
// measure, a target date). A project with the minimum is "ready", and with two or more of the depth parts
// it's "strong". Client accounts can require more of these (the API decides), using the same function.


import { TEMPLATES, QUICK_FIX } from "./defaults.ts";
import type { Item, Layer, Project } from "./model.ts";


/** The first question a template project asks, and the title the wizard gives the example it collects */
export const EXAMPLE_TITLE = "One real example of how it works today";
/** The second starter question, answered as who does the work and how often */
const PEOPLE_TITLE = "Who does this work, and how often?";

/** Enough text to count as written: a short sentence, not a word or two */
export const MIN_SUMMARY = 20;
export const MIN_OUTCOME = 15;
export const MIN_WRITTEN_ANSWER = 30;


/** The parts of an outline, core first */
export type OutlinePart = "what" | "done" | "example" | "people" | "systems" | "measure" | "date";
export const CORE_PARTS: readonly OutlinePart[] = ["what", "done", "example"];
export const DEPTH_PARTS: readonly OutlinePart[] = ["people", "systems", "measure", "date"];
/** Depth parts a project needs, beyond the core three, to count as strong */
export const STRONG_DEPTH = 2;


/** One thing still to add: a short noun phrase to list, the sentence that says how, and where to do it */
export interface OutlineTip {
  part: OutlinePart;
  core: boolean;
  /** "what done looks like": reads after "add" and in lists */
  label: string;
  /** A full sentence for one-at-a-time hints */
  tip: string;
  /** The project's overview (edit in place), or a layer tab */
  where: "overview" | Layer;
  /** The item to open there, when the part is an item that already exists */
  itemId?: string;
}


export type OutlineLevel = "begun" | "ready" | "strong";

export interface Outline {
  id: string;
  key: string;
  name: string;
  level: OutlineLevel;
  /** Parts already written */
  have: OutlinePart[];
  /** Everything still to add, core first */
  tips: OutlineTip[];
  /** The part of `tips` below the minimum caliber; empty means ready */
  missingCore: OutlineTip[];
  /** The part of `tips` that's optional depth */
  missingDepth: OutlineTip[];
}


const TEXT: Record<OutlinePart, { label: string; tip: string; core: boolean; where: OutlineTip["where"] }> = {
  what: { label: "what it is", tip: "Say in a sentence or two what this is.", core: true, where: "overview" },
  done: { label: "what done looks like", tip: "Say what will be true when it's done.", core: true, where: "overview" },
  example: { label: "one real example", tip: "Give one real example of how it works today.", core: true, where: "needs" },
  people: { label: "who does the work", tip: "Say who does this work and how often.", core: false, where: "needs" },
  systems: { label: "the systems involved", tip: "Name the tools, systems, or accounts it touches. Never passwords.", core: false, where: "needs" },
  measure: { label: "a measure", tip: "Add one measure: where it stands now and where it should be.", core: false, where: "observation" },
  date: { label: "a target date", tip: "Set a target date, even a rough one.", core: false, where: "overview" },
};


// A template adds starter items the person hasn't written: a question to answer, a system to name, a
// measure with no numbers. They count only once the person changes them, never just for being there
const starters = (template: string) => new Set((TEMPLATES.find((t) => t.id === template)?.items ?? []).map((i) => `${i.kind}|${i.title}`));

const written = (s: string | undefined, min: number) => (s ?? "").trim().length >= min;


/** "G, H, and I": a list in a sentence */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;
}


/**
 * How well one project is outlined, and what to add next. A starter item the template made counts only
 * when the person has written in it (an answer, a note, numbers) or finished it; an item they added
 * themselves counts when it holds something. A quick fix asks for one thing, what's wrong, so it is ready
 * (and finished) once that's written
 */
export function outlineOf(project: Pick<Project, "id" | "key" | "name" | "summary" | "outcome" | "template" | "targetDate">, items: readonly Pick<Item, "id" | "kind" | "title" | "body" | "status" | "fields">[]): Outline {
  const quick = project.template === QUICK_FIX;
  const seeded = starters(project.template);
  const own = (i: Pick<Item, "kind" | "title">) => !seeded.has(`${i.kind}|${i.title}`) && i.title !== EXAMPLE_TITLE;
  const discovery = items.filter((i) => i.kind === "discovery");
  const answered = (i: Pick<Item, "body">) => written(i.body, MIN_WRITTEN_ANSWER);

  const exampleItem = discovery.find((i) => i.title === EXAMPLE_TITLE);
  // Questions the person added and answered: one can stand in for the example, another for who and how often
  const others = discovery.filter((i) => own(i) && answered(i)).length;
  const peopleItem = discovery.find((i) => i.title === PEOPLE_TITLE);
  const systems = items.find((i) => i.kind === "asset" && (own(i) ? written(i.title, 3) : answered(i)));
  const measure = items.find((i) => {
    if (i.kind !== "metric") return false;
    const f = i.fields as { baseline?: unknown; target?: unknown };
    return own(i) || f.baseline !== undefined || f.target !== undefined;
  });

  const has = new Map<OutlinePart, boolean>([
    ["what", written(project.summary, MIN_SUMMARY)],
    ["done", !quick && written(project.outcome, MIN_OUTCOME)],
    ["example", !quick && Boolean((exampleItem && answered(exampleItem)) || others > 0)],
    ["people", Boolean((peopleItem && answered(peopleItem)) || others > (exampleItem && answered(exampleItem) ? 0 : 1))],
    ["systems", Boolean(systems)],
    ["measure", Boolean(measure)],
    ["date", Boolean(project.targetDate)],
  ]);

  // A quick fix has no example or done-when to collect, and nothing to measure unless someone adds it
  const parts = quick ? (["what"] as OutlinePart[]) : [...CORE_PARTS, ...DEPTH_PARTS];
  // Where an unanswered example or question already sits, the tip opens it
  const itemFor: Partial<Record<OutlinePart, string>> = { example: exampleItem?.id, people: peopleItem?.id };
  const tip = (part: OutlinePart): OutlineTip => ({ part, ...TEXT[part], ...(itemFor[part] ? { itemId: itemFor[part] } : {}) });

  const tips = parts.filter((p) => !has.get(p)).map(tip);
  const missingCore = tips.filter((t) => t.core);
  const missingDepth = tips.filter((t) => !t.core);
  const depth = DEPTH_PARTS.filter((p) => has.get(p)).length;
  const level: OutlineLevel = missingCore.length > 0 ? "begun" : quick || depth >= STRONG_DEPTH ? "strong" : "ready";
  return { id: project.id, key: project.key, name: project.name, level, have: parts.filter((p) => has.get(p)), tips, missingCore, missingDepth };
}


/** One project in words for neon1's email: its key, name, level, and what's still missing */
export function outlineSummary(o: Outline): string {
  const level = { begun: "begun", ready: "ready to read", strong: "well outlined" }[o.level];
  const missing = o.missingCore.length ? ` Missing: ${joinWords(o.missingCore.map((t) => t.label))}.` : "";
  const more = o.level === "ready" && o.missingDepth.length ? ` Could add: ${joinWords(o.missingDepth.map((t) => t.label))}.` : "";
  return `${o.key} ${o.name}: ${level}.${missing}${more}`;
}
