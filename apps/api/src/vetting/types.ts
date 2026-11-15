// apps/api/src/vetting/types.ts - What the form checks ask of the outside world: does an email domain
// take mail and isn't a throwaway, does a website answer, does a place exist. Production uses
// RealVetting (real.ts: DNS, a guarded fetch, and the bundled lists); tests pass a fake; the browser
// demo and local runs pass none, and only the checks that need nothing from outside run.


/** The answers each check gives. "unknown" means the check couldn't decide (DNS timed out, say), and is
 * treated as a pass: a check that can't run never stops a real person */
export interface Vetting {
  /** Does this domain take mail? "no_mail" when DNS says it doesn't exist or has no mail server */
  mailDomain(domain: string): Promise<"ok" | "no_mail" | "unknown">;
  /** Is this domain a known throwaway-mailbox service? */
  disposable(domain: string): Promise<boolean>;
  /** Does this address answer? Any HTTP response counts; "unreachable" is no DNS, no connection, or no
   * answer in time; "refused" is an address that points inside a private network */
  reachable(url: string): Promise<"ok" | "unreachable" | "refused">;
  /** The place's proper spelling if this city is a populated place in this state, else undefined */
  place(city: string, state: string): Promise<string | undefined>;
}
