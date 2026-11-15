// apps/web/src/components/Prospect.tsx - What a new (prospect) account sees: a calm note on its
// workspace, and the account-level check for things that never open for it (Neo, texts).


import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router";
import { read } from "../lib/reads.ts";
import { BOOK_A_CALL, prospectEverywhere } from "../lib/prospect.ts";
import type { Me, OrgResponse } from "../lib/types.ts";


/** Is this person limited as a prospect in every organization they belong to? Reads the same cached
 * organization queries the pages use; `undefined` until they've all loaded, so nothing flashes away */
export function useProspectEverywhere(me: Me): boolean | undefined {
  const reads = useQueries({
    // neon1's own people are never limited, so they ask for nothing
    queries: me.operator ? [] : me.orgs.map((o) => ({ queryKey: ["org", o.id], queryFn: () => read<OrgResponse>(`/t/${o.id}`, { org: "object", access: "string" }) })),
  });
  if (me.operator) return false;
  if (reads.some((r) => r.isPending)) return undefined;
  return prospectEverywhere(reads.map((r) => r.data?.org), false);
}


/** The note on a new account's workspace: what to do here, and a way to talk sooner */
export function ProspectNote() {
  return (
    <p className="notice prospect-note" role="note">
      <span>You're set up as a new account. Add your projects' needs here, and I'll take a look and get back to you. Want to talk sooner? <a className="out" href={BOOK_A_CALL} target="_blank" rel="noopener noreferrer">Book a call<span className="out-arrow" aria-hidden="true">↗</span></a>, or <Link to="/contact">email, call, or text</Link>.</span>
    </p>
  );
}
