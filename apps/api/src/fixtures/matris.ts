// apps/api/src/fixtures/matris.ts - MATRIS, Inc.: one made-up client organization that holds every state
// the portal knows, so a person (or a test) can sign in and find each feature with real-looking data in it.
// A returning client from Meta City, MX: closed 2025 work, a lapse as a potential, and a full slate of
// projects at the beginning, middle, and end of every way of working. docs/matris.md maps each feature
// and edge case to the record that covers it; add a row there and data here with every new feature.
//
// Pure data through the Repo: nothing here sends mail, texts, or pushes. The dev wrapper
// (scripts/matris.ts) resets the organization, creates the sign-ins, and uploads the file bytes.


import * as Y from "yjs";
import { THREAD } from "../lib/reply.ts";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import {
  AGREEMENT_EDITION, AGREEMENT_TEXT, EARLIER_AGREEMENTS, QUICK_FIX, SIGN_AUTHORITY, CalEvent, DEFAULT_STAGES, DocumentRecord, InvoiceFields, Item, Page, alignPrice,
  assessed, canonical, depositLines, finalLines, formatClientId, invoiceNumber, invoiceTotal, rankBetween, sha256Hex, signature,
  type ChatBlock, type ChatMessage, type ChatThread, type HomeLayout, type Member, type Project, type Stage, type Tenant, type User,
} from "@1neon/domain";
import { issueProposal } from "../proposals.ts";
import type { Repo } from "../store/repo.ts";


/** Bumped with every change to the story or its coverage, and printed on each run */
export const MATRIS_VERSION = "1.1.0";
export const MATRIS_SLUG = "matris";

// A made-up hourly rate for estimates (never neon1's rate)
const RATE = 13_500;

