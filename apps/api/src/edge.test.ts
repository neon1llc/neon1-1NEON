// apps/api/src/edge.test.ts - The origin lock and the visitor address: requests without CloudFront's
// secret are refused when the lock is on, and the address comes from CloudFront's own header.


import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { fromEdge, viewerIp } from "./lib/edge.ts";
import { MemoryDirectory, MemoryMailer, MemoryStorage } from "./services.ts";
import { MemoryTable } from "./store/memory.ts";
import { Repo } from "./store/repo.ts";


// An obviously fake value; never a deployed one
const SECRET = "fake-edge-value-for-tests";

function appWith(originLock: boolean) {
  return createApp({
    cfg: { env: "local", publicUrl: "https://neon1.tech", operatorEmails: [], devAuth: false, originLock, originSecret: SECRET },
    repo: new Repo(new MemoryTable()), directory: new MemoryDirectory(), mailer: new MemoryMailer(), storage: new MemoryStorage(),
  });
}


describe("origin lock", () => {
  it("refuses a request without the edge secret when on", async () => {
    const res = await appWith(true).request("/1NEON/api/health");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("edge");
  });

  it("refuses a wrong secret of the same length", async () => {
    const res = await appWith(true).request("/1NEON/api/health", { headers: { "x-origin-verify": SECRET.replace(/.$/, "x") } });
    expect(res.status).toBe(403);
  });

  it("answers with the right secret", async () => {
    const res = await appWith(true).request("/1NEON/api/health", { headers: { "x-origin-verify": SECRET } });
    expect(res.status).toBe(200);
  });

  it("answers without the secret while off", async () => {
    const res = await appWith(false).request("/1NEON/api/health");
    expect(res.status).toBe(200);
  });

  it("won't start locked without a secret", () => {
    expect(() => loadConfig({ ORIGIN_LOCK: "on" })).toThrow(/ORIGIN_SECRET/);
    expect(loadConfig({ ORIGIN_LOCK: "on", ORIGIN_SECRET: SECRET }).originLock).toBe(true);
    expect(loadConfig({}).originLock).toBe(false);
  });

  it("compares secrets exactly", () => {
    expect(fromEdge(SECRET, SECRET)).toBe(true);
    expect(fromEdge(undefined, SECRET)).toBe(false);
    expect(fromEdge(SECRET, undefined)).toBe(false);
    expect(fromEdge(SECRET + "x", SECRET)).toBe(false);
  });
});


describe("visitor address", () => {
  const ip = async (headers: Record<string, string>) => {
    const app = new Hono();
    app.get("/", (c) => c.text(viewerIp(c)));
    return (await app.request("/", { headers })).text();
  };

  it("takes CloudFront's viewer address over a forwarded-for the caller wrote", async () => {
    expect(await ip({ "cloudfront-viewer-address": "203.0.113.7:51234", "x-forwarded-for": "198.51.100.1, 203.0.113.7" })).toBe("203.0.113.7");
  });

  it("drops the port from an IPv6 viewer address", async () => {
    expect(await ip({ "cloudfront-viewer-address": "2001:db8::1:443" })).toBe("2001:db8::1");
  });

  it("falls back to forwarded-for, then unknown", async () => {
    expect(await ip({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })).toBe("198.51.100.1");
    expect(await ip({})).toBe("unknown");
  });
});
