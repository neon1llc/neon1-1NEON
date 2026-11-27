// apps/api/src/routes/notifications.ts - The bell: recent events by others in one organization, and
// marking them read, one at a time or all at once. Sending notices is the outbox's job (lib/transactions.ts, outbox.ts).


import { actorHears, groupOf, isOwnOrg, isQuickFix, neon1Only, noticeSummary } from "@1neon/domain";
import { actorId, need, now, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { ConflictError } from "../store/types.ts";
import { eventLinks, type NoteLink } from "../lib/links.ts";


export type { NoteLink };


export function notificationRoutes(app: App, k: Kit) {
  const { repo } = k;

  // What the caller has read here. Before their first read, the older "last opened" mark on the
  // membership stands; never opened at all, only the last three days count as new
  const readState = async (tid: string, uid: string) => {
    const bell = await repo.getBell(tid, uid);
    const allAt = bell?.allAt ?? (await repo.getMember(tid, uid))?.seenAt;
    return { allAt, ids: bell?.ids ?? [], version: bell?.version, since: allAt ?? new Date(Date.now() - 3 * 864e5).toISOString() };
  };

  // Change the read record; two quick taps retry on the newer copy
  const write = async (tid: string, uid: string, change: (b: { allAt?: string; ids: string[] }) => { allAt?: string; ids: string[] }) => {
    for (let tries = 0; ; tries++) {
      const was = await readState(tid, uid);
      try {
        return await repo.table.write([repo.bellOp(tid, uid, change(was), was.version)]);
      } catch (e) {
        if (!(e instanceof ConflictError) || tries >= 4) throw e;
      }
    }
  };

  // Notifications: what others did here lately, each with its group, importance, where it leads, and
  // whether the caller has read it. Info-level events (sign-ins) stay out: they're in the organization's activity,
  // not something to act on
  app.get("/t/:tid/notifications", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const me = actorId(c);
    const [events, state] = await Promise.all([repo.listAudit(t.id, 60), readState(t.id, me)]);
    const opened = new Set(state.ids);
    const op = who(c).actor.operator;
    // Others' events, plus the caller's own signed records (a copy of what they agreed to, so signing
    // shows in the bell); in neon1's own organization, its billing too
    const own = isOwnOrg(t.slug);
    const mine = events.filter((e) => (e.actorId !== me || actorHears(e.action, own)) && (op || !neon1Only(e.action)) && groupOf(e.action).level !== "info").slice(0, 40);
    const links = await eventLinks(repo, t.id, mine, op);
    // A quick fix's client reads a quote, so notices about its proposal revisions say "Quote" (the
    // stored record keeps its number as issued). Projects are read only when such a notice is listed
    const quickKeys = mine.some((e) => e.action.startsWith("proposal."))
      ? new Set((await repo.listProjects(t.id)).filter(isQuickFix).map((p) => p.key))
      : new Set<string>();
    const list = mine.map((e, i) => {
      const g = groupOf(e.action);
      const key = /^([A-Z][A-Z0-9]*-\d+):/.exec(e.summary)?.[1] ?? "";
      return { ...e, summary: noticeSummary(e.summary, quickKeys.has(key)), group: g.id, level: g.level, unread: e.at > state.since && !opened.has(e.id) && g.level !== "info", link: links[i] };
    });
    return c.json({ unread: list.filter((e) => e.unread).length, events: list });
  });

  // Opening one notification reads that one only
  app.post("/t/:tid/notifications/:id/read", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const id = c.req.param("id");
    // Only ids still in the recent list are kept, so the record stays small
    const recent = new Set((await repo.listAudit(t.id, 60)).map((e) => e.id));
    if (recent.has(id)) await write(t.id, actorId(c), (b) => ({ allAt: b.allAt, ids: [...new Set([...b.ids.filter((x) => recent.has(x)), id])] }));
    return c.body(null, 204);
  });

  // "Mark all read": everything up to the newest one on screen, so anything arriving meanwhile stays new
  app.post("/t/:tid/notifications/read-all", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const asked = Date.parse(c.req.query("upTo") ?? "");
    const upTo = new Date(Number.isNaN(asked) ? Date.parse(now()) : Math.min(asked, Date.parse(now()))).toISOString();
    await write(t.id, actorId(c), (b) => ({ allAt: b.allAt && b.allAt > upTo ? b.allAt : upTo, ids: [] }));
    return c.body(null, 204);
  });
}