// Time `n` days from now (negative is the past), so the fixture always reads as current
const DAY = 86_400_000;
const day = (n: number, hour = 15) => { const d = new Date(Date.now() + n * DAY); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
const date = (n: number) => day(n).slice(0, 10);

// A sortable ID stamped at a past moment (ids.ts layout: 10 time digits, then random), for chat order
const B32 = "0123456789abcdefghjkmnpqrstvwxyz";
function idAt(iso: string, prefix = "") {
  let t = Date.parse(iso), s = "";
  for (let i = 0; i < 10; i++) { s = B32[t % 32] + s; t = Math.floor(t / 32); }
  for (let i = 0; i < 12; i++) s += B32[Math.floor(Math.random() * 32)];
  return prefix + s;
}


/** Who signs in: the five people Pradeep named, plus a former admin and someone invited who never joined */
export interface MatrisPerson { key: string; name: string; title: string; access: Member["access"]; status: Member["status"]; tag: string }
export const PEOPLE: MatrisPerson[] = [
  { key: "jorgeus", name: "Jorgeus Hittemi", title: "Chief operating officer", access: "admin", status: "joined", tag: "jhittemi" },
  { key: "neil", name: "Neil Dojj", title: "Network operations lead", access: "admin", status: "joined", tag: "ndojj" },
  { key: "felicity", name: "Felicity Thise-Dojj", title: "Finance director", access: "editor", status: "joined", tag: "fthise-dojj" },
  { key: "lennon", name: "Lennon K", title: "Field systems analyst", access: "editor", status: "joined", tag: "lk" },
  { key: "sirus", name: "Sirus Hill", title: "Contract technician", access: "viewer", status: "joined", tag: "shill" },
  // Edge cases: the admin who signed the 2025 agreement and left, and an invitation never accepted
  { key: "cypher", name: "Cypher Reyes", title: "Former IT manager", access: "admin", status: "deactivated", tag: "creyes" },
  { key: "tank", name: "Tank Ortiz", title: "Tower crew chief", access: "viewer", status: "invited", tag: "tortiz" },
];

/** A test address: the operator inbox plus "+<first initial><last name>" */
export const matrisEmail = (base: string, tag: string) => { const [local, host] = base.split("@"); return `${local}+${tag}@${host}`; };


/** A file whose bytes the wrapper uploads (records only exist here) */
export interface MatrisFile { key: string; body: string; contentType: string }


/** The organization's board: renamed, one custom stage, one hidden, tighter WIP limits */
export const MATRIS_STAGES: Stage[] = (() => {
  const s = DEFAULT_STAGES.map((x) => ({ ...x }));
  s.find((x) => x.id === "listen")!.name = "Discover";
  s.find((x) => x.id === "build")!.wipLimit = 2;
  s.find((x) => x.id === "verify")!.wipLimit = 1;
  const at = s.findIndex((x) => x.id === "verify");
  s.splice(at + 1, 0, { id: "secreview", name: "Security review", layer: "observation", exit: "Findings fixed or accepted in writing", hidden: false });
  s.splice(1, 0, { id: "parked", name: "Parked", layer: "needs", exit: "", hidden: true });
  return s;
})();


/** Build MATRIS in an empty slot of the store. The gmail operator is the inbox the aliases hang off */
export async function seedMatris(repo: Repo, o: { operators: string[]; tenantId?: string; clientId?: string }) {
  const op = o.operators;
  const base = op.find((e) => e.endsWith("@gmail.com")) ?? op[0]!;
  const files: MatrisFile[] = [];
  const t0 = day(-430);

  // --- People ---------------------------------------------------------------
  // Operators keep their own profile; MATRIS people are (re)written to the story's profile each run
  const ensure = async (email: string, name: string, title: string, extra: Partial<User> = {}, own = true): Promise<User> => {
    const uid = await repo.userIdForEmail(email);
    const was = uid ? await repo.getUser(uid) : undefined;
    if (was && !own) return was;
    const u: User = { id: was?.id ?? idAt(t0, "u"), email, name, title, phone: "", operator: false, strongAuth: false, theme: "providence", menu: "default", ...extra, version: (was?.version ?? 0) + 1, createdAt: was?.createdAt ?? t0, updatedAt: day(-1), updatedBy: was?.id ?? "matris" };
    if (was) await repo.saveUser(u, was.version); else await repo.createUser(u);
    return u;
  };
  const neon1 = await ensure(base, "neon1", "", {}, false);
  const pradeep = await ensure(op.find((e) => e.endsWith("@neon1.tech")) ?? base, "Pradeep", "", {}, false);
  const tz = "America/Mexico_City";
  // Profiles vary on purpose: every theme, both menus, tour states, links, notification choices
  const looks: Record<string, Partial<User>> = {
    jorgeus: { theme: "plugged", tour: "done", timeZone: tz, linkedin: "https://www.linkedin.com/in/example-jorgeus", website: "https://matris.example/", notify: { decisions: { email: true, sms: false }, billing: { email: true, sms: false } } },
    neil: { theme: "desert-of-the-real", menu: "mini", tour: "done", timeZone: tz, guide: "hidden", linksCard: "hidden" },
    felicity: { theme: "providence", tour: "later", timeZone: tz, businessLinkedin: "https://www.linkedin.com/company/example-matris" },
    lennon: { theme: "device", tour: "new", timeZone: "America/Tijuana" },
    sirus: { theme: "awake", timeZone: tz, notify: { chat: { email: false, sms: false } } },
    cypher: { theme: "awake", tour: "done" },
    tank: {},
  };
  const who: Record<string, User> = {};
  for (const p of PEOPLE) who[p.key] = await ensure(matrisEmail(base, p.tag), p.name, p.title, looks[p.key]);
  const { jorgeus, neil, felicity, lennon, sirus, cypher, tank } = who as Record<string, User>;

  // --- The organization --------------------------------------------------------
  const tid = o.tenantId ?? idAt(t0, "t");
  const old = EARLIER_AGREEMENTS.find((a) => a.edition === "2.3")!;
  const party = { legalName: "MATRIS, Inc.", address: "Av. Construct 101, Meta City, MX" };
  const t: Tenant = {
    id: tid, slug: MATRIS_SLUG, clientId: o.clientId ?? formatClientId(await repo.nextClientNumber()), name: "MATRIS, Inc.", status: "active", stages: MATRIS_STAGES, timeZone: tz,
    place: "Meta City, MX", link: "https://matris.example/", linkedin: "https://www.linkedin.com/company/example-matris",
    // Signed twice: edition 2.3 by the former IT manager in 2025, and the current edition on returning
    agreements: [
      { ...signature("agreement", "2.3", old.hash, { typedName: cypher!.name, consent: true }, { id: cypher!.id, name: cypher!.name, email: cypher!.email }, day(-425)), party, authority: SIGN_AUTHORITY },
      { ...signature("agreement", AGREEMENT_EDITION, await sha256Hex(AGREEMENT_TEXT), { typedName: jorgeus!.name, consent: true }, { id: jorgeus!.id, name: jorgeus!.name, email: jorgeus!.email }, day(-44)), party, authority: SIGN_AUTHORITY },
    ],
    // Choice history: decide later in 2025, then yes to anonymized case studies on returning
    choices: [
      { caseStudies: "later", naming: "ask", by: cypher!.id, name: cypher!.name, email: cypher!.email, at: day(-425), edition: "2.3" },
      { caseStudies: "yes", naming: "ask", by: jorgeus!.id, name: jorgeus!.name, email: jorgeus!.email, at: day(-44), edition: AGREEMENT_EDITION },
    ],
    // super keeps it, so the fixture never suspends itself for inactivity
    keptAt: day(-44),
    version: 1, createdAt: t0, updatedAt: day(-1), updatedBy: neon1.id,
  };
  await repo.createTenant(t);

  // Memberships: both operators, as a real client has, then MATRIS's own people
  const member = async (u: User, p: Pick<MatrisPerson, "access" | "status" | "title">, joined: number, extra: Partial<Member> = {}) => {
    const m: Member = {
      tenantId: tid, userId: u.id, email: u.email, name: u.name, title: p.title, access: p.access, status: p.status, invitedBy: neon1.id, invitedAt: day(joined - 1),
      ...(p.status === "invited" ? { invite: { state: "sent" as const, queuedAt: day(-3), sentAt: day(-3) } } : { joinedAt: day(joined), lastSeenAt: day(p.status === "joined" ? -1 : -300) }),
      ...extra, version: 1, createdAt: day(joined - 1), updatedAt: day(-1), updatedBy: neon1.id,
    };
    await repo.saveMember(m, { create: true });
    return m;
  };
  await member(neon1, { access: "admin", status: "joined", title: "" }, -430);
  if (pradeep.id !== neon1.id) await member(pradeep, { access: "admin", status: "joined", title: "" }, -430);
  const joinedAt: Record<string, number> = { jorgeus: -428, neil: -428, felicity: -400, lennon: -40, sirus: -30, cypher: -428, tank: -3 };
  for (const p of PEOPLE) {
    // Sirus: suspended automatically for abuse after a third chat pause (suspension.ts)
    const extra: Partial<Member> = p.key === "sirus" ? { suspended: { at: day(-2), why: "abuse" } } : {};
    await member(who[p.key]!, p, joinedAt[p.key]!, extra);
  }

  // --- Helpers --------------------------------------------------------------------
  const audit = (at: string, actorId: string, action: string, target: string, summary: string, details?: string[]) =>
    repo.table.write([repo.auditOp({ tenantId: tid, actorId, action, target, summary, ...(details ? { details } : {}) }, at)]);
  let prank = "";
  const projects: Record<string, Project> = {};
  type P = Partial<Project> & Pick<Project, "key" | "name" | "stageId" | "health"> & { made: number; moved?: number };
  const project = async (x: P) => {
    prank = rankBetween(prank, "");
    const { made, moved, ...rest } = x;
    const p: Project = {
      tenantId: tid, id: idAt(day(made), "p"), summary: "", outcome: "", template: "blank", stageEnteredAt: day(moved ?? made), rank: prank, people: [], flags: [], archived: false,
      ...assessed(x.health, neon1.id, day((moved ?? made) + 1)), ...rest, version: 1, createdAt: day(made), updatedAt: day(moved ?? made), updatedBy: neon1.id,
    };
    await repo.saveProject(p, { create: true });
    await audit(day(made), neon1.id, "project.created", p.id, `Created ${p.key} ${p.name}`);
    if (moved !== undefined && moved !== made) await audit(day(moved), neon1.id, "project.moved", p.id, `Moved ${p.key} to ${MATRIS_STAGES.find((s) => s.id === p.stageId)!.name}`);
    projects[p.key] = p;
    return p;
  };
  const irank: Record<string, string> = {};
  const item = async (p: Project, kind: Item["kind"], title: string, extra: Partial<Item> & { ago?: number } = {}) => {
    irank[p.id] = rankBetween(irank[p.id] ?? "", "");
    const { ago, ...rest } = extra;
    const at = ago === undefined ? p.createdAt : day(ago);
    const i = Item.parse({ tenantId: tid, projectId: p.id, id: idAt(at, "i"), kind, title, body: "", status: "open", rank: irank[p.id], fields: {}, version: 1, createdAt: at, updatedAt: at, updatedBy: neon1.id, ...rest });
    if (i.status === "done" && !i.completedAt) i.completedAt = i.updatedAt;
    await repo.saveItem(i, { create: true });
    return i;
  };
  const comment = async (p: Project, itemId: string, by: User, ago: number, body: string, hour = 15) => {
    const at = day(ago, hour);
    const name = by.id === neon1.id ? "neon1" : by.name;
    await repo.table.write([repo.commentOp({ tenantId: tid, projectId: p.id, itemId, id: idAt(at, "c"), at, authorId: by.id, authorName: name, body }),
      repo.auditOp({ tenantId: tid, actorId: by.id, action: "comment.added", target: itemId, summary: `${p.key}: ${name} commented` }, at)]);
  };
  // An option approved by a decision maker, with a decision carrying its terms and signature
  const approve = async (p: Project, title: string, body: string, fields: Record<string, unknown>, by: User, ago: number) => {
    const opt = await item(p, "option", title, { status: "approved", body, fields, ago: ago - 3, updatedAt: day(ago) });
    const terms = { title: opt.title, body: opt.body, ...opt.fields };
    const sig = signature("approval", `${p.key}-A`, await sha256Hex(canonical(terms)), { typedName: by.name, consent: true }, { id: by.id, name: by.name, email: by.email }, day(ago));
    const d = await item(p, "decision", `Approved: ${opt.title}`, { status: "approved", ago, fields: { optionId: opt.id, optionVersion: opt.version, approvedBy: by.id, approvedAt: day(ago), conditions: "", terms, approverName: by.name, approverEmail: by.email, signature: sig } });
    await audit(day(ago), by.id, "option.approved", opt.id, `${p.key}: ${by.name} approved "${opt.title}"`);
    return { opt, d };
  };
  const invoice = async (p: Project, seq: number, type: InvoiceFields["type"], lines: InvoiceFields["lines"], ago: number, extra: Partial<InvoiceFields> = {}, status = "issued") => {
    const f = InvoiceFields.parse({ type, lines, number: invoiceNumber(p.key, seq), issuedAt: day(ago), issuedBy: neon1.id, dueDate: date(ago + 15), billTo: { org: t.name, name: felicity!.name, email: felicity!.email }, ...extra });
    f.hash = await sha256Hex(canonical({ ...f, hash: undefined, total: invoiceTotal(f) }));
    const i = await item(p, "invoice", `Invoice ${f.number}`, { status, fields: f, ago });
    await audit(day(ago), neon1.id, "invoice.issued", i.id, `${p.key}: issued ${f.number}`);
    return i;
  };
  const pay = async (p: Project, inv: Item, ago: number, method: string, ref: string, cents?: number) => {
    const amountCents = cents ?? invoiceTotal(InvoiceFields.parse(inv.fields));
    await item(p, "payment", `Payment on ${String(inv.fields.number)}`, { status: "done", ago, fields: { invoiceId: inv.id, amountCents, method, ref, receivedAt: date(ago), recordedBy: neon1.id } });
  };
  const hours = async (p: Project, list: [number, number, string][], invoiceId?: string) => {
    for (const [ago, h, what] of list) await item(p, "time", what, { status: "done", ago, fields: { date: date(ago), hours: h, ...(invoiceId ? { invoiceId } : {}) } });
  };
  const doc = async (x: Partial<DocumentRecord> & Pick<DocumentRecord, "name" | "contentType">, ago: number, body?: string) => {
    const at = day(ago);
    const d = DocumentRecord.parse({ tenantId: tid, id: idAt(at, "d"), key: "", size: body ? Buffer.byteLength(body) : 2048, scan: "skipped", uploaded: Boolean(body), state: body ? "ready" : "receiving", version: 1, createdAt: at, updatedAt: at, updatedBy: neon1.id, ...x });
    d.key = `t/${tid}/${d.projectId ?? "_"}/${d.id}/${d.name.replace(/[^\w.\- ]+/g, "_")}`;
    await repo.saveDoc(d, { create: true });
    if (body) files.push({ key: d.key, body, contentType: d.contentType });
    await audit(at, d.updatedBy, "doc.uploaded", d.id, `Added "${d.name}"`);
    return d;
  };
  // A page written in the editor's own format (PageEditor: StarterKit, task lists, field "page")
  const schema = getSchema([StarterKit, TaskList, TaskItem]);
  const page = async (projectId: string | undefined, id: string, title: string, blocks: unknown[], by: User, ago: number, text: string) => {
    const ydoc = prosemirrorJSONToYDoc(schema, { type: "doc", content: blocks }, "page");
    const x = Page.parse({ tenantId: tid, ...(projectId ? { projectId } : {}), id, title, state: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64"), text, seen: {}, version: 1, createdAt: day(ago - 5), updatedAt: day(ago), updatedBy: by.id });
    await repo.table.write([repo.pageOp(x, { create: true })]);
  };
  const h2 = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const bullets = (xs: string[]) => ({ type: "bulletList", content: xs.map((x) => ({ type: "listItem", content: [para(x)] })) });
  const todo = (xs: [string, boolean][]) => ({ type: "taskList", content: xs.map(([x, checked]) => ({ type: "taskItem", attrs: { checked }, content: [para(x)] })) });
  const cal = async (e: Partial<CalEvent> & Pick<CalEvent, "title" | "kind" | "date">) => {
    const ev = CalEvent.parse({ tenantId: tid, id: idAt(day(-40), "e"), repeat: "none", notes: "", version: 1, createdAt: day(-40), updatedAt: day(-40), updatedBy: jorgeus!.id, ...e });
    await repo.table.write([repo.calEventOp(ev, { create: true })]);
  };
  const lead = { userId: neon1.id, role: "lead_engineer" as const };
  const dm = { userId: felicity!.id, role: "decision_maker" as const };

  // =================================================================================
  // 2025: the first engagement, closed and in care (returning-client history)
  // =================================================================================
  const zion = await project({ key: "ZION-1", name: "Billing server off the basement", stageId: "closed", health: "on_track", made: -420, moved: -330, targetDate: date(-340),
    summary: "Customer billing ran on one tower PC in the basement of the Meta City office, backed up to a USB drive.", outcome: "Billing runs on AWS with tested restores, and the basement PC is retired.",
    people: [lead, { userId: cypher!.id, role: "decision_maker" }, { userId: neil!.id, role: "tech_contact" }], handover: { at: day(-345), by: neon1.id, name: "neon1", note: "Cutover done, PC kept powered off for 30 days." } });
  await item(zion, "discovery", "One real example of how it works today", { status: "done", ago: -419, body: "In March 2025 the basement flooded to the second shelf. The billing PC sat on the third." });
  const zd = await approve(zion, "Billing on AWS, lifted as it is", "Move the billing app and its database to AWS without changing how it works.", { pricing: "fixed", cost: "$6,200 fixed", depositPercent: 50, timeline: "6 weeks", hours: "about 46 hours", recommended: true, result: "Billing runs in AWS and restores in under an hour." }, cypher!, -400);
  const zDep = await invoice(zion, 1, "deposit", depositLines(zd.d), -399);
  await pay(zion, zDep, -392, "wire", "BBVA wire 4471");
  const zFin = await invoice(zion, 2, "final", finalLines(zd.d, [zDep]), -344, { dispute: { by: cypher!.id, name: cypher!.name, at: day(-340), cents: 15_000, reason: "The cutover weekend call was billed twice.", resolved: { by: neon1.id, name: "neon1", at: day(-338), note: "Right, it was entered twice. A credit for one call is attached." } } });
  await invoice(zion, 3, "credit", [{ text: "Duplicate cutover call", qty: 1, unitCents: 15_000 }], -338, { appliesTo: zFin.id });
  await pay(zion, zFin, -330, "ach", "Stripe bank transfer", invoiceTotal(InvoiceFields.parse(zFin.fields)) - 15_000);
  // A void invoice: issued to the wrong contact, replaced the same day
  await invoice(zion, 4, "reimbursement", [{ text: "UPS for the network closet", qty: 1, unitCents: 31_900 }], -360, { voided: { by: neon1.id, name: "neon1", at: day(-360), reason: "Billed to the wrong contact; reissued as ZION-1-0005." } }, "void");
  const zr = await invoice(zion, 5, "reimbursement", [{ text: "UPS for the network closet", qty: 1, unitCents: 31_900 }], -360);
  await pay(zion, zr, -352, "check", "Check 1182");
  for (const [s, d] of [["Runbook: restore billing from last night", -347], ["Access handed to MATRIS accounts", -346], ["Basement PC wiped and retired", -332]] as const) {
    await item(zion, "handoff", s, { status: "done", ago: d, fields: { accepted: { by: cypher!.id, name: cypher!.name, at: day(-331), note: "", ...(d === -332 ? { quote: { text: "We stopped worrying about the basement.", mayQuote: true } } : {}) } } });
  }
  await item(zion, "metric", "Time to restore billing", { ago: -419, fields: { category: "reliability", unit: "hours", direction: "down", baseline: 48, baselineDate: date(-419), target: 1, readings: [{ at: date(-350), value: 0.75, note: "first restore drill" }, { at: date(-335), value: 0.5, note: "" }] } });
  await item(zion, "retro", "What went well, what to change", { status: "done", ago: -330, body: "Went well: the dry run caught the old PHP version. Change next time: book the cutover call once." });

  const ora = await project({ key: "ORA-1", name: "Support answers from our runbooks", stageId: "care", health: "on_track", made: -380, moved: -300,
    summary: "Support staff asked Neil the same twenty questions about outages and installs.", outcome: "Staff find the answer in MATRIS's own runbooks, with the page it came from.",
    people: [lead, { userId: neil!.id, role: "decision_maker" }] });
  await approve(ora, "Search over the runbooks", "A search page over MATRIS's runbooks, with the source of each answer.", alignPrice({ pricing: "estimate" as const, rateCents: RATE, hoursLow: 20, hoursHigh: 26, timeline: "5 weeks", recommended: true }), neil!, -370);
  await item(ora, "care", "Monthly care: re-index runbooks and check answers", { status: "open", ago: -300, body: "First Tuesday each month." });
  await item(ora, "care", "Quarterly review of unanswered questions", { status: "done", ago: -60 });
  await item(ora, "metric", "Questions that reach Neil each week", { ago: -379, fields: { category: "adoption", unit: "questions", direction: "down", baseline: 40, baselineDate: date(-379), target: 8, readings: [{ at: date(-280), value: 15, note: "" }, { at: date(-120), value: 9, note: "" }, { at: date(-10), value: 7, note: "" }] } });
  await item(ora, "training", "Show new support staff how to search", { status: "done", ago: -305 });
  await item(ora, "runbook", "Re-index after a runbook changes", { status: "done", ago: -302 });

  // The lapse: downgraded to a potential when the care plan paused, promoted back this fall
  await audit(day(-300), neon1.id, "member.deactivated", cypher!.id, `Deactivated ${cypher!.name}`);
  await audit(day(-290), neon1.id, "org.downgraded", tid, "super moved MATRIS, Inc. to potentials: care plan paused");
  await audit(day(-45), neon1.id, "prospect.promoted", tid, `super made MATRIS, Inc. a client again, keeping ${t.clientId}`);
  await audit(day(-44), jorgeus!.id, "agreement.signed", tid, `${jorgeus!.name} signed the service agreement, edition ${AGREEMENT_EDITION}`);

  // =================================================================================
  // NEON (steps): one project at every stage from intake to hand over
  // =================================================================================
  // Beginning: a request just in, not assessed
  const neb = await project({ key: "NEB-1", name: "Outage alerts customers can trust", stageId: "intake", health: "not_started", made: -2, lens: "steps",
    summary: "When fiber goes down, customers hear from social media before they hear from us.", people: [{ userId: lennon!.id, role: "stakeholder" }] });
  await item(neb, "request", "Text customers in an outage area within 10 minutes", { ago: -2, updatedBy: lennon!.id, requestedTiming: "before the rainy season", dueDate: date(60) });

  // Discover (renamed Listen): outline half written, baselines in, sensitive data flagged
  const key = await project({ key: "KEY-1", name: "One sign-in for field technicians", stageId: "listen", health: "on_track", made: -18, moved: -12, flags: ["pii"],
    summary: "Technicians juggle six logins on a phone with gloves on.", outcome: "One sign-in opens every tool a technician needs, and leavers lose access the same day.", people: [lead, { userId: neil!.id, role: "decision_maker" }, { userId: lennon!.id, role: "tech_contact" }] });
  await item(key, "discovery", "One real example of how it works today", { status: "done", ago: -16, body: "Tank's crew waited 40 minutes at tower MX-17 because nobody remembered the dispatch password." });
  await item(key, "discovery", "Who does this work, and which tools does it touch?", { status: "doing", ago: -15, assigneeId: lennon!.id, body: "Dispatch, the work-order app, the tower lock vendor, Google Workspace." });
  await item(key, "asset", "Google Workspace (MATRIS tenant)", { ago: -14, body: "Admin: Neil." });
  await item(key, "asset", "Tower lock vendor portal", { ago: -14 });
  await item(key, "requirement", "Leavers lose every login the day HR closes them", { ago: -13, fields: { priority: "must" } });
  await item(key, "requirement", "Works offline at a tower for a shift", { ago: -13, fields: { priority: "could" } });
  await item(key, "constraint", "No new monthly per-user fees above $4", { ago: -12 });
  await item(key, "metric", "Logins a technician keeps", { ago: -12, fields: { category: "security", unit: "logins", direction: "down", baseline: 6, baselineDate: date(-12), target: 1, readings: [] } });

  // Propose: options drafted by neon1, not issued yet (clients don't see drafts)
  const cons = await project({ key: "CONS-1", name: "Construct: a staging copy of provisioning", stageId: "propose", health: "on_track", made: -25, moved: -6,
    summary: "Every provisioning change is tested on live customers.", outcome: "Changes run on a staging copy first, refreshed weekly from production without customer data.", people: [lead, dm] });
  await item(cons, "discovery", "One real example of how it works today", { status: "done", ago: -24, body: "A VLAN change in October dropped 212 business lines for two hours." });
  await item(cons, "option", "A. A staging copy on AWS, refreshed weekly", { status: "draft", ago: -5, fields: alignPrice({ pricing: "estimate" as const, rateCents: RATE, hoursLow: 28, hoursHigh: 36, timeline: "6 weeks", recommended: true, why: "Matches production closely; costs about $90 a month to run." }) });
  await item(cons, "option", "B. A test VLAN on the existing switches", { status: "draft", ago: -5, fields: { cost: "$1,800 fixed", pricing: "fixed", timeline: "2 weeks", why: "Cheaper, but shares hardware with live traffic." } });

  // Decide: two issued revisions, the latest waiting on Felicity for 12 days (overdue, reminded twice)
  const src = await project({ key: "SRC-1", name: "One source of truth for network inventory", stageId: "decide", health: "at_risk", made: -40, moved: -20, targetDate: date(45),
    summary: "Switches, ONTs, and tower radios live in three spreadsheets and a whiteboard.", outcome: "One inventory, updated by the tools themselves, that the NOC and finance both trust.", people: [lead, dm, { userId: neil!.id, role: "tech_contact" }, { userId: jorgeus!.id, role: "sponsor" }] });
  await item(src, "discovery", "One real example of how it works today", { status: "done", ago: -38, body: "Finance paid support on 40 radios that were scrapped in 2024." });
  await item(src, "discovery", "Who does this work, and which tools does it touch?", { status: "done", ago: -37, body: "Neil's NOC team and Felicity's finance team, across the three sheets, LibreNMS, and the asset tags." });
  await item(src, "requirement", "Every device has one record with its owner and contract", { ago: -36, fields: { priority: "must" } });
  await item(src, "requirement", "Finance sees cost per device without asking the NOC", { ago: -36, fields: { priority: "should" } });
  const srcFile = await item(src, "file_request", "Export of all three inventory sheets", { ago: -35, assigneeId: jorgeus!.id, dueDate: date(-9) });
  const srcInv = await item(src, "file_request", "Last support-contract invoice from the radio vendor", { ago: -35, assigneeId: felicity!.id, dueDate: date(-4), status: "done" });
  await item(src, "metric", "Devices in more than one sheet, disagreeing", { ago: -34, fields: { category: "performance", unit: "devices", direction: "down", baseline: 312, baselineDate: date(-34), target: 0, readings: [] } });
  const sA = await item(src, "option", "A. Clean up the sheets and lock them", { status: "proposed", ago: -22, fields: { pricing: "fixed", cost: "$2,400 fixed", hours: "about 18 hours", timeline: "2 weeks", why: "Quick relief; the sheets still drift.", costScore: 5, qualityScore: 2, effortScore: 5 } });
  const sB = await item(src, "option", "B. NetBox on AWS, fed by LibreNMS", { status: "proposed", ago: -22, fields: alignPrice({ pricing: "estimate" as const, rateCents: RATE, hoursLow: 60, hoursHigh: 78, timeline: "8 weeks", recommended: true, why: "Open source, owned by MATRIS, and fed by tools you already run.", outsideCosts: "About $40/mo to AWS, billed to you", costScore: 3, qualityScore: 5, effortScore: 3, result: "Disagreeing devices fall from 312 to 0.", purchases: [{ name: "Barcode labels and printer", why: "Tag devices without a readable asset tag", example: "Brother QL-820NWB", estimate: "$250", buyer: "client" as const }] }) });
  await item(src, "option", "C. The vendor's inventory module", { status: "declined", ago: -22, fields: { cost: "$900 fixed", outsideCosts: "$310/mo to the vendor", timeline: "3 weeks", why: "Least work, least control." } });
  await issueProposal(repo, t, src, { id: neon1.id, name: "neon1" }, "", new Date(day(-20)));
  // r2: B re-estimated after the sheets arrived late, so the revision shows an edited option
  const sB2: Item = { ...sB, fields: alignPrice({ ...(sB.fields as Parameters<typeof alignPrice>[0]), hoursLow: 64, hoursHigh: 80 }), version: sB.version + 1, updatedAt: day(-12) };
  await repo.saveItem(sB2, { version: sB.version });
  const r2 = await issueProposal(repo, t, src, { id: neon1.id, name: "neon1" }, "B re-estimated: the radio sheet had 180 more rows than expected.", new Date(day(-12)));
  // The reminder clock as the hourly pass leaves it after business days 3 and 7: reminded twice, neon1 told
  if (r2.issued) await repo.table.write([{ put: { PK: `T#${tid}`, SK: "REMIND#decisions", items: { [`choose:${r2.issued.id}`]: { since: day(-12), told: [felicity!.id], sent: 2, alerted: true } }, at: day(-3) }, guard: { always: true } }]);
  await comment(src, sB.id, felicity!, -11, "Can the $40 a month come out of the NOC budget instead of IT?");
  await comment(src, sB.id, neon1, -11, "Yes. It bills to whichever AWS account you pick; I'd tag it NOC.", 17);
  await comment(src, sB.id, neil!, -10, "NOC is fine. I want the LibreNMS feed before the radio import.");
  await comment(src, sA.id, jorgeus!, -9, "A is tempting for the board meeting, but it doesn't fix the drift.");
  await comment(src, srcFile.id, neon1, -8, "Still need the whiteboard sheet; a phone photo is fine.");

  // Quick fix: a quote waiting for approval, and one approved, done, paid by card
  const dozer0 = await project({ key: "DOZER-1", name: "Fix the status page DNS record", template: QUICK_FIX, stageId: "intake", health: "not_started", made: -3, people: [lead, dm] });
  await item(dozer0, "request", "status.matris.example shows the old host", { ago: -3, updatedBy: neil!.id });
  const dq = await item(dozer0, "option", "Point the record at the new status host", { status: "proposed", ago: -1, fields: { pricing: "fixed", cost: "$180 fixed", depositPercent: 0, recommended: true, timeline: "1 day" } });
  const dozer: Project = { ...dozer0, stageId: "decide", stageEnteredAt: day(-1), version: dozer0.version + 1, updatedAt: day(-1) };
  await issueProposal(repo, t, dozer, { id: neon1.id, name: "neon1" }, "", new Date(day(-1)), { items: [dq], ops: [repo.projectOp(dozer, { version: dozer0.version })] });
  projects["DOZER-1"] = dozer;

  const patch = await project({ key: "PATCH-1", name: "Renew the wildcard certificate", template: QUICK_FIX, stageId: "closed", health: "on_track", made: -30, moved: -26, people: [lead, dm] });
  const pd = await approve(patch, "Renew and automate the certificate", "Renew *.matris.example and set it to renew itself.", { pricing: "fixed", cost: "$240 fixed", depositPercent: 0, recommended: true, timeline: "1 day" }, felicity!, -29);
  await item(patch, "task", "Certificate renewed and auto-renewal on", { status: "done", ago: -28 });
  const pInv = await invoice(patch, 1, "final", finalLines(pd.d, []), -27);
  await pay(patch, pInv, -26, "card", "Stripe card ending 4242");

  // Build (board): approved, deposit paid, terms revised, invoice disputed, waiting on MATRIS
  const morph = await project({ key: "MORPH-1", name: "Billing on AWS, phase 2: self-service portal", stageId: "build", health: "at_risk", made: -60, moved: -30, lens: "board", targetDate: date(20),
    summary: "Customers call to change plans or update cards; Felicity's team retypes it into billing.", outcome: "Customers change their own plan and card, and billing reflects it within a minute.",
    people: [lead, dm, { userId: jorgeus!.id, role: "sponsor" }, { userId: lennon!.id, role: "tech_contact" }],
    waiting: { at: day(-4), by: neon1.id, name: "neon1", note: "", need: "A VPN account for the billing database, from Neil's team." } });
  const m1 = await approve(morph, "Self-service portal on the existing billing data", "Plan changes and card updates online, written straight to billing.", alignPrice({ pricing: "estimate" as const, rateCents: RATE, hoursLow: 70, hoursHigh: 90, depositPercent: 30, timeline: "8 weeks", recommended: true }), felicity!, -33);
  // Revised terms: a 20% deposit instead of 30%, approved again; the first decision is kept and superseded
  const rev = await item(morph, "option", "Self-service portal on the existing billing data (revised deposit)", { status: "approved", ago: -31, body: m1.opt.body, fields: { ...m1.opt.fields, depositPercent: 20, revises: m1.opt.id } });
  const terms2 = { title: rev.title, body: rev.body, ...rev.fields };
  const m2 = await item(morph, "decision", `Approved: ${rev.title}`, { status: "approved", ago: -31, fields: { optionId: rev.id, optionVersion: rev.version, approvedBy: felicity!.id, approvedAt: day(-31), conditions: "", terms: terms2, approverName: felicity!.name, approverEmail: felicity!.email, supersedes: [m1.d.id], reason: "Smaller deposit agreed with neon1 for this quarter's cash flow.", signature: signature("approval", "MORPH-1-A2", await sha256Hex(canonical(terms2)), { typedName: felicity!.name, consent: true }, { id: felicity!.id, name: felicity!.name, email: felicity!.email }, day(-31)) } });
  const mDep = await invoice(morph, 1, "deposit", depositLines(m2), -30);
  await pay(morph, mDep, -25, "ach", "Stripe bank transfer");
  const worked: [number, number, string][] = [[-28, 3, "Billing schema walkthrough with Lennon"], [-24, 4.5, "Plan-change screens"], [-21, 6, "Card update through Stripe Elements"], [-19, 2.25, "Load test on a copy"]];
  // Billed by the hour so far; the deposit counts against the final invoice
  const mProg = await invoice(morph, 2, "progress", worked.map(([, h, what]) => ({ text: what, qty: h, unitCents: RATE })), -18, { dispute: { by: felicity!.id, name: felicity!.name, at: day(-5), cents: 30_375, reason: "The load test hours look high for a copy of production." } });
  await hours(morph, worked, mProg.id);
  await hours(morph, [[-6, 2, "VPN request and firewall notes"], [-2, 1.5, "Waiting-on-access check-in with Neil"]]);
  const tasks: [string, string, User, number][] = [["Plan-change screens", "done", lennon!, -20], ["Card updates", "done", lennon!, -15], ["Write-back to billing database", "blocked", neon1, -3], ["Customer emails for changes", "doing", neon1, 5], ["Accessibility pass", "open", lennon!, 12], ["Launch to 50 pilot customers", "open", jorgeus!, 18]];
  let blocked: Item | undefined;
  for (const [s, st, u, due] of tasks) { const i = await item(morph, "task", s, { status: st, assigneeId: u.id, dueDate: date(due), ago: -27 }); if (st === "blocked") blocked = i; }
  await comment(morph, blocked!.id, neon1, -3, "Blocked on the VPN account; I can't reach the billing database without it.");
  await comment(morph, blocked!.id, neil!, -2, "Requested from our firewall vendor. Their SLA is 5 business days.");
  // Updates: messages to everyone on MORPH-1, one answered by replying to its email
  const message = async (p: Project, by: User, ago: number, body: string, hour: number, via?: "email") => {
    const at = day(ago, hour);
    const name = by.id === neon1.id ? "neon1" : by.name;
    await repo.table.write([repo.commentOp({ tenantId: tid, projectId: p.id, itemId: THREAD, id: idAt(at, "c"), at, authorId: by.id, authorName: name, body, ...(via ? { via } : {}) }),
      repo.auditOp({ tenantId: tid, actorId: by.id, action: "message.created", target: idAt(at, "c"), summary: `${p.key}: ${name} wrote: ${body.slice(0, 160)}` }, at)]);
  };
  await message(morph, neon1, -4, "Screens are ready for a look on staging. The write-back still needs the VPN account before the pilot.", 10);
  await message(morph, felicity!, -4, "Looks good. Can the plan-change screen say the new price before they confirm?", 16, "email");
  await message(morph, neon1, -3, "Yes, added. It shows the new monthly price and the date it starts.", 9);
  await item(morph, "milestone", "Pilot live for 50 customers", { dueDate: date(18), ago: -30 });
  await item(morph, "update", "Waiting on database access", { ago: -3, body: "Screens are done. The write-back waits on a VPN account; the pilot date holds if access arrives this week.", fields: { health: "at_risk" } });
  await item(morph, "change", "Add Spanish to customer screens", { ago: -8, body: "Felicity asked for Spanish. About 10 more hours; needs approval before work starts." });
  await item(morph, "signoff", "Card screens reviewed by the payments processor", { ago: -9 });
  // neon1 buys, awaiting MATRIS's initials (a decision); and one bought with its receipt
  await item(morph, "purchase", "Load-test credits", { ago: -7, status: "open", fields: { estimate: "$60", buyer: "neon1", vendor: "k6 Cloud", why: "Test 2,000 sessions before the pilot" } });
  const bought = await item(morph, "purchase", "Domain for the customer portal", { ago: -26, status: "done", fields: { estimate: "$15", actual: "$12.98", buyer: "neon1", vendor: "Route 53", agreed: { by: felicity!.id, name: felicity!.name, initials: "FTD", at: day(-27) } } });
  await doc({ projectId: morph.id, itemId: bought.id, layer: "execution", name: "route53-receipt.txt", contentType: "text/plain" }, -26, "Route 53 receipt\nmi-cuenta.matris.example\nUSD 12.98\n");
  await item(morph, "metric", "Plan changes handled by phone each week", { ago: -55, fields: { category: "adoption", unit: "calls", direction: "down", baseline: 140, baselineDate: date(-55), target: 30, readings: [] } });

  // Build (board) with every task status; the column is now over its WIP limit of 2
  const tank1 = await project({ key: "TANK-1", name: "Tower site access log", stageId: "build", health: "on_track", made: -35, moved: -14, lens: "board",
    summary: "Who opened which tower cabinet lives on paper in each truck.", outcome: "Every cabinet opening is logged with who, when, and why, from the lock itself.", people: [lead, { userId: neil!.id, role: "decision_maker" }, { userId: tank!.id, role: "stakeholder" }] });
  await approve(tank1, "Lock vendor's API into a shared log", "Pull openings from the lock vendor every 5 minutes into a log the NOC can search.", { pricing: "fixed", cost: "$3,100 fixed", timeline: "4 weeks", depositPercent: 0 }, neil!, -15);
  const board: [string, string, User, number][] = [["Lock vendor API key in MATRIS's name", "done", neil!, -12], ["Pull openings every 5 minutes", "done", neon1, -8], ["Search page for the NOC", "doing", neon1, 3], ["Reason codes with Tank's crew", "doing", lennon!, 4], ["Alert on openings without a work order", "open", neon1, 9], ["Retire the paper logbooks", "open", jorgeus!, 25], ["Cabinet MX-04 lock replaced", "blocked", neil!, -1]];
  for (const [s, st, u, due] of board) await item(tank1, "task", s, { status: st, assigneeId: u.id, dueDate: date(due), ago: -13 });

  // Paused: approved, then put on hold by MATRIS's budget freeze
  const cyph = await project({ key: "CYPH-1", name: "Payroll export cleanup", stageId: "build", health: "off_track", made: -70, moved: -50, people: [lead, dm],
    paused: { at: day(-21), by: neon1.id, name: "neon1", note: "MATRIS froze non-urgent spend until January.", reason: "waiting" } });
  const cd = await approve(cyph, "One export the payroll provider accepts", "Replace three hand-edited CSVs with one export.", { pricing: "fixed", cost: "$1,450 fixed", timeline: "2 weeks", depositPercent: 0 }, felicity!, -52);
  await item(cyph, "task", "Map the three CSVs to the provider's format", { status: "done", ago: -48 });
  await item(cyph, "task", "Test export with December payroll", { dueDate: date(-14), ago: -48 });
  // A draft invoice: written, never issued (clients never see drafts)
  await item(cyph, "invoice", "Invoice (draft)", { status: "draft", ago: -20, fields: InvoiceFields.parse({ type: "progress", lines: finalLines(cd.d, []) }) });

  // Timeline: dated milestones and tasks, some late, target date passed
  const apoc = await project({ key: "APOC-1", name: "Holiday change freeze", stageId: "build", health: "off_track", made: -28, moved: -20, lens: "timeline", targetDate: date(-2),
    summary: "No network changes from Dec 15 to Jan 6, with a clear exception path.", outcome: "The freeze holds with zero unplanned outages, and every exception is approved in writing.", people: [lead, { userId: jorgeus!.id, role: "decision_maker" }] });
  await approve(apoc, "Freeze calendar and exception form", "A shared freeze calendar, an exception form, and an on-call rota.", { pricing: "fixed", cost: "$950 fixed", timeline: "3 weeks", depositPercent: 0 }, jorgeus!, -21);
  for (const [s, st, start, due] of [["Freeze calendar published", "done", -20, -15], ["Exception form live", "done", -15, -9], ["On-call rota agreed", "doing", -10, -2], ["Vendor notices sent", "open", -5, 3], ["Freeze starts", "open", 10, 19]] as const) {
    await item(apoc, start > 0 ? "milestone" : "task", s, { status: st, dueDate: date(due), ago: Math.min(start, -1) });
  }

  // Verify: measures with readings past their targets, checks, an incident
  const sent = await project({ key: "SENT-1", name: "Backups that restore for the NOC", stageId: "verify", health: "on_track", made: -90, moved: -10,
    summary: "NOC configs and LibreNMS were backed up nightly and never restored.", outcome: "A restore of last night's backup runs every week without anyone starting it.", people: [lead, { userId: neil!.id, role: "decision_maker" }] });
  await approve(sent, "Weekly restore tests", "Weekly restore of last night's backup to a test machine, with alerts.", alignPrice({ pricing: "estimate" as const, rateCents: RATE, hoursLow: 14, hoursHigh: 18, timeline: "4 weeks" }), neil!, -80);
  await item(sent, "metric", "Days since the last successful restore", { ago: -85, fields: { category: "reliability", unit: "days", direction: "down", baseline: 700, baselineDate: date(-85), target: 7, readings: [{ at: date(-40), value: 30, note: "" }, { at: date(-20), value: 7, note: "" }, { at: date(-6), value: 6, note: "on its own" }] } });
  await item(sent, "metric", "Minutes to restore LibreNMS", { ago: -85, fields: { category: "reliability", unit: "minutes", direction: "down", baseline: 240, target: 30, readings: [{ at: date(-6), value: 22, note: "" }] } });
  await item(sent, "check", "Restore runs four weeks in a row", { status: "done", ago: -9 });
  await item(sent, "check", "Failure alert reaches the NOC phone", { status: "blocked", ago: -9, body: "The pager integration is waiting on the NOC's new number." });
  await item(sent, "incident", "Restore failed on the test machine: disk full", { status: "done", ago: -18, body: "Test disk grew past 80 GB; old restores now clean up after themselves." });
  await doc({ projectId: sent.id, layer: "observation", name: "restore-test-log.txt", contentType: "text/plain" }, -6, "Restore log\nweek 1 OK 21m\nweek 2 OK 23m\nweek 3 FAIL disk\nweek 4 OK 22m\n");

  // Custom stage (Security review): an open incident, off track
  const pen = await project({ key: "AUDIT-1", name: "Penetration test findings", stageId: "secreview", health: "off_track", made: -50, moved: -7,
    summary: "An outside pen test found 11 issues on the customer portal.", outcome: "Every finding fixed or accepted in writing by Jorgeus.", people: [lead, { userId: jorgeus!.id, role: "decision_maker" }] });
  await approve(pen, "Fix the findings in order of risk", "Fix the high and medium findings; write up the rest for a decision.", alignPrice({ pricing: "estimate" as const, rateCents: RATE, hoursLow: 16, hoursHigh: 24, timeline: "3 weeks" }), jorgeus!, -45);
  await item(pen, "incident", "Finding 3: admin page reachable without VPN", { status: "doing", ago: -7 });
  await item(pen, "check", "Retest by the outside firm", { dueDate: date(10), ago: -7 });

  // Hand over: every step done, acceptance not given (a decision waiting on MATRIS)
  const link = await project({ key: "LINK-1", name: "Customer portal uptime monitoring", stageId: "handover", health: "on_track", made: -75, moved: -4,
    summary: "MATRIS learned about portal outages from customers.", outcome: "The NOC hears about a portal outage within two minutes, before customers do.", people: [lead, { userId: neil!.id, role: "decision_maker" }],
    handover: { at: day(-4), by: neon1.id, name: "neon1", note: "Delivered; the 30-day fix period runs from today." } });
  await approve(link, "Uptime checks with alerts to the NOC", "Checks every minute from three regions, alerting the NOC's phone.", { pricing: "fixed", cost: "$1,900 fixed", timeline: "3 weeks", depositPercent: 30 }, neil!, -60);
  for (const s of ["Alert rota set up with Neil's team", "Runbook: what to do when the alert fires", "Accounts moved to MATRIS's AWS"]) await item(link, "handoff", s, { status: "done", ago: -5 });
  await item(link, "runbook", "When the portal check fires", { status: "done", ago: -6 });
  await item(link, "training", "Walkthrough recorded for the night shift", { status: "done", ago: -5 });

  // =================================================================================
  // Workbench (one shared page): one beginning, one finished
  // =================================================================================
  const note = await project({ key: "NOTE-1", name: "Field crew onboarding guide", workflow: "bench", lens: "page", stageId: "build", health: "on_track", made: -9, people: [lead, { userId: lennon!.id, role: "tech_contact" }] });
  await page(note.id, "main", note.name, [h2("First day"), bullets(["Truck, phone, and badge from Tank", "Sign in to dispatch (KEY-1 has the one-login plan)", "Shadow a tower climb"]), h2("First week"), todo([["Safety course booked", true], ["Lock vendor app installed", false], ["Ride along on an outage", false]])], lennon!, -1,
    "First day\nTruck, phone, and badge from Tank\nSign in to dispatch (KEY-1 has the one-login plan)\nShadow a tower climb\nFirst week\n[x] Safety course booked\n[ ] Lock vendor app installed\n[ ] Ride along on an outage");
  const mouse = await project({ key: "MOUSE-1", name: "Office Wi-Fi refresh", workflow: "bench", lens: "page", stageId: "closed", health: "on_track", made: -120, moved: -95, people: [lead] });
  await page(mouse.id, "main", mouse.name, [para("Three access points replaced and the guest network split from staff."), todo([["Order access points", true], ["Install after hours", true], ["Guest network on its own VLAN", true]])], neil!, -95,
    "Three access points replaced and the guest network split from staff.\n[x] Order access points\n[x] Install after hours\n[x] Guest network on its own VLAN");

  // Contract states and housekeeping: ended by notice, archived, and one in Trash
  const ivr = await project({ key: "IVR-1", name: "Call center phone menu", stageId: "build", health: "off_track", made: -150, moved: -120, people: [lead],
    ended: { at: day(-100), by: neon1.id, name: "neon1", note: "MATRIS moved its call center to the vendor's managed plan.", reason: "notice" } });
  await item(ivr, "task", "Menu tree drafted", { status: "done", ago: -125 });
  await project({ key: "IDEA-1", name: "Drone tower inspections", stageId: "parked", health: "not_started", made: -200, archived: true, summary: "Parked until the drone waiver question is settled." });
  await project({ key: "KEY-2", name: "One sign-in (duplicate)", stageId: "intake", health: "not_started", made: -19, deletedAt: day(-17), summary: "Made twice by accident; KEY-1 is the real one." });

  // =================================================================================
  // Pages, files, calendar
  // =================================================================================
  await page(undefined, idAt(day(-60), "pg"), "MATRIS operating handbook", [h2("Who decides"), bullets(["Spend over $1,000: Felicity", "Network changes: Neil", "Everything else: Jorgeus"]), h2("Change freeze"), para("No network changes Dec 15 to Jan 6 without an approved exception (APOC-1).")], jorgeus!, -3,
    "Who decides\nSpend over $1,000: Felicity\nNetwork changes: Neil\nEverything else: Jorgeus\nChange freeze\nNo network changes Dec 15 to Jan 6 without an approved exception (APOC-1).");
  await page(src.id, "main", src.name, [h2("Questions for the decision"), bullets(["Which AWS account pays for NetBox?", "Who owns the radio import?"])], felicity!, -10,
    "Questions for the decision\nWhich AWS account pays for NetBox?\nWho owns the radio import?");
  await doc({ name: "MATRIS network map.pdf", contentType: "application/pdf", updatedBy: neil!.id }, -40, MINI_PDF);
  await doc({ projectId: src.id, itemId: srcInv.id, name: "radio-vendor-invoice.txt", contentType: "text/plain", updatedBy: felicity!.id }, -5, "Radio vendor support contract\nRenewal invoice\n");
  await doc({ projectId: key.id, layer: "needs", name: "tool-list.txt", contentType: "text/plain", updatedBy: lennon!.id, needsApproval: true }, -11, "dispatch\nwork orders\nlock vendor\nworkspace\n");
  // Files in each problem state: rejected by the scan, failed size check, still checking
  await doc({ projectId: key.id, name: "crew-roster.xlsm", contentType: "application/vnd.ms-excel.sheet.macroEnabled.12", scan: "infected", state: "rejected", updatedBy: sirus!.id }, -20);
  await doc({ projectId: morph.id, name: "billing-schema.sql", contentType: "application/sql", state: "failed", problem: "size_mismatch", updatedBy: lennon!.id }, -9);
  await doc({ name: "tower-photos.zip", contentType: "application/zip", scan: "pending", state: "checking", updatedBy: neil!.id }, 0);
  await cal({ title: "Neil on leave", kind: "leave", personId: neil!.id, date: date(4), endDate: date(8) });
  await cal({ title: "Office closed: Día de la Revolución", kind: "office", date: date(12) });
  await cal({ title: "Board meeting: inventory decision", kind: "meeting", date: date(6), time: "10:00", projectId: src.id });
  await cal({ title: "ORA-1 monthly care call", kind: "care", date: date(-20), time: "16:00", repeat: "monthly", projectId: ora.id });
  await cal({ title: "NOC stand-up", kind: "meeting", date: date(-30), time: "09:00", repeat: "weekly", until: date(60) });

  // =================================================================================
  // Chat: the whole team, a private thread, an edit, flags, a pause
  // =================================================================================
  const msgs: ChatMessage[] = [];
  const say = (ago: number, hour: number, u: User, body: string, extra: Partial<ChatMessage> = {}) => {
    const at = day(ago, hour);
    msgs.push({ id: idAt(at, "m"), at, authorId: u.id, authorName: u.id === neon1.id ? "neon1" : u.name, from: u.id === neon1.id ? "neon1" : "member", body, version: 1, ...extra });
  };
  say(-44, 16, jorgeus!, "We're back! Agreement signed. Where do we start, inventory or billing phase 2?");
  say(-44, 17, neon1, "Welcome back. Billing phase 2 first: it pays for itself. Inventory proposal next week.");
  say(-20, 15, neil!, "Proposal for SRC-1 is in. Felicity has the final call.", { editedAt: day(-20, 16), history: [{ at: day(-20, 15), body: "Proposal for SRC-1 is in. Felicity decides." }] });
  say(-12, 18, felicity!, "Got r2. I'll take it to the board on the 6th.");
  say(-6, 14, neon1, "Before the board: the price on r2 holds for 30 days from issue.", { privateWith: felicity!.id });
  say(-6, 15, felicity!, "Understood, thank you.", { privateWith: felicity!.id });
  say(-4, 13, sirus!, "free tower tools here http://bit.example/x http://bit.example/y", { flags: ["links"] });
  say(-3, 13, sirus!, "this portal is garbage and so is whoever built it", { flags: ["offensive", "reported"], reports: [neil!.id] });
  say(-2, 10, neil!, "Reported Sirus's message. The VPN request is with our firewall vendor.");
  say(-1, 9, lennon!, "Plan-change screens look great on my phone. Spanish next?");
  for (const m of msgs) await repo.table.write([{ put: { PK: `CHAT#${tid}`, SK: `MSG#${m.id}`, type: "chat-message", ...m }, guard: { create: true } }]);
  const last = msgs.at(-1)!;
  const thread: ChatThread = { tenantId: tid, orgName: t.name, orgSlug: t.slug, free: false, startedAt: msgs[0]!.at, lastAt: last.at, lastId: last.id, lastBy: last.authorName, lastFrom: last.from, preview: last.body.slice(0, 120), ownerUnread: 2, ownerSeenAt: day(-2, 11), ownerFlagged: 1, version: 1 };
  await repo.table.write(repo.chatOps(thread, undefined, undefined));
  for (const [u, ago] of [[jorgeus!, -1], [neil!, -1], [felicity!, -5], [lennon!, -1]] as const) await repo.table.write([repo.chatSeenOp(tid, { userId: u.id, at: day(ago, 12) })]);
  // Sirus: paused by the automatic guard a third time in 30 days, so the account is suspended for abuse
  const mute: ChatBlock = { userId: sirus!.id, state: "muted", until: day(5), reason: "offensive", by: "auto", at: day(-3, 13) };
  await repo.table.write([repo.chatBlockOp(tid, mute), { put: { PK: "COUNTER", SK: `ABUSE#${tid}#${sirus!.id}`, n: 3, ttl: Math.floor(Date.now() / 1000) + 27 * 86_400 }, guard: { always: true } }]);
  await audit(day(-2), neon1.id, "account.suspended", sirus!.id, `${sirus!.name} suspended automatically: third chat pause in 30 days`);
  // Recommission: Sirus asks to be let back (open), and an earlier ask from Lennon that super dismissed
  const ask = (id: string, by: User, reason: string, at: string, state: "open" | "dismissed", closedAt?: string) =>
    ({ put: { PK: "RECOMMISSION", SK: `${tid}#${id}`, id, tenantId: tid, orgName: t.name, scope: "account", userId: sirus!.id, userName: sirus!.name, by: by.id, byName: by.name, reason, at, state, ...(closedAt ? { closedAt } : {}) }, guard: { always: true } as const });
  await repo.table.write([
    ask(idAt(day(-1), "r"), sirus!, "I was angry about a late invoice. It won't happen again; I need the tower logs for my shift.", day(-1), "open"),
    ask(idAt(day(-2), "r"), lennon!, "Sirus covers night shifts and needs read access.", day(-2, 9), "dismissed", day(-2, 12)),
  ]);
  await audit(day(-1), sirus!.id, "recommission.requested", sirus!.id, `${sirus!.name} asked to be recommissioned`);

  // =================================================================================
  // Home: Jorgeus's own arrangement (hidden cards, moved and resized, both widths); Felicity's trimmed
  // =================================================================================
  const home: HomeLayout = {
    hidden: ["guide", "links", "pace"],
    shown: ["health", "delivery"],
    wide: [{ id: "needs", x: 0, y: 0, w: 8, h: 6 }, { id: "late", x: 8, y: 0, w: 4, h: 6 }, { id: "health", x: 0, y: 6, w: 4, h: 5 }, { id: "delivery", x: 4, y: 6, w: 4, h: 5 }, { id: "coming", x: 8, y: 6, w: 4, h: 10 }, { id: "glance", x: 0, y: 11, w: 8, h: 5 }],
    narrow: [{ id: "late", x: 0, y: 0, w: 4, h: 7 }, { id: "needs", x: 0, y: 7, w: 4, h: 8 }],
  };
  const layouts: [User, HomeLayout][] = [[jorgeus!, home], [felicity!, { hidden: ["stats", "layers", "glance"] }]];
  for (const [u, layout] of layouts) {
    const x = (await repo.getUser(u.id))!;
    await repo.saveUser({ ...x, home: { ...(x.home ?? {}), [tid]: layout }, version: x.version + 1 }, x.version);
  }

  await audit(day(-1), jorgeus!.id, "stages.updated", tid, "Changed the board", ["Listen → Discover", "Security review added", "Parked hidden", "Build WIP 3 → 2", "Verify WIP none → 1"]);
  return { tenant: t, people: who, neon1, pradeep, projects, files };
}


// The smallest valid one-page PDF, so "open" shows a real document
const MINI_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 58>>stream
BT /F1 18 Tf 24 70 Td (MATRIS network map, Meta City) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;
