// apps/api/src/scripts/test-accounts.ts - neon1's own test organizations and people, for checking sign-in,
// chat, and the signed-in pages end to end. Each organization is marked `test`, so it stays out of All
// clients, Prospects, neon1's notices, and the quiet-prospect deletion.
// Usage: TABLE_NAME=1neon-dev USER_POOL_ID=us-east-1_xxx OPERATOR_EMAILS=a@x,b@y npx tsx src/scripts/test-accounts.ts
//
// Safe to run again: anything that already exists is left as it is (an existing organization only gains the mark).


import { DEFAULT_STAGES, formatClientId, formatProspectId, newId, type Member, type Tenant, type User } from "@1neon/domain";
import { CognitoDirectory } from "../services.ts";
import { DynamoTable } from "../store/dynamo.ts";
import { Repo } from "../store/repo.ts";


const need = (k: string) => process.env[k] || (console.error(`${k} is required`), process.exit(1));
const table = need("TABLE_NAME");
const pool = need("USER_POOL_ID");
const operators = need("OPERATOR_EMAILS").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const [base, host] = operators.find((e) => e.endsWith("@gmail.com"))!.split("@");

const repo = new Repo(new DynamoTable(table));
const dir = new CognitoDirectory(pool);
const ts = new Date().toISOString();
const alias = (tag: string) => `${base}+${tag}@${host}`;

type Person = { email: string; name: string; access: "admin" | "editor" | "viewer" };
const orgs: { slug: string; name: string; free: boolean; people: Person[] }[] = [
  // A client organization: two people, so the shared chat and the neon1 tab have more than one member
  { slug: "pickle-works-test", name: "Pickle Works", free: false, people: [
    { email: alias("client"), name: "Casey Client", access: "admin" },
    { email: alias("member"), name: "Morgan Member", access: "editor" },
  ] },
  // A free (trial) account
  { slug: "pickle-patch-test", name: "Pickle Patch", free: true, people: [{ email: alias("free"), name: "Fran Free", access: "admin" }] },
];

async function person(email: string, name: string) {
  let uid = await repo.userIdForEmail(email);
  if (!uid) {
    uid = newId("u");
    const u: User = { id: uid, email, name, title: "", phone: "", operator: false, strongAuth: false, theme: "providence", menu: "default", version: 1, createdAt: ts, updatedAt: ts, updatedBy: uid };
    await repo.createUser(u);
    console.log(`user ${email}`);
  }
  await dir.ensureUser(email);
  return uid;
}

const member = (t: Tenant, userId: string, email: string, name: string, access: Person["access"], by: string): Member => ({
  tenantId: t.id, userId, email, name, title: "", access, status: "joined", invitedBy: by, invitedAt: ts, joinedAt: ts, version: 1, createdAt: ts, updatedAt: ts, updatedBy: by,
});

for (const o of orgs) {
  let t = (await repo.listTenants()).find((x) => x.slug === o.slug);
  const first = o.people[0]!;
  const uid = await person(first.email, first.name);
  if (!t) {
    const clientId = o.free ? formatProspectId(await repo.table.increment("COUNTER", "PROSPECTID", 1)) : formatClientId(await repo.nextClientNumber());
    t = {
      id: newId("t"), slug: o.slug, clientId, name: o.name, place: "Albany, NY", status: "active", stages: DEFAULT_STAGES, test: true,
      ...(o.free ? { prospect: { since: ts, terms: "test" } } : {}),
      version: 1, createdAt: ts, updatedAt: ts, updatedBy: uid,
    };
    await repo.createTenant(t);
    console.log(`organization ${o.name} (${clientId})`);
  } else if (!t.test) {
    await repo.saveTenant({ ...t, test: true, version: t.version + 1, updatedAt: ts }, t.version);
    console.log(`marked ${o.name} as test`);
  }
  const have = new Set((await repo.listMembers(t.id)).map((m) => m.email));
  const everyone = [...o.people];
  // neon1's operator joins, as in a real sign-up, so the shared chat reaches them
  if (operators[0]) everyone.push({ email: operators[0], name: "neon1", access: "admin" });
  for (const p of everyone) {
    if (have.has(p.email)) continue;
    const id = await person(p.email, p.name);
    await repo.saveMember(member(t, id, p.email, p.name, p.access, uid), { create: true });
    console.log(`  member ${p.email} (${p.access})`);
  }
}
console.log("test accounts done");
