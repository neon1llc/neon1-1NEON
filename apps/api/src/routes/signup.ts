// apps/api/src/routes/signup.ts - Sign-up for prospects: someone from the site makes their own account
// and a limited prospect organization (packages/domain/src/prospect.ts). Distrust before trust: the
// form passes a bot check, a hidden field, a minimum fill time, and counters per address, per email,
// and per day before anything happens. Then only a pending row and a sign-in account exist; the
// organization is made when the emailed code proves the address (claimSignup, called from sign-in).
// The answer never says whether an email already has an account.


import { DEFAULT_STAGES, DESCRIBES, DESCRIBES_KEYS, FOUND_KEYS, FOUND_VIA, PORTAL_TERMS_EDITION, PublicFace, describesLabel, foundLabel, formatProspectId, MIN_TEXT, newId, slugify, type Member, type Tenant, type User } from "@1neon/domain";
import { emailProblem, failFields, linkProblem, nameProblem, placeCheck, textProblem, type FieldProblems } from "../lib/vet.ts";
import type { Vetting } from "../vetting/types.ts";
import type { Context } from "hono";
import { z } from "zod";
import { isDev, neon1Only } from "../dev-guard.ts";
import { body, fail } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { ConflictError } from "../store/types.ts";


// --- Limits ----------------------------------------------------------------

export const SIGNUP_LIMITS = {
  // From one address (hashed): an hour, and a day
  perAddressHourly: 3,
  perAddressDaily: 10,
  // To one email in a day, so the form can't be used to flood someone's inbox with codes
  perEmailDaily: 3,
  // Everyone, in a day; past it sign-up pauses until tomorrow (UTC)
  daily: 25,
  // A person takes longer than this to fill in the form; a script usually doesn't
  minFillMs: 3000,
} as const;
// How long a sign-up waits for its code: the sweep removes the sign-in account after a day, and a
// confirmation later than this is treated as a fresh visitor
export const PENDING_MS = 24 * 60 * 60 * 1000;
// Counters only need to outlive the day they count
const COUNTER_KEEP_S = 2 * 24 * 60 * 60;

// The pending sign-ups, one small partition the sweep reads whole, keyed by email
export const SIGNUP_PK = "SIGNUP";
// neon1's switch for sign-up, kept in the table so Pradeep can pause it from the portal
export const SIGNUP_SWITCH = { PK: "CONFIG", SK: "SIGNUP" } as const;
// Prospect numbers (NP-0001) have their own counter, so client numbers stay for clients
const PROSPECT_COUNTER = { PK: "COUNTER", SK: "PROSPECTID" } as const;


// What the form sends. Who they are ("Which describes you best?") is required, and every answer but an
// individual names its organization ("Something else" may leave it out: their own words say what it is). Where the business is based and a link to it are optional, so
// someone who'd rather stay private can still start. The fields' own checks (vet.ts) run after the bot
// check and answer field by field
const SignUpBody = z.object({
  email: z.string().trim().toLowerCase().max(254),
  name: z.string().trim().max(80),
  // They said they go by one name, so a last name isn't asked for
  oneName: z.boolean().default(false),
  kind: z.enum(DESCRIBES_KEYS),
  // Their own words when "Something else" is picked
  kindOther: z.string().trim().max(80).default(""),
  org: z.string().trim().max(80).default(""),
  // Accepting the portal terms is required, and recorded with the edition shown
  terms: z.literal(true),
  // Cloudflare Turnstile's token
  check: z.string().max(2048).default(""),
  // Hidden from people; a bot that fills every field fills this one too
  website: z.string().max(200).default(""),
  // How long the form was open, in milliseconds, as the page measured it
  elapsed: z.number().int().nonnegative().max(7 * 24 * 3600 * 1000).default(0),
  remember: z.boolean().default(true),
  // "How did you find neon1?": optional, one of FOUND_VIA's keys, with their words for "Somewhere else"
  found: z.enum(FOUND_KEYS).optional(),
  foundOther: z.string().trim().max(80).default(""),
}).and(PublicFace);


