// apps/api/src/routes/notifications.ts - The bell: recent events by others in one organization, and
// marking them seen. Sending notices is the outbox's job (lib/transactions.ts, outbox.ts).


import { actorHears, groupOf, isOwnOrg, isQuickFix, neon1Only, noticeSummary } from "@1neon/domain";
import { actorId, need, now, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { eventLinks, type NoteLink } from "../lib/links.ts";


export type { NoteLink };


export function notificationRoutes(app: App, k: Kit) {
  const { repo } = k;

  // Notifications: what others did here lately, each with its group, importance, and where it leads,
  // and when the caller last looked. Info-level events (sign-ins) show in the list but never count as new
  app.get("/t/:tid/notifications", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const me = actorId(c);
    const [events, member] = await Promise.all([repo.listAudit(t.id, 60), repo.getMember(t.id, me)]);
    // Never opened: only the last three days count as new, so older history doesn't all light up at once
    const seenAt = member?.seenAt ?? new Date(Date.now() - 3 * 864e5).toISOString();
    const op = who(c).actor.operator;
    // Others' events, plus the caller's own signed records (a copy of what they agreed to, so signing
    // shows in the bell); in neon1's own organization, its billing too
    const own = isOwnOrg(t.slug);
    const mine = events.filter((e) => (e.actorId !== me || actorHears(e.action, own)) && (op || !neon1Only(e.action))).slice(0, 40);
    const links = await eventLinks(repo, t.id, mine);
    // A quick fix's client reads a quote, so notices about its proposal revisions say "Quote" (the
    // stored record keeps its number as issued). Projects are read only when such a notice is listed
    const quickKeys = mine.some((e) => e.action.startsWith("proposal."))
      ? new Set((await repo.listProjects(t.id)).filter(isQuickFix).map((p) => p.key))
      : new Set<string>();
    const list = mine.map((e, i) => {
      const g = groupOf(e.action);
      const key = /^([A-Z][A-Z0-9]*-\d+):/.exec(e.summary)?.[1] ?? "";
      return { ...e, summary: noticeSummary(e.summary, quickKeys.has(key)), group: g.id, level: g.level, unread: e.at > seenAt && g.level !== "info", link: links[i] };
    });
    return c.json({ seenAt, unread: list.filter((e) => e.unread).length, events: list });
  });

  // Opening the list marks everything up to now as seen
  app.post("/t/:tid/notifications/seen", async (c) => {
    need(c, "read");
    const t = c.get("tenant");
    const m = await repo.getMember(t.id, actorId(c));
    if (m) await repo.saveMember({ ...m, seenAt: now(), version: m.version + 1, updatedAt: now(), updatedBy: actorId(c) }, { version: m.version });
    return c.body(null, 204);
  });
}
