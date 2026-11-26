// apps/web/src/components/LinksCard.tsx - Home's suggestion to add a LinkedIn profile or website, shown
// until one is added or the person hides it (the profile brings it back).


import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.ts";
import { problem } from "../lib/hooks.ts";
import type { Me } from "../lib/types.ts";
import { useToast } from "./ui.tsx";


/** Does Home have this card to show this person? */
export const wantsLinks = (me: Me) => me.user.linksCard !== "hidden" && !me.user.linkedin && !me.user.website;


export function LinksCard({ me }: { me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!wantsLinks(me)) return null;
  const hide = async () => {
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: { version: me.user.version, linksCard: "hidden" } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Hidden. Your links stay on your profile.");
    } catch (e) {
      toast(problem(e));
      setBusy(false);
    }
  };
  return (
    <section className="card links-card" aria-labelledby="links-h">
      <h2 className="section-h" id="links-h">Add your links <button type="button" className="linkish helper" disabled={busy} onClick={() => void hide()}>Hide</button></h2>
      <p className="small muted">LinkedIn or a website helps the people you work with know you.</p>
      <p><Link className="btn btn-ghost btn-sm" to="/me#linkedin">Add links</Link></p>
    </section>
  );
}
