// apps/web/src/components/LinksCard.tsx - Home's suggestion to add a LinkedIn profile or website, shown
// until one is added or the person hides it from Home's View menu (the profile also brings it back).


import { Link } from "react-router";
import type { Me } from "../lib/types.ts";


/** Does Home have this card to show this person? */
export const wantsLinks = (me: Me) => me.user.linksCard !== "hidden" && !me.user.linkedin && !me.user.businessLinkedin && !me.user.website;


export function LinksCard({ me }: { me: Me }) {
  if (!wantsLinks(me)) return null;
  return (
    <section className="card links-card" aria-labelledby="links-h">
      <h2 className="section-h" id="links-h">Add your links</h2>
      <p className="small muted">LinkedIn or a website helps the people you work with know you.</p>
      <p><Link className="btn btn-ghost btn-sm" to="/me#linkedin">Add links</Link></p>
    </section>
  );
}
