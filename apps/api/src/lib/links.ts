// apps/api/src/lib/links.ts - Where an event leads. The bell lists events with a link each, and a notice email opens the same
// place, so both read it from here: the item on its layer's tab, the project, or the page it belongs to.


import { KIND_LAYER, type AuditEvent, type ItemKind, type Layer, type Project } from "@1neon/domain";
import type { Repo } from "../store/repo.ts";


// Each layer's word in the web app's addresses (the same four as apps/web/src/components/ui.tsx); the stored keys resolve there too
const SLUG: Record<Layer, string> = { needs: "needs", execution: "execute", observation: "observe", next: "normalize" };


/** Where a notification leads, in the organization's own terms; the web turns it into a path. `anchor`
 * is the spot on that page, which the page scrolls to and marks */
export interface NoteLink {
  page?: "people" | "settings" | "documents" | "workspace" | "agreement" | "projects" | "prospects";
  project?: string;
  layer?: Layer;
  item?: string;
  invoice?: string;
  anchor?: string;
  /** The calendar day Home opens on */
  day?: string;
}


/** Work out where each event leads. Projects come from the project list; items say their project in the summary's leading key
 * ("FLOW-1: ..."), and comments and calendar events are read once for their layer or day. Anything removed leads to what's left
 * (the list it was in, or its project's tab), or nowhere. `operator` is who's looking: neon1's own pages differ */
export async function eventLinks(repo: Pick<Repo, "listProjects" | "getItem" | "getCalEvent">, tid: string, events: AuditEvent[], operator = false): Promise<(NoteLink | undefined)[]> {
  const projects = (await repo.listProjects(tid)).filter((p: Project) => !p.deletedAt);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const byKey = new Map(projects.map((p) => [p.key, p]));
  return Promise.all(events.map(async (e): Promise<NoteLink | undefined> => {
    const [kind, verb] = e.action.split(".") as [string, string];
    if (kind === "member") return { page: "people", anchor: `member-${e.target}` };
    if (kind === "org") return e.action === "org.stages" ? { page: "settings", anchor: "stages" } : e.action === "org.profile" ? { page: "settings", anchor: "where" } : { page: "workspace" };
    if (kind === "agreement") return { page: "agreement", ...(verb === "choices" ? { anchor: "choices" } : {}) };
    // A free account's own story: neon1 reads it on the Prospects page, its people on Home
    if (kind === "prospect") return operator && verb !== "promoted" ? { page: "prospects", anchor: `org-${e.target}` } : { page: "workspace" };
    // An assessment or call request sits in Home's Next step card; neon1, who has no such card, reads it in the activity
    if (kind === "request") return { page: "workspace", anchor: operator ? "activity" : "next-step" };
    if (kind === "doc") return { page: "documents", ...(verb === "deleted" ? {} : { anchor: `doc-${e.target}` }) };
    // Calendar events live on Home's calendar, opened on their day
    if (kind === "calendar") {
      const ev = verb === "deleted" ? undefined : await repo.getCalEvent(tid, e.target).catch(() => undefined);
      return { page: "workspace", anchor: "coming-up", ...(ev ? { day: ev.date } : {}) };
    }
    if (kind === "project") {
      const p = byId.get(e.target);
      if (!p) return { page: "projects" };
      return { project: p.key, ...(verb === "decider_changed" ? { anchor: "people" } : {}) };
    }
    const p = byKey.get(/^([A-Z][A-Z0-9]*-\d+):/.exec(e.summary)?.[1] ?? "");
    if (!p) return undefined;
    // Invoices and their payments open the invoice, with its lines and Pay
    if (kind === "invoice" || kind === "payment") return { project: p.key, invoice: e.target };
    if (kind === "comment") {
      const item = await repo.getItem(tid, p.id, e.target).catch(() => undefined);
      return item ? { project: p.key, layer: KIND_LAYER[item.kind as ItemKind], item: item.id } : { project: p.key };
    }
    const layer = KIND_LAYER[kind as ItemKind];
    if (!layer) return { project: p.key };
    return verb === "deleted" ? { project: p.key, layer } : { project: p.key, layer, item: e.target };
  }));
}


/** The address a link opens, under the organization's home ("https://host/1NEON/o/acme"): the web app's route for it, so a notice
 * email lands on the item and not on Home. */
export function linkUrl(home: string, link: NoteLink | undefined): string | undefined {
  if (!link) return undefined;
  const hash = link.anchor ? `#${link.anchor}` : "";
  // Prospects is neon1's own page, outside any organization
  if (link.page === "prospects") return `${home.replace(/\/o\/[^/]*$/, "")}/prospects${hash}`;
  if (link.page) return `${home}/${link.page}${link.day ? `?day=${link.day}` : ""}${hash}`;
  if (!link.project) return undefined;
  if (link.invoice) return `${home}/projects/${link.project}/invoices/${link.invoice}`;
  return `${home}/projects/${link.project}${link.layer ? `/${SLUG[link.layer]}` : ""}${link.item ? `#item-${link.item}` : hash}`;
}
