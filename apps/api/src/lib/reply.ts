// apps/api/src/lib/reply.ts - Reply-by-email addresses for a project's Updates. One address per person and
// project: p.<token>.<signature>@<reply domain>. The token names who and where (kept in the table), and the
// signature is neon1-notify's own (the same secret and HMAC as its chat addresses), so only addresses
// 1NEON handed out are accepted. neon1-notify checks the signature and mail authentication; 1NEON then
// checks the sender is that person and can still write there.


import { createHmac } from "node:crypto";
import type { Repo } from "../store/repo.ts";
import { keys } from "../store/repo.ts";


/** The project's own comment thread, where its messages live */
export const THREAD = "thread";

/** The reply domain and the shared signing secret, read from SSM at cold start */
export interface Replies { domain: string; secret: string }

// First 16 hex characters of an HMAC over the kind and reference, as neon1-notify's lambda/reply.mjs signs
export const sign = (secret: string, kind: string, ref: string) => createHmac("sha256", secret).update(`${kind}.${ref}`).digest("hex").slice(0, 16);

// A short token for one person in one project: stable, so every email to them carries the same address
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export function tokenFor(secret: string, tenantId: string, projectId: string, userId: string) {
  const h = createHmac("sha256", secret).update(`token|${tenantId}|${projectId}|${userId}`).digest();
  return [...h.subarray(0, 10)].map((b) => B32[b % 32]).join("");
}

/** The Reply-To for one person's copy of a project message, recording what its token names */
export async function replyAddress(repo: Repo, r: Replies, tenantId: string, projectId: string, userId: string) {
  const token = tokenFor(r.secret, tenantId, projectId, userId);
  await repo.table.write([{ put: { ...keys.replyToken(token), type: "replyToken", tenantId, projectId, userId }, guard: { always: true } }]);
  return `p.${token}.${sign(r.secret, "p", token)}@${r.domain}`;
}

/** What a token names, or undefined when it was never handed out */
export async function readToken(repo: Repo, token: string) {
  if (!/^[a-z2-7]{10}$/.test(token)) return undefined;
  const row = await repo.table.get(keys.replyToken(token).PK, keys.replyToken(token).SK);
  return row ? { tenantId: String(row.tenantId), projectId: String(row.projectId), userId: String(row.userId) } : undefined;
}
