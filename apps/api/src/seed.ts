// apps/api/src/seed.ts - Demo data for local development and screenshots: neon1 itself, two sample
// clients, and one prospect that signed itself up.


import { AGREEMENT_EDITION, AGREEMENT_TEXT, CalEvent, InvoiceFields, alignPrice, assessed, canonical, depositLines, finalLines, invoiceNumber, invoiceTotal, DEFAULT_STAGES, Item, formatClientId, formatProspectId, PORTAL_TERMS_EDITION, newId, rankBetween, sha256Hex, signature, type Member, type Project, type Tenant, type User } from "@1neon/domain";
import type { Repo } from "./store/repo.ts";
import { issueProposal } from "./proposals.ts";


// A made-up hourly rate for the demo's estimates. It is not neon1's rate, and the pages never print it
const RATE_CENTS = 12_000;

// ISO timestamp `offset` days from now, so demo data always looks recent
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();


/** Fill an empty store with demo people, organizations, and projects. Returns them for tests */
export async function seed(repo: Repo, operatorEmail = "pradeep@neon1.tech") {
  const t0 = day(-30);
  // A demo person; `strong` stands in for a passkey or authenticator app
  const user = (email: string, name: string, title: string, strong = false): User => ({
    id: newId("u"), email, name, title, phone: "", operator: false, strongAuth: strong, theme: "awake", menu: "default", version: 1, createdAt: t0, updatedAt: t0, updatedBy: "seed",
  });
  // People: the operator, an Harborline admin and editor, and a Ridgeview contact who hasn't joined yet
  const pradeep = user(operatorEmail, "Pradeep", "Lead engineer", true);
  const dana = user("tomas@harborlineoutfitters.example", "Tomas Greer", "Inventory lead");
  const raj = user("priya@harborlineoutfitters.example", "Priya Raman", "Operations director", true);
  const lee = user("lee@ridgeviewauto.example", "Lee Moreno", "Operations lead");
  for (const u of [pradeep, dana, raj, lee]) await repo.createUser(u);

  // Organizations: neon1 itself (N1-0001) and two sample clients
  // Each with where it's based (and neon1 with its real site), as sign-up and Settings ask for
  const org = async (name: string, slug: string, face: Pick<Tenant, "place" | "link">): Promise<Tenant> => {
    const n = await repo.nextClientNumber();
    const t: Tenant = { id: newId("t"), slug, clientId: formatClientId(n), name, ...face, status: "active", stages: DEFAULT_STAGES, version: 1, createdAt: t0, updatedAt: t0, updatedBy: pradeep.id };
    await repo.createTenant(t);
    return t;
  };
  const neon1 = await org("neon1", "neon1", { place: "Albany, NY", link: "https://neon1.tech/" });
  const acme = await org("Harborline Outfitters", "harborline-outfitters", { place: "Kingston, NY" });
  const harbor = await org("Ridgeview Auto Group", "ridgeview-auto", { place: "Long Beach, NY" });

  // Memberships, including one still invited
  const member = async (t: Tenant, u: User, access: Member["access"], status: Member["status"] = "joined") => {
    const m: Member = { tenantId: t.id, userId: u.id, email: u.email, name: u.name, title: u.title, access, status, invitedBy: pradeep.id, invitedAt: t0, joinedAt: status === "joined" ? day(-20) : undefined, lastSeenAt: status === "joined" ? day(-1) : undefined, version: 1, createdAt: t0, updatedAt: t0, updatedBy: pradeep.id };
    await repo.saveMember(m, { create: true });
  };
  await member(neon1, pradeep, "admin");
  await member(acme, pradeep, "admin");
  await member(acme, raj, "admin");
  await member(acme, dana, "editor");
  await member(harbor, pradeep, "admin");
  await member(harbor, lee, "admin", "invited");

  // Harborline signed neon1's service agreement when it became a client; Ridgeview hasn't yet
  const signedAcme: Tenant = { ...acme, agreements: [signature("agreement", AGREEMENT_EDITION, await sha256Hex(AGREEMENT_TEXT), { typedName: raj.name, consent: true }, { id: raj.id, name: raj.name, email: raj.email }, day(-21))], version: acme.version + 1 };
  await repo.saveTenant(signedAcme, acme.version);
  Object.assign(acme, signedAcme);

  let rank = "";
  // Project and item helpers with ranks appended in creation order
  const project = async (t: Tenant, key: string, name: string, stageId: string, health: Project["health"], summary: string, people: Project["people"], daysInStage: number, assessedDaysAgo = daysInStage, outcome = "") => {
    rank = rankBetween(rank, "");
    // Made about four days before each stage it has passed, so the activity record reads in order
    const made = day(-Math.min(30, daysInStage + 4 * Math.max(0, DEFAULT_STAGES.findIndex((g) => g.id === stageId))));
    const p: Project = { tenantId: t.id, id: newId("p"), key, name, summary, outcome, template: "blank", stageId, stageEnteredAt: day(-daysInStage), health, rank, people, flags: [], archived: false, version: 1, createdAt: made, updatedAt: day(-daysInStage), updatedBy: pradeep.id, targetDate: day(30).slice(0, 10), ...assessed(health, pradeep.id, day(-assessedDaysAgo)) };
    await repo.saveProject(p, { create: true });
    await repo.table.write([repo.auditOp({ tenantId: t.id, actorId: pradeep.id, action: "project.created", target: p.id, summary: `Created ${key} ${name}` }, made)]);
    return p;
  };
  let irank = "";
  // A layer item ranked after the last one, so items appear in creation order
  const item = async (p: Project, kind: Item["kind"], title: string, extra: Partial<Item> = {}) => {
    irank = rankBetween(irank, "");
    const i = Item.parse({ tenantId: p.tenantId, projectId: p.id, id: newId("i"), kind, title, body: "", status: "open", rank: irank, fields: {}, version: 1, createdAt: t0, updatedAt: t0, updatedBy: pradeep.id, ...extra });
    // Seeded work that starts done was completed when it was made
    if (i.status === "done") i.completedAt = t0;
    await repo.saveItem(i, { create: true });
    return i;
  };

  // A project already approved: one option and the decision that signed it, so it reads as past Ready for Execute
  const approve = async (p: Project, title: string, body: string, by: User, ago: number) => {
    const o = await item(p, "option", title, { status: "approved", body, fields: { pricing: "fixed", cost: "Agreed", timeline: "4 weeks" }, createdAt: day(-ago - 2), updatedAt: day(-ago) });
    await item(p, "decision", `Approved: ${o.title}`, { status: "approved", fields: { optionId: o.id, optionVersion: o.version, approvedBy: by.id, approvedAt: day(-ago), conditions: "", terms: { title: o.title, body: o.body }, approverName: by.name, approverEmail: by.email }, createdAt: day(-ago), updatedAt: day(-ago) });
  };

  // Harborline: a project at Decide with three options to approve, and measures with baselines
  const intake = await project(acme, "FLOW-1", "Stock reconciliation and exception monitoring", "decide", "on_track", "Each store's POS, the web store, and the warehouse keep their own count, and they drift. Tomas reconciles them by hand every Monday.", [{ userId: pradeep.id, role: "lead_engineer" }, { userId: raj.id, role: "decision_maker" }, { userId: dana.id, role: "tech_contact" }], 4, 4, "Every morning by 7 am, one short list shows which counts disagree and why, without replacing a system.");
  await item(intake, "discovery", "One real example of how it works today", { status: "done", body: "Last Saturday the web store sold four Ridgeline shells in large that the Kingston POS had already sold. Tomas found out Monday, from the customers." });
  await item(intake, "discovery", "Who does this work, and which tools does it touch?", { status: "done", body: "Tomas reconciles the counts by hand. They live in each store's POS, the web store, and the warehouse partner's portal." });
  await item(intake, "requirement", "A list of differences every morning by 7 am. Nothing is retyped", { fields: { priority: "must" } });
  await item(intake, "requirement", "Store leads need no new tool for daily work", { fields: { priority: "should" } });
  // Illustrative figures. A is an hourly estimate and B a fixed price, so the demo shows both kinds,
  // each with the hours behind it
  await item(intake, "option", "A. Tidy the Monday count: a checklist and a shared sheet", { status: "proposed", body: "Fastest, cheapest. Keeps the hand count as the system.", fields: alignPrice({ pricing: "estimate" as const, rateCents: RATE_CENTS, hoursLow: 5, hoursHigh: 7, basis: [{ work: "A shared sheet with one row per item and one column per system", hours: 2 }, { work: "A checklist for the usual causes: returns, transfers, late receiving", hours: 1.5 }, { work: "A one-page Monday routine for the store leads", hours: 1 }, { work: "Walkthrough with Tomas, and a week of adjustments", hours: 1.5 }], why: "Pick this for relief this week. The count is still done by hand, so it doesn't meet the first requirement.", costScore: 5, qualityScore: 2, effortScore: 5, timeline: "1 week", recommended: false }) });
  await item(intake, "option", "B. Morning exception report on AWS", { status: "proposed", body: "Compares the counts every night and emails a short list by 7 am, each with a likely reason. Runs in your AWS account.", fields: { cost: "$4,500 fixed", hours: "about 36 hours", pricing: "fixed", basis: [{ work: "Item matching across the POS, web store, and warehouse file", hours: 9 }, { work: "Nightly comparison and the exceptions sheet", hours: 7 }, { work: "Your AWS account set up: sign-in, encryption, and backups", hours: 6 }, { work: "Reasons for differences and the 7 am email", hours: 7 }, { work: "A dry run on a week of real exports, beside Tomas's Monday count", hours: 4 }, { work: "Runbook and a walkthrough for the store leads", hours: 3 }], why: "It's the only option that meets both requirements, and the scope is clear enough for a fixed price: the price changes only if you approve a change to the work.", outsideCosts: "About $15/mo to AWS, billed to you", result: "Counts are compared every morning, and unexplained differences fall from about 38 a week to 5 or fewer.", costScore: 3, qualityScore: 5, effortScore: 3, timeline: "4 weeks", recommended: true, purchases: [{ name: "Handheld scanner for the stock room", why: "Items with no UPC on file get one scanned in", example: "Zebra TC22 or similar", estimate: "$400-$500", buyer: "client" }] } });
  await item(intake, "option", "C. The web store's own stock-sync add-on", { status: "proposed", body: "Vendor module. Less control, monthly fee.", fields: { cost: "$750 fixed", hours: "about 6 hours", why: "Pick this if you'd rather have the vendor run it. You pay them each month, and the module decides what you can change.", outsideCosts: "$240/mo to the vendor", costScore: 3, qualityScore: 3, effortScore: 4, timeline: "2 weeks", recommended: false } });
  await item(intake, "metric", "Items whose counts disagree, each week", { fields: { category: "performance", unit: "items", direction: "down", baseline: 38, baselineDate: day(-25).slice(0, 10), target: 5, readings: [] } });
  await item(intake, "metric", "Oversold web orders each month", { fields: { category: "performance", unit: "orders", direction: "down", baseline: 11, baselineDate: day(-25).slice(0, 10), target: 1, readings: [] } });
  await item(intake, "file_request", "A week of stock exports from each system, item names only", { assigneeId: dana.id, dueDate: day(-2).slice(0, 10) });
  await item(intake, "handoff", "Accounts are in the client's name", { dueDate: day(20).slice(0, 10) });
  await item(intake, "constraint", "No changes to checkout in the holiday weeks", { body: "Anything that touches the web store's checkout waits until the holiday weeks are over." });
  // The proposal as neon1 issued it, so its options can be approved (Proposal 0039 r1)
  await issueProposal(repo, acme, intake, { id: pradeep.id, name: pradeep.name }, "", new Date(intake.stageEnteredAt));

  // Harborline: work in progress, at risk
  const backup = await project(acme, "SEC-1", "Backups that restore", "build", "at_risk", "Nightly backups exist but have never been restored.", [{ userId: pradeep.id, role: "lead_engineer" }, { userId: dana.id, role: "tech_contact" }], 9, 0, "Last night's backup restores to a test machine every week, without anyone starting it, and Tomas hears when one fails.");
  await item(backup, "discovery", "One real example of how it works today", { status: "done", body: "Last spring a drive failed. The nightly backup had been running for years, but nobody could say whether it would restore, so the stores rebuilt from paper and email for two days." });
  await item(backup, "discovery", "Who does this work, and which tools does it touch?", { status: "done", body: "Tomas checks the backup report each Monday. It touches the back-office server, the database export, and the vendor's backup service." });
  await item(backup, "task", "Inventory what's backed up today", { status: "done" });
  await item(backup, "task", "Restore last night's backup to a test machine", { status: "doing", assigneeId: pradeep.id, dueDate: day(3).slice(0, 10) });
  await item(backup, "milestone", "Weekly restore test running on its own", { dueDate: day(12).slice(0, 10) });
  await item(backup, "update", "Restore test blocked on vendor login", { body: "The files restored. The database export needs a login only the vendor can issue. I called their support today and expect it this week.", fields: { health: "at_risk" }, createdAt: day(0), updatedAt: day(0) });
  await item(backup, "metric", "Days since last successful restore test", { fields: { category: "reliability", unit: "days", direction: "down", baseline: 900, target: 30, readings: [{ at: day(-2).slice(0, 10), value: 900, note: "" }] } });

  // What Priya approved for it: an hourly estimate, so its hours and invoices can be followed in Execute
  const restore = await item(backup, "option", "Restore tests that run on their own", { status: "approved", body: "A restore of last night's backup to a test machine every week, with a note to Tomas when one fails.", fields: alignPrice({ pricing: "estimate" as const, rateCents: RATE_CENTS, hoursLow: 12, hoursHigh: 16, basis: [{ work: "Inventory of what's backed up, and what isn't", hours: 2.5 }, { work: "Test machine and a first restore by hand", hours: 5 }, { work: "The weekly restore test, running on its own", hours: 4 }, { work: "Failure notes to Tomas, and a runbook", hours: 2.5 }], why: "A backup is only proven by restoring it. The hours depend on the vendor's export, so this is an estimate with a ceiling.", timeline: "3 weeks", result: "Last night's backup restores to a test machine every week, without anyone starting it.", costScore: 4, qualityScore: 4, effortScore: 4, recommended: true }), createdAt: day(-11), updatedAt: day(-9) });
  const agreed = await item(backup, "decision", `Approved: ${restore.title}`, { status: "approved", fields: { optionId: restore.id, optionVersion: restore.version, approvedBy: raj.id, approvedAt: day(-9), conditions: "", terms: { title: restore.title, body: restore.body, ...restore.fields }, approverName: raj.name, approverEmail: raj.email }, createdAt: day(-9), updatedAt: day(-9) });

  // Its billing so far: the deposit, paid by bank transfer, and a progress invoice that's open
  const invoice = async (seq: number, type: "deposit" | "progress", lines: InvoiceFields["lines"], issued: number) => {
    const f = InvoiceFields.parse({ type, lines, number: invoiceNumber(backup.key, seq), issuedAt: day(issued), issuedBy: pradeep.id, dueDate: day(issued + 15).slice(0, 10), billTo: { org: acme.name, name: raj.name, email: raj.email } });
    f.hash = await sha256Hex(canonical({ ...f, hash: undefined, total: invoiceTotal(f) }));
    return item(backup, "invoice", `Invoice ${f.number}`, { status: "issued", fields: f, createdAt: day(issued), updatedAt: day(issued) });
  };
  const deposit = await invoice(1, "deposit", depositLines(agreed), -8);
  await item(backup, "payment", `Payment on ${String(deposit.fields.number)}`, { status: "done", fields: { invoiceId: deposit.id, amountCents: invoiceTotal(InvoiceFields.parse(deposit.fields)), method: "ach", ref: "Stripe bank transfer", receivedAt: day(-3).slice(0, 10), recordedBy: pradeep.id }, createdAt: day(-3), updatedAt: day(-3) });
  // The hours behind the progress invoice, each marked with it, and one logged since
  const worked = [{ ago: 7, hours: 2.5, what: "Inventory of what's backed up, and what isn't" }, { ago: 5, hours: 3, what: "Test machine set up, and the backup tool installed" }, { ago: 2, hours: 2, what: "First restore by hand: files came back, the database needs the vendor's login" }];
  const sofar = worked.map((w, n) => ({ id: `h${n}`, kind: "time", status: "done", fields: { hours: w.hours } }));
  const progress = await invoice(2, "progress", finalLines(agreed, [deposit, ...sofar]), -1);
  for (const w of worked) await item(backup, "time", w.what, { status: "done", fields: { date: day(-w.ago).slice(0, 10), hours: w.hours, invoiceId: progress.id }, createdAt: day(-w.ago), updatedAt: day(-1) });
  await item(backup, "time", "Call with the vendor's support about the database login", { status: "done", fields: { date: day(0).slice(0, 10), hours: 1 }, createdAt: day(0), updatedAt: day(0) });

  const ask = await project(acme, "AI-1", "Answers from our own policies", "listen", "not_started", "Staff interrupt Priya for policy questions: time off, returns and exchanges, and what to tell customers about backorders.", [{ userId: pradeep.id, role: "lead_engineer" }], 2, 2, "Staff find an answer in our own policies without interrupting Priya, and can see which policy it came from.");
  // Outlined, not complete: what it is, how it works today, and what done looks like are written; who it touches, a measure, and the limits are still open
  await item(ask, "discovery", "One real example of how it works today", { status: "done", body: "A new cashier asked whether she could swap a shift. Priya was with a vendor, so she waited an hour and then asked Tomas, who wasn't sure either." });
  // Harbor: a migration in Verify with real readings, plus a new intake
  const mig = await project(harbor, "MIG-1", "Two offices off local servers", "verify", "on_track", "The application, database, and files lived on two local servers.", [{ userId: pradeep.id, role: "lead_engineer" }, { userId: lee.id, role: "tech_contact" }], 6, 6, "Both offices run from AWS, the local servers are retired, and the monthly infrastructure cost is under $600.");
  await item(mig, "discovery", "One real example of how it works today", { status: "done", body: "In March the Long Beach server's disk filled overnight. The service desk couldn't open the shared drive until Lee drove in at 7 am and cleared it by hand." });
  await item(mig, "discovery", "Who does this work, and which tools does it touch?", { status: "done", body: "Lee runs both offices' servers. They hold the dealer management database, the shared drives, and the nightly tape backup." });
  await approve(mig, "Move both offices to AWS", "The application, database, and shared files move to AWS, with the local servers retired after a month of overlap.", pradeep, 12);
  await item(mig, "metric", "Monthly infrastructure cost", { fields: { category: "cost", unit: "$", direction: "down", baseline: 1450, target: 600, readings: [{ at: day(-20).slice(0, 10), value: 1450, note: "" }, { at: day(-5).slice(0, 10), value: 690, note: "first full month on AWS" }] } });
  await item(mig, "check", "Backups restored once as a test", { status: "done" });
  await project(harbor, "NET-1", "Guest Wi-Fi separated from the shop network", "intake", "not_started", "", [], 1);
  const portal = await project(neon1, "PRJ-1", "Build 1NEON", "build", "on_track", "The neon1 client portal, built in the open with ourselves as the first client.", [{ userId: pradeep.id, role: "lead_engineer" }], 1, 1, "Clients write what they need, approve a priced option, and follow the work in one place.");
  await item(portal, "discovery", "One real example of how it works today", { status: "done", body: "A client's request arrives as an email thread, the estimate as a PDF, and the approval as a reply, so nobody can say later what was agreed." });
  await item(portal, "discovery", "Who does this work, and which tools does it touch?", { status: "done", body: "Pradeep does it today, across email, a spreadsheet, and the invoicing tool. Clients are small teams with no portal of their own." });
  await item(portal, "metric", "Requests with an unclear scope at estimate time", { fields: { category: "performance", unit: "%", direction: "down", baseline: 40, target: 10, readings: [] } });
  await approve(portal, "Build the portal in the open", "One portal for needs, execution, measures, and handover, built with neon1 as its first client.", pradeep, 20);

  // Harborline's own calendar: Tomas's days off, an office closure, and the care plan's monthly check-in
  const cal = async (t: Tenant, e: Partial<CalEvent> & Pick<CalEvent, "title" | "kind" | "date">) => {
    const ev = CalEvent.parse({ tenantId: t.id, id: newId("e"), repeat: "none", notes: "", version: 1, createdAt: t0, updatedAt: t0, updatedBy: pradeep.id, ...e });
    await repo.table.write([repo.calEventOp(ev, { create: true })]);
  };
  await cal(acme, { title: "Tomas on vacation", kind: "leave", personId: dana.id, date: day(5).slice(0, 10), endDate: day(8).slice(0, 10) });
  await cal(acme, { title: "Stores closed for inventory day", kind: "office", date: day(15).slice(0, 10) });
  await cal(acme, { title: "Monthly check-in call", kind: "care", date: day(9).slice(0, 10), time: "16:00", repeat: "monthly", projectId: backup.id });

  // A prospect that signed itself up from the site (prospect.ts): Noor at a building-supply yard, one project of needs,
  // with neon1 in it as every prospect organization has. It has a prospect number, not a client ID
  const noor = user("noor@calderbuildingsupply.example", "Noor Haddad", "");
  await repo.createUser(noor);
  const calder: Tenant = { id: newId("t"), slug: "calder-building-supply-3f9a1c", clientId: formatProspectId(1), name: "Calder Building Supply", place: "Hudson, NY", status: "active", stages: DEFAULT_STAGES, prospect: { since: day(-3), terms: PORTAL_TERMS_EDITION }, version: 1, createdAt: day(-3), updatedAt: day(-3), updatedBy: noor.id };
  await repo.createTenant(calder);
  await member(calder, noor, "admin");
  await member(calder, pradeep, "admin");
  const form = await project(calder, "NEED-1", "Answer the insurer's security questions", "intake", "not_started", "Our insurer sent a cyber-coverage form, and our files sit on one office PC and a USB drive.", [], 1, 1, "We can answer each question on the form truthfully, and we know which gaps to close first.");
  // A free account's first outline: three parts written, so Next step says what would help and the rest stays open
  await item(form, "discovery", "One real example of how it works today", { status: "done", body: "The form asks if our backups are tested. Noor didn't know, so she checked: there's a USB drive in a drawer, last copied in the spring." });
  await item(form, "request", "Honest answers to the insurer's form, with the gaps listed");

  return { pradeep, dana, raj, lee, neon1, acme, harbor, calder, noor };
}