/** Every field's own check, run together: the person sees each problem beside its field at once.
 * Returns the place in its proper spelling */
async function checkSignUp(v: Vetting | undefined, b: z.infer<typeof SignUpBody>): Promise<{ place: string }> {
  const problems: FieldProblems = {};
  const [email, link, place] = await Promise.all([emailProblem(v, b.email), linkProblem(v, b.link), placeCheck(v, b.place)]);
  if (email) problems.email = email;
  const name = nameProblem(b.name, b.oneName);
  if (name) problems.name = name;
  if (b.kind === "other" && !b.kindOther) problems.kindOther = "Say what describes you.";
  else if (b.kind === "other") { const t = textProblem(b.kindOther, "what describes you"); if (t) problems.kindOther = t; }
  if (b.kind !== "individual") {
    if (!b.org) { if (b.kind !== "other") problems.org = "Enter your organization's name."; }
    else { const t = textProblem(b.org, "your organization's name", MIN_TEXT); if (t) problems.org = t; }
  }
  if (link) problems.link = link;
  if ("problem" in place) problems.place = place.problem;
  if (b.found === "other" && !b.foundOther) problems.foundOther = "Say where you found neon1.";
  else if (b.found === "other") { const t = textProblem(b.foundOther, "where you found neon1"); if (t) problems.foundOther = t; }
  if (Object.keys(problems).length) failFields(problems);
  return { place: "place" in place ? place.place : "" };
}


/** The caller's address, as CloudFront saw it */
export function callerIp(c: Context) {
  return (c.req.header("cloudfront-viewer-address") ?? c.req.header("x-forwarded-for") ?? "unknown").split(",")[0]!.replace(/:\d+$/, "").trim();
}

