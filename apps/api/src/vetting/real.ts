// apps/api/src/vetting/real.ts - The production checks behind Vetting: DNS for mail domains, the bundled
// throwaway-domain and places lists (scripts/vetting-data.mjs writes them). Nothing here visits a
// website someone typed. Imported only by the Lambda handler, so the lists never reach the browser demo.


import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { gunzipSync } from "node:zlib";
import type { Vetting } from "./types.ts";


// How long one DNS answer may take before the check gives up
const DNS_MS = 3000;


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

  async place(city: string, state: string): Promise<string | undefined> {
    if (!this.places) {
      const { PLACES_GZ_B64 } = await import("./places-data.ts");
      const raw = JSON.parse(gunzipSync(Buffer.from(PLACES_GZ_B64, "base64")).toString("utf8")) as Record<string, string>;
      this.places = new Map(Object.entries(raw).map(([st, names]) => [st, new Map(names.split("\n").map((n) => [placeKey(n), n]))]));
    }
    return this.places.get(state.toUpperCase())?.get(placeKey(city));
  }
}
