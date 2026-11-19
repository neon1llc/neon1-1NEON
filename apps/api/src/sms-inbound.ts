// apps/api/src/sms-inbound.ts - Confirm opted-in phone numbers from provider-authenticated inbound SMS events.


import type { Config } from "./config.ts";
import { outboxOp } from "./outbox.ts";
import { keys, Repo } from "./store/repo.ts";
import { ConflictError } from "./store/types.ts";
import { e164, smsDestinationAllowedByConfig } from "./sms.ts";


/** The provider's inbound SMS fields; message content is never logged */
export interface InboundSms {
  originationNumber?: string;
  destinationNumber?: string;
  messageBody?: string;
  inboundMessageId?: string;
}


/** Apply YES or STOP once, only for the configured sender and a number currently owned by an account */
export async function handleInboundSms(repo: Repo, cfg: Config, message: InboundSms) {
  const from = e164(message.originationNumber);
  const to = e164(message.destinationNumber);
  const expected = e164(cfg.smsNumber);
  const id = message.inboundMessageId;
  const body = message.messageBody?.trim().toUpperCase();
  if (!from || !to || !expected || to !== expected || !smsDestinationAllowedByConfig(from, cfg.smsAllowedDestinations) || !id || id.length > 128 || !/^[a-zA-Z0-9-]+$/.test(id)) return;
  if (body !== "YES" && !/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(body ?? "")) return;

  const inbound = keys.smsInbound(id);
  if (await repo.table.get(inbound.PK, inbound.SK)) return;
  const ownerKey = keys.smsOwner(from);
  const owner = await repo.table.get(ownerKey.PK, ownerKey.SK);
  const user = owner?.userId ? await repo.getUser(String(owner.userId)) : undefined;
  if (!user) return;
  const pending = user.smsConsentAt && user.smsPendingPhone === from && !user.smsVerifiedAt;
  const active = user.smsConsentAt && (user.smsPendingPhone === from || user.smsPhone === from);
  if (body === "YES" && !pending) return;
  if (body !== "YES" && !active) return;

  const at = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 30 * 86400;
  const marker = { ...inbound, type: "sms-inbound", at, ttl };
  const next = body === "YES"
    ? { ...user, smsPhone: from, smsPendingPhone: undefined, smsVerifiedAt: at, version: user.version + 1, updatedAt: at, updatedBy: user.id }
    : { ...user, smsConsentAt: undefined, smsPendingPhone: undefined, smsPhone: undefined, smsVerifiedAt: undefined, smsFactorAt: undefined, smsOptedOutAt: at, version: user.version + 1, updatedAt: at, updatedBy: user.id };
  const ops = [repo.userOp(next, user.version), { put: marker, guard: { create: true as const } }];
  if (body === "YES") ops.push(outboxOp(`S#${user.id}#ACK#${id}`, { kind: "sms-confirmed", userId: user.id, to: from, verifiedAt: at }));
  try {
    await repo.table.write(ops);
  } catch (error) {
    // Duplicate delivery or a concurrent profile change is safe to ignore; neither consumes a new consent
    if (error instanceof ConflictError) return;
    throw error;
  }
}