/** A short one-way hash of a value, so counters and records never hold an address */
export async function shortHash(s: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


/** Whether sign-up is open right now: on in configuration, and not paused by neon1 */
export async function signupOpen(k: Pick<Kit, "repo" | "cfg">) {
  if (!k.cfg.signup) return false;
  const row = await k.repo.table.get(SIGNUP_SWITCH.PK, SIGNUP_SWITCH.SK);
  return !row?.paused;
}


export function signupRoutes(app: App, k: Kit) {
  const { d, repo, cfg } = k;

  // What the form needs before it shows: open or not, Turnstile's site key, and the terms edition
  app.get("/auth/signup", async (c) => {
    return c.json({ open: await signupOpen(k), siteKey: cfg.turnstileSiteKey, terms: PORTAL_TERMS_EDITION });
  });

  app.post("/auth/signup", async (c) => {
    if (!(await signupOpen(k))) fail(503, "signup_closed", "Sign-up is paused right now. Email hello@neon1.tech, and I'll set you up.");
    const b = await body(c, SignUpBody);
    // A filled hidden field, or a form filled faster than a person can, looks like success and does nothing
    if (b.website || b.elapsed < SIGNUP_LIMITS.minFillMs) return c.json({ step: "code" });

    // The bot check. Without a configured check only local runs and tests go on; deployed, it's refused
    const ip = callerIp(c);
    if (d.humanCheck) {
      if (!(await d.humanCheck.verify(b.check, ip))) fail(400, "bot_check", "The check that you're a person didn't pass. Reload the page and try again.");
    } else if (cfg.env !== "local") {
      fail(503, "signup_closed", "Sign-up is paused right now. Email hello@neon1.tech, and I'll set you up.");
    }

    // The fields, each checked on its own (a real mail domain, a website that answers, a real place),
    // before any counter moves, so fixing a typo never uses up a try
    const { place } = await checkSignUp(d.vetting, b);
    // An individual's account is named for them, and so is "Something else" without an organization's name
    const org = b.kind === "individual" || !b.org ? b.name : b.org;

    // Counters: per address each hour and day, per email each day, and everyone each day
    const who = await shortHash(ip);
    const mail = await shortHash(b.email);
    const hour = new Date().toISOString().slice(0, 13);
    const day = hour.slice(0, 10);
    const until = Math.floor(Date.now() / 1000) + COUNTER_KEEP_S;
    const count = (sk: string) => repo.table.increment("COUNTER", sk, 1, until);
    if ((await count(`SIGNUP#IP#${who}#${hour}`)) > SIGNUP_LIMITS.perAddressHourly || (await count(`SIGNUP#IP#${who}#${day}`)) > SIGNUP_LIMITS.perAddressDaily) {
      fail(429, "too_many", "That's a lot of sign-ups from one place. Try again later, or email hello@neon1.tech.");
    }
    if ((await count(`SIGNUP#EMAIL#${mail}#${day}`)) > SIGNUP_LIMITS.perEmailDaily) fail(429, "too_many", "That email has had a few codes today. Try again tomorrow, or email hello@neon1.tech.");
    if ((await count(`SIGNUP#${day}`)) > SIGNUP_LIMITS.daily) fail(503, "signup_full", "Sign-up is full for today. Try again tomorrow, or email hello@neon1.tech.");

    // Dev is a private test site: only neon1's own addresses may sign up there
    if (isDev(cfg) && !neon1Only(cfg, b.email)) fail(403, "dev_only", "Dev takes neon1.tech addresses only.");

    // Someone who already has an account just signs in; nothing new is made for them
    if (!(await repo.userIdForEmail(b.email))) {
      const before = await repo.table.get(SIGNUP_PK, b.email);
      const made = (await d.directory.ensureUser(b.email)) === true;
      // The pending row: what they typed, which terms they accepted, and whether this sign-up made the
      // sign-in account (only then may the sweep remove it). It expires on its own after three days
      await repo.table.write([{
        put: {
          PK: SIGNUP_PK, SK: b.email, email: b.email, name: b.name, org, kind: b.kind, kindOther: b.kind === "other" ? b.kindOther : undefined, place, link: b.link, found: b.found, foundOther: b.found === "other" ? b.foundOther : undefined, terms: PORTAL_TERMS_EDITION, from: who,
          made: made || Boolean(before?.made), at: new Date().toISOString(), ttl: Math.floor(Date.now() / 1000) + 3 * 24 * 3600,
        },
        guard: { always: true },
      }]);
    }

    // The same email-code sign-in everyone uses; the code proves the address
    if (!d.auth) return c.json({ step: "code" });
    const r = await d.auth.start(c, b.email, b.remember);
    return c.json(r.next);
  });
}


/** What the pending row says about who they are and how they found neon1, kept only when it's one of
 * the known answers */
function prospectAnswers(pending: Record<string, unknown>) {
  const kind = typeof pending.kind === "string" && pending.kind in DESCRIBES ? pending.kind : undefined;
  const found = typeof pending.found === "string" && pending.found in FOUND_VIA ? pending.found : undefined;
  return {
    ...(kind ? { kind } : {}),
    ...(kind === "other" && pending.kindOther ? { kindOther: String(pending.kindOther).slice(0, 80) } : {}),
    ...(found ? { found } : {}),
    ...(found === "other" && pending.foundOther ? { foundOther: String(pending.foundOther).slice(0, 80) } : {}),
  };
}


/**
 * After a verified sign-in for an email with no account: make the prospect, if a sign-up for that email
 * is waiting and fresh. Returns the new user's ID, or undefined (no sign-up, so the person isn't invited).
 * The user, the organization, both memberships (theirs and neon1's, so Pradeep hears about it), and
 * the audit event that emails Pradeep land here; the pending row goes once they have
 */
export async function claimSignup(k: Pick<Kit, "repo" | "cfg">, email: string): Promise<string | undefined> {
  const { repo, cfg } = k;
  const pending = await repo.table.get(SIGNUP_PK, email);
  if (!pending || Date.now() - Date.parse(String(pending.at)) > PENDING_MS) return undefined;
  if (isDev(cfg) && !neon1Only(cfg, email)) return undefined;

  const ts = new Date().toISOString();
  const uid = newId("u");
  const name = String(pending.name ?? "").slice(0, 80);
  const orgName = String(pending.org ?? "").slice(0, 80) || name || "My organization";
  // The address gets a random ending, so a prospect can't take a name a client might need
  const suffix = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tenant: Tenant = {
    id: newId("t"),
    slug: `${slugify(orgName).slice(0, 32).replace(/-+$/, "")}-${suffix}`,
    clientId: formatProspectId(await repo.table.increment(PROSPECT_COUNTER.PK, PROSPECT_COUNTER.SK)),
    name: orgName,
    // Where the business is based and its link, as given at sign-up (the form checked them)
    ...(pending.place ? { place: String(pending.place).slice(0, 80) } : {}),
    ...(pending.link ? { link: String(pending.link).slice(0, 200) } : {}),
    status: "active",
    stages: DEFAULT_STAGES,
    prospect: { since: ts, terms: String(pending.terms ?? PORTAL_TERMS_EDITION).slice(0, 20), from: pending.from ? String(pending.from).slice(0, 64) : undefined, ...prospectAnswers(pending) },
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    updatedBy: uid,
  };
  const user: User = { id: uid, email, name, title: "", phone: "", operator: false, strongAuth: false, theme: "awake", menu: "default", tour: "new", version: 1, createdAt: ts, updatedAt: ts, updatedBy: uid };

  // The email claim decides a race between two confirmations: the loser reads the winner's user
  try {
    await repo.createUser(user);
  } catch (e) {
    if (e instanceof ConflictError) return repo.userIdForEmail(email);
    throw e;
  }
  await repo.createTenant(tenant);

  const member = (userId: string, mail: string, memberName: string): Member => ({
    tenantId: tenant.id, userId, email: mail, name: memberName, title: "", access: "admin", status: "joined",
    invitedBy: uid, invitedAt: ts, joinedAt: ts, version: 1, createdAt: ts, updatedAt: ts, updatedBy: uid,
  });
  const ops = [repo.memberOp(member(uid, email, name), { create: true })];
  // neon1's operator joins, so the new prospect, their projects, and their files reach Pradeep's inbox
  const opEmail = cfg.operatorEmails[0];
  const opId = opEmail ? await repo.userIdForEmail(opEmail) : undefined;
  if (opId && opEmail) ops.push(repo.memberOp(member(opId, opEmail, (await repo.getUser(opId))?.name ?? "neon1"), { create: true }));
  ops.push(
    repo.membershipRevOp(tenant.id, 0),
    repo.auditOp({ tenantId: tenant.id, actorId: uid, action: "prospect.signedup", target: tenant.id, summary: `${name || email} (${email}) signed up as ${orgName} (${tenant.clientId})${[tenant.prospect?.kind && describesLabel(tenant.prospect), tenant.place, tenant.link, tenant.prospect?.found && `found via ${foundLabel(tenant.prospect)}`].filter(Boolean).map((x) => `, ${x}`).join("")}` }),
    { delete: { PK: SIGNUP_PK, SK: email } },
  );
  await repo.table.write(ops);
  return uid;
}


/**
 * The scheduled tidy-up: a sign-up never confirmed within a day loses the sign-in account it made (an
 * account that existed before, or that someone has since been invited to, is left alone)
 */
export async function sweepSignups(k: Pick<Kit, "repo" | "d">, opts: { deadline?: number } = {}) {
  const { repo, d } = k;
  let removed = 0;
  for (const r of await repo.table.query(SIGNUP_PK)) {
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) break;
    if (Date.now() - Date.parse(String(r.at)) <= PENDING_MS) continue;
    const email = String(r.SK);
    if (r.made && !(await repo.userIdForEmail(email)) && d.directory.removeUser) {
      await d.directory.removeUser(email);
      removed++;
    }
    await repo.table.write([{ delete: { PK: SIGNUP_PK, SK: email } }]);
  }
  return { removed };
}
