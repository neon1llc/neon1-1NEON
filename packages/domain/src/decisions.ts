// packages/domain/src/decisions.ts - What waits on a client's decision, and when to remind them.
// Reminders and any board state that means "waiting on you" read the same facts.

import { agreementCovers, AGREEMENT_EDITION } from "./agreement.ts";
import { revisions, priceCheckDue } from "./proposal.ts";
import { PurchaseFields, type Item, type Project, type Tenant } from "./model.ts";

/** One decision only the client can make. `since` is when it became ready to decide */
export interface ClientDecision {
  key: string;
  kind: "choose" | "accept" | "agree" | "sign";
  title: string;
  since: string;
  projectId?: string;
  projectKey?: string;
}

/** Business days after a decision starts waiting that each reminder goes; neon1 hears with the last */
export const REMIND_BUSINESS_DAYS = [3, 7] as const;

const latest = (list: { updatedAt: string }[]) => list.map((i) => i.updatedAt).sort().at(-1)!;

/** The decisions waiting in one project; `today` is a date in the organization's time zone */
export function projectDecisions(p: Pick<Project, "id" | "key">, items: Item[], today: string): ClientDecision[] {
  const base = { projectId: p.id, projectKey: p.key };
  const out: ClientDecision[] = [];
  // An issued proposal with an option that can be approved as issued. A lapsed price check is neon1's turn
  const rev = revisions(items).at(-1);
  if (rev && !priceCheckDue(rev.p, today) && !items.some((i) => i.kind === "option" && i.status === "approved")) {
    const issued = new Map(rev.p.snapshot.options.map((o) => [o.id, o.version]));
    if (items.some((i) => i.kind === "option" && i.status === "proposed" && issued.get(i.id) === i.version)) {
      out.push({ ...base, key: `choose:${rev.id}`, kind: "choose", title: `Choose an option in ${rev.title}`, since: rev.createdAt });
    }
  }
  // A finished handover waits for a recorded acceptance; silence never accepts it
  const steps = items.filter((i) => i.kind === "handoff");
  if (steps.length && steps.every((i) => i.status === "done") && steps.some((i) => !i.fields.accepted)) {
    out.push({ ...base, key: `accept:${p.id}`, kind: "accept", title: "Accept the handover", since: latest(steps) });
  }
  for (const i of items) {
    if (i.kind !== "purchase" || i.status !== "open") continue;
    const f = PurchaseFields.parse(i.fields);
    if (f.buyer === "neon1" && !f.agreed) out.push({ ...base, key: `agree:${i.id}`, kind: "agree", title: `Agree to the purchase "${i.title}"`, since: i.updatedAt });
  }
  return out;
}

/** The agreement signature an approval can't happen without */
export function signatureDecision(t: Pick<Tenant, "agreements">, waiting: ClientDecision[]): ClientDecision | undefined {
  const choice = waiting.find((d) => d.kind === "choose");
  if (!choice || agreementCovers(t.agreements)) return undefined;
  return { key: `sign:${AGREEMENT_EDITION}`, kind: "sign", title: `Sign the service agreement, edition ${AGREEMENT_EDITION}`, since: choice.since };
}

interface Person { userId: string; access?: string; status: string; joinedAt?: string; invitedAt: string }

/**
 * Who is asked to decide: every named decision maker who has joined. With none named, the client's first
 * admin, who can decide or name someone. `members` are the client's own people, never neon1
 */
export function askedToDecide(members: Person[], people: readonly { userId: string; role: string }[]) {
  const named = new Set(people.filter((p) => p.role === "decision_maker").map((p) => p.userId));
  const joined = members.filter((m) => m.status === "joined");
  if (named.size) return { named: true, ids: joined.filter((m) => named.has(m.userId)).map((m) => m.userId) };
  const first = joined.filter((m) => m.access === "admin").sort((a, b) => (a.joinedAt ?? a.invitedAt).localeCompare(b.joinedAt ?? b.invitedAt))[0];
  return { named: false, ids: first ? [first.userId] : [] };
}

/** Weekdays after `from` up to and including `to` (calendar dates). Holidays count as weekdays */
export function businessDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`) + 86_400_000; t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}
