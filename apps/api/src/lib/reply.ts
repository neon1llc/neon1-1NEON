// apps/api/src/lib/reply.ts - Reply-by-email addresses for a project's Updates. One address per person and
// project: p.<token>.<signature>@<reply domain>. The token names who and where (kept in the table), and the
// signature is neon1-notify's own (the same secret and HMAC as its chat addresses), so only addresses
// 1NEON handed out are accepted. neon1-notify checks the signature and mail authentication; 1NEON then
// checks the sender is that person and can still write there.


import type { Repo } from "../store/repo.ts";
import { keys } from "../store/repo.ts";


/** The project's own comment thread, where its messages live */
export const THREAD = "thread";

/** The reply domain and the shared signing secret, read from SSM at cold start */
export interface Replies { domain: string; secret: string }

// HMAC-SHA256 through Web Crypto, so the browser demo (which runs this API in the page) builds too
async function hmac(secret: string, text: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

// First 16 hex characters of an HMAC over the kind and reference, as neon1-notify's lambda/reply.mjs signs
export const sign = async (secret: string, kind: string, ref: string) => [...(await hmac(secret, `${kind}.${ref}`))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);

// A short token for one person in one project: stable, so every email to them carries the same address
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export async function tokenFor(secret: string, tenantId: string, projectId: string, userId: string) {
  return [...(await hmac(secret, `token|${tenantId}|${projectId}|${userId}`)).subarray(0, 10)].map((b) => B32[b % 32]).join("");
}

/** The Reply-To for one person's copy of a project message, recording what its token names */
export async function replyAddress(repo: Repo, r: Replies, tenantId: string, projectId: string, userId: string) {
  const token = await tokenFor(r.secret, tenantId, projectId, userId);
  await repo.table.write([{ put: { ...keys.replyToken(token), type: "replyToken", tenantId, projectId, userId }, guard: { always: true } }]);
  return `p.${token}.${await sign(r.secret, "p", token)}@${r.domain}`;
}

/** What a token names, or undefined when it was never handed out */
export async function readToken(repo: Repo, token: string) {
  if (!/^[a-z2-7]{10}$/.test(token)) return undefined;
  const row = await repo.table.get(keys.replyToken(token).PK, keys.replyToken(token).SK);
  return row ? { tenantId: String(row.tenantId), projectId: String(row.projectId), userId: String(row.userId) } : undefined;
}
