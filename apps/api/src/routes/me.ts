// apps/api/src/routes/me.ts - The signed-in person's own record: who they are and where they belong,
// profile edits, and proving the mobile number that text notices go to.


import { keys } from "../store/repo.ts";
import { cleanName, nameProblem, UpdateMeInput, type Member, type Tenant, type User } from "@1neon/domain";
import { z } from "zod";
import { failFields } from "../lib/vet.ts";
import { assurance } from "../lib/assurance.ts";
import { body, defined, fail, now, who } from "../lib/http.ts";
import type { App, Kit } from "../lib/kit.ts";
import { outboxOp } from "../outbox.ts";
import { codeText, e164, hashCode, smsAfterSave, smsDestinationAllowedByConfig, smsFactorOn, smsState, phoneDigest } from "../sms.ts";
import { ConflictError } from "../store/types.ts";


export function meRoutes(app: App, k: Kit) {
  const { d, repo } = k;
  const { textCode, countPhoneTry, consumeCode } = assurance(k);

  // Me: the person, their organizations (all of them for the operator), and the join bookkeeping
  app.get("/me", async (c) => {
    const { user, actor } = who(c);
    const memberships = await repo.membershipsOf(user.id);
    // First visit after an invite: mark joined. Every visit: last seen
    const t = now();
    for (const m of memberships) {
      if (m.status === "deactivated") continue;
      const joined = m.status === "invited";
      const stale = !m.lastSeenAt || Date.parse(t) - Date.parse(m.lastSeenAt) > 5 * 60 * 1000;
      if (joined || stale) {
        const next: Member = { ...m, status: "joined", joinedAt: m.joinedAt ?? t, lastSeenAt: t, version: m.version + 1, updatedAt: t, updatedBy: user.id };
        await repo.saveMember(next, { version: m.version }).catch(() => undefined);
        if (joined) await repo.table.write([repo.auditOp({ tenantId: m.tenantId, actorId: user.id, action: "member.joined", target: user.id, summary: `${user.name || user.email} joined` })]);
        // A first visit after two hours away counts as signing in, for anyone who wants to know
        else if (!m.lastSeenAt || Date.parse(t) - Date.parse(m.lastSeenAt) > 2 * 60 * 60 * 1000) await repo.table.write([repo.auditOp({ tenantId: m.tenantId, actorId: user.id, action: "member.signedin", target: user.id, summary: `${user.name || user.email} signed in` })]);
      }
    }
    const active = memberships.filter((m) => m.status !== "deactivated");
    // The operator sees every active organization; everyone else sees their own
    const tenants = actor.operator ? await repo.listTenants() : (await Promise.all(active.map((m) => repo.getTenant(m.tenantId)))).filter(Boolean) as Tenant[];
    const accessBy = new Map(active.map((m) => [m.tenantId, m.access] as const));
    const totp = Boolean((await repo.getTotp(user.id))?.confirmed);
    return c.json({
      user,
      operator: actor.operator,
      // Whether this session is confirmed with a passkey, authenticator, or texted code, which admin actions need
      strongSession: actor.strongSession,
      // Which second steps the person has set up: the app's own authenticator is read live, text codes
      // from the profile, and passkeys from the profile's hint (refreshed at each sign-in)
      factors: { totp, sms: smsFactorOn(user, d.cfg.smsAllowedDestinations), passkey: Boolean(user.passkey), any: totp || smsFactorOn(user, d.cfg.smsAllowedDestinations) || Boolean(user.passkey) || user.strongAuth },
      // Where texts stand: unavailable (no sending number yet), no number, not agreed, opted out, unverified, or ready
      sms: { state: smsState(user, Boolean(d.texter) && (d.cfg.env !== "dev" || Boolean(d.cfg.smsAllowedDestinations?.length)), d.cfg.smsAllowedDestinations) },
      // Whether Neo for signed-in people is wired here; without it the window stays the public one
      neo: Boolean(d.neo),
      trin: Boolean(d.trin),
      orgs: tenants
        .filter((t) => t.status === "active")
        .map((t) => ({ id: t.id, slug: t.slug, name: t.name, clientId: t.clientId, access: actor.operator ? "admin" : accessBy.get(t.id) }))
        .sort((a, b) => a.clientId.localeCompare(b.clientId)),
    });
  });

  // People edit only their own profile; operator and strong sign-in can't be set here
  app.patch("/me", async (c) => {
    const { user, actor } = who(c);
    const input = await body(c, UpdateMeInput);
    const { version, smsConsent, ...patch } = input;
    // With text codes on, a new number or a no to texts would switch off a second step; like any
    // factor change, that needs a confirmed session, so an email-only session can't swap in its own
    const offNumber = patch.phone !== undefined && e164(patch.phone) !== e164(user.phone);
    if (smsFactorOn(user, d.cfg.smsAllowedDestinations) && (offNumber || smsConsent === false) && !actor.strongSession) fail(403, "strong_auth_required", "Text codes are on for this number. Confirm it's you before changing it or turning texts off.");
    if (!offNumber && smsConsent === true && !e164(patch.phone ?? user.phone)) fail(400, "invalid_phone", "Add a valid phone number before turning texts on.");
    // Agreeing to texts is recorded with its time and wording version, as carriers expect. A new
    // number always needs a separate opt-in save, so consent cannot carry over from the previous phone
    const consent = offNumber ? false : smsConsent;
    const consentPhone = e164(patch.phone ?? user.phone);
    if (consent === true && !smsDestinationAllowedByConfig(consentPhone, d.cfg.smsAllowedDestinations)) fail(403, "texts_dev_limited", "Texts in this environment are limited to configured test numbers.");
    const sms = smsAfterSave(user, patch.phone, consent);
    const next: User = { ...user, ...defined(patch), ...sms, version: user.version + 1, updatedAt: now(), updatedBy: user.id };
    // A new name meets the same rule as sign-up. One saved before the rule stays until it's changed
    if (input.name !== undefined && input.name !== user.name) {
      const wrong = nameProblem(input.name, { neon1: actor.operator });
      if (wrong) failFields({ name: wrong });
      next.name = cleanName(input.name);
    }
    const ops = [repo.userOp(next, version)];
    const oldPhone = e164(user.smsPendingPhone ?? user.smsPhone);
    const newPhone = e164(next.smsPendingPhone ?? next.smsPhone);
    const startConsent = Boolean(next.smsConsentAt && next.smsPendingPhone && next.smsConsentAt !== user.smsConsentAt);
    if (startConsent) {
      const ownerKey = { PK: `SMSPHONE#${newPhone}`, SK: "OWNER" };
      const owner = await repo.table.get(ownerKey.PK, ownerKey.SK);
      // A deleted account's confirmed number stays taken until its hold ends (the sweep or the table's own expiry removes it a little late)
      const key = d.cfg.phoneHoldKey;
      const held = key ? keys.phoneHold(await phoneDigest(key, newPhone!)) : undefined;
      const hold = held ? await repo.table.get(held.PK, held.SK) : undefined;
      if (hold && Number(hold.ttl) * 1000 > Date.now()) fail(409, "phone_held", "This number can't be used yet. Use another number, or try again later.");
      if (owner && owner.userId !== user.id) fail(409, "phone_in_use", "This number is already connected to another 1NEON account. Remove it there first or use another number.");
      ops.push({ put: { ...ownerKey, type: "sms-owner", userId: user.id, version: Number(owner?.version ?? 0) + 1 }, guard: owner ? { version: Number(owner.version) } : { create: true } });
      ops.push(outboxOp(`S#${user.id}#SETUP#${next.smsConsentAt}`, { kind: "sms-confirmation", userId: user.id, to: newPhone!, consentAt: next.smsConsentAt! }));
    }
    if (oldPhone && (!next.smsConsentAt || oldPhone !== newPhone)) {
      const ownerKey = { PK: `SMSPHONE#${oldPhone}`, SK: "OWNER" };
      const owner = await repo.table.get(ownerKey.PK, ownerKey.SK);
      if (owner?.userId === user.id) ops.push({ delete: ownerKey, guard: { version: Number(owner.version) } });
    }
    try {
      await repo.table.write(ops);
    } catch (error) {
      // Do not reveal which account owns a phone number when two people opt in at once
      if (error instanceof ConflictError && error.current?.type === "sms-owner") fail(409, "phone_in_use", "This number is already connected to another 1NEON account. Remove it there first or use another number.");
      throw error;
    }
    return c.json(next);
  });

  // --- Text verification ---------------------------------------------------
  // Agreeing to texts isn't enough: a code sent to the number proves its holder is the person, and
  // only then do notices go there. Codes are hashed, short-lived, limited in tries, and rate limited

  // Send a code to the profile's number
  app.post("/me/phone/verify", async (c) => {
    const { user, jti } = who(c);
    if (!d.texter || (d.cfg.env === "dev" && !d.cfg.smsAllowedDestinations?.length)) fail(503, "texts_unavailable", "Texts aren't available yet. Email notices still work.");
    const to = e164(user.phone);
    if (!to) fail(400, "no_number", "Add a mobile number to your profile first.");
    if (!user.smsConsentAt) fail(400, "not_agreed", "Agree to texts on your profile first.");
    await textCode(user, "verify", jti, to, codeText);
    return c.json({ ok: true });
  });

  // Check the code; a match at the profile's current number, from the session that asked, marks it
  // verified. The code is used up in the same write that saves the profile, so it works once
  app.post("/me/phone/confirm", async (c) => {
    const { user, jti } = who(c);
    const { code } = await body(c, z.object({ code: z.string().min(6).max(12) }));
    const live = await countPhoneTry(user.id, "verify", jti);
    const fresh = (await repo.getUser(user.id))!;
    if (live.hash !== (await hashCode(user.id, code)) || live.phone !== e164(fresh.phone)) fail(400, "wrong_code", "That code didn't match. Check the newest text.");
    await consumeCode(live, [repo.userOp({ ...fresh, smsPhone: String(live.phone), smsPendingPhone: undefined, smsVerifiedAt: now(), version: fresh.version + 1, updatedAt: now(), updatedBy: user.id }, fresh.version)]);
    return c.json({ ok: true });
  });
}
