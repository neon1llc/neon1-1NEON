// apps/api/src/vetting/real.ts - The production checks behind Vetting: DNS for mail domains, the bundled
// throwaway-domain and places lists (scripts/vetting-data.mjs writes them), and a website check that
// refuses to look inside a private network. Imported only by the Lambda handler, so the lists never reach
// the browser demo.


import { lookup, resolve4, resolve6, resolveMx } from "node:dns/promises";
import { isIP } from "node:net";
import { gunzipSync } from "node:zlib";
import type { Vetting } from "./types.ts";


// How long one DNS answer or one web request may take before the check gives up
const DNS_MS = 3000;
const FETCH_MS = 6000;
const MAX_REDIRECTS = 4;


/** A promise that loses to a timer: undefined if it takes too long */
function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms).unref?.())]);
}


/** How a place name is compared: case, accents, punctuation, "Saint"/"St", "Mount"/"Mt", "Fort"/"Ft",
 * and a leading "The" don't matter */
export function placeKey(name: string): string {
  return name
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsaint\b/g, "st").replace(/\bsainte\b/g, "ste").replace(/\bmount\b/g, "mt").replace(/\bfort\b/g, "ft")
    .replace(/^the /, "")
    .trim();
}


/** Is this IP address one the website check must never reach: loopback, private, link-local (which
 * includes the cloud metadata address), carrier-grade NAT, multicast, or unspecified? */
export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return privateAddress(mapped[1]!);
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}


export class RealVetting implements Vetting {
  // The lists, unpacked on first use and kept for the life of the Lambda
  private disposableSet?: Set<string>;
  private places?: Map<string, Map<string, string>>;

  async mailDomain(domain: string): Promise<"ok" | "no_mail" | "unknown"> {
    try {
      const mx = await within(resolveMx(domain), DNS_MS);
      if (mx === undefined) return "unknown";
      // A "null MX" (one record, exchange ".") is a domain saying it takes no mail
      if (mx.length === 1 && (mx[0]!.exchange === "" || mx[0]!.exchange === ".")) return "no_mail";
      if (mx.length) return "ok";
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "ENODATA" && code !== "ENOTFOUND") return "unknown";
      if (code === "ENOTFOUND") return "no_mail";
    }
    // No MX record: mail falls back to the domain's own address, if it has one
    const a = await within(Promise.any([resolve4(domain), resolve6(domain)]).catch(() => [] as string[]), DNS_MS);
    if (a === undefined) return "unknown";
    return a.length ? "ok" : "no_mail";
  }

  async disposable(domain: string): Promise<boolean> {
    if (!this.disposableSet) {
      const { DISPOSABLE_GZ_B64 } = await import("./disposable-data.ts");
      this.disposableSet = new Set(gunzipSync(Buffer.from(DISPOSABLE_GZ_B64, "base64")).toString("utf8").split("\n"));
    }
    // A subdomain of a throwaway service is one too (mail.mailinator.com)
    const parts = domain.toLowerCase().split(".");
    for (let i = 0; i < parts.length - 1; i++) if (this.disposableSet.has(parts.slice(i).join("."))) return true;
    return false;
  }

  async reachable(url: string): Promise<"ok" | "unreachable" | "refused"> {
    let at = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let u: URL;
      try { u = new URL(at); } catch { return "unreachable"; }
      if ((u.protocol !== "https:" && u.protocol !== "http:") || (u.port && u.port !== "80" && u.port !== "443")) return "refused";
      // Every address the name points to must be public, checked before each request and each redirect
      const addrs = await within(lookup(u.hostname, { all: true }).catch(() => []), DNS_MS);
      if (!addrs?.length) return "unreachable";
      if (addrs.some((a) => privateAddress(a.address))) return "refused";
      const r = await fetch(u, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_MS),
        headers: { "user-agent": "Mozilla/5.0 (compatible; neon1-linkcheck/1.0; +https://neon1.tech/1NEON/privacy)", accept: "text/html,*/*;q=0.5" },
      }).catch(() => undefined);
      if (!r) return "unreachable";
      // Only the status matters; the page itself is never read
      await r.body?.cancel().catch(() => {});
      const next = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && next) {
        at = new URL(next, u).toString();
        continue;
      }
      // Any answer, even "forbidden" (LinkedIn answers bots that way), means the address is real
      return "ok";
    }
    // Too many redirects still means something answered
    return "ok";
  }

  async place(city: string, state: string): Promise<string | undefined> {
    if (!this.places) {
      const { PLACES_GZ_B64 } = await import("./places-data.ts");
      const raw = JSON.parse(gunzipSync(Buffer.from(PLACES_GZ_B64, "base64")).toString("utf8")) as Record<string, string>;
      this.places = new Map(Object.entries(raw).map(([st, names]) => [st, new Map(names.split("\n").map((n) => [placeKey(n), n]))]));
    }
    return this.places.get(state.toUpperCase())?.get(placeKey(city));
  }
}
