// lib/edge.ts - What the API trusts about the network: that a request came through CloudFront, and the
// visitor's address CloudFront saw. Both rest on headers a caller can't set once the origin lock is on.

import type { Context } from "hono";


/** The visitor's address as CloudFront reports it ("address:port", IPv6 without brackets), port dropped.
 * CloudFront always sets this header itself (neon1-aws-infrastructure's 1NEON origin request policy), and
 * with the origin lock on nothing reaches the API except through CloudFront, so a caller can't choose it.
 * The forwarded-for fallback covers only the release before the policy is live */
export function viewerIp(c: Context): string {
  const viewer = c.req.header("cloudfront-viewer-address")?.trim();
  if (viewer) return viewer.includes(":") ? viewer.slice(0, viewer.lastIndexOf(":")) : viewer;
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}


/** Constant-time comparison of the edge secret CloudFront adds with the one this function holds */
export function fromEdge(got: string | undefined, want: string | undefined): boolean {
  if (!want || !got) return false;
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(want);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
