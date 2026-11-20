// apps/web/src/components/HomeGuide.tsx - The guide on Home: a short card for anyone new to 1NEON that
// points at the example project, the guided walkthrough, and the FAQs. It can be put away with Hide and
// comes back from Your profile. Whether it's hidden is this browser's choice, kept per person.


import { Link } from "react-router";
import { LIVE } from "../lib/api.ts";
import { prefs } from "../lib/prefs.ts";


const hiddenKey = (userId: string) => `1neon.guides.hidden.${userId}`;

/** Has this person put the Home guides away in this browser? */
export const guidesHidden = (userId: string) => prefs.get(hiddenKey(userId)) === "1";

/** Put them away, or bring them back (Your profile) */
export const hideGuides = (userId: string, hide: boolean) => prefs.set(hiddenKey(userId), hide ? "1" : "0");


/** The guide card. A free account's version also says what the account is for; both link the same three
 * ways in. In the guided walkthrough it keeps only the words, since its links would leave the story */
export function HomeGuide({ userId, free, onHide }: { userId: string; free: boolean; onHide: () => void }) {
  // Clients' Home stays as it was inside the playback; only the free account's story has a guide
  if (LIVE && !free) return null;
  return (
    <aside className={`card guide${free ? " prospect-note" : ""}`} aria-label={free ? "Your free account" : "New to 1NEON?"}>
      <p className="guide-text">
        {free
          ? <><b>You're on a free account.</b> Write down what a project needs, then ask me for an assessment under Next step. It's free, and only you and I can see it.</>
          : <><b>New to 1NEON?</b> These show how a project runs, before you start one.</>}
      </p>
      {!LIVE && (
        <ul className="guide-links" aria-label="Ways to see how it works">
          <li><Link to="/example">See an example project</Link></li>
          <li><a href="/1NEON/live">Watch the guided walkthrough</a></li>
          <li><Link to="/faqs">Read the FAQs</Link></li>
        </ul>
      )}
      {!LIVE && <button type="button" className="linkish small guide-hide" onClick={() => { hideGuides(userId, true); onHide(); }} title="You can bring it back from Your profile">Hide</button>}
    </aside>
  );
}
