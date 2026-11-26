// apps/web/src/components/PublicFooter.tsx - The foot of 1NEON's public screens (sign-in, sign-up, the sample project, FAQs, and the legal documents): neon1.tech's own legal strip (shared/neon1.css, .legal), with the theme choice, the pages and policies, and "report bug \ feedback". The signed-in portal has none.


import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LIVE } from "../lib/api.ts";
import { isDarkLook, isSentinel, lookFor, onLookChange, readLook, saveLook, type Style } from "../lib/style.ts";
import { ReportBug } from "./BugReport.tsx";
import { OutLink } from "./OutLink.tsx";


const Sep = () => <span className="sep" aria-hidden="true">\</span>;


/** "theme matrix \ sentinel": the family from any public screen, keeping the mode, as the site's footer has it */
function LookPick() {
  const family = (): Style => (isSentinel(readLook()) ? "sentinel" : "matrix");
  const [style, setStyle] = useState<Style>(family);
  useEffect(() => onLookChange(() => setStyle(family())), []);
  const option = (s: Style) => (
    <button className="look-opt" type="button" aria-pressed={style === s} onClick={() => saveLook(lookFor(s, isDarkLook(readLook())))}>{s}</button>
  );
  return (
    <p className="look-pick" role="group" aria-label="Theme">
      <span className="look-lead" aria-hidden="true">theme</span>{option("matrix")}<Sep />{option("sentinel")}
    </p>
  );
}


/** The strip, the same on every public screen. A walkthrough plays on its own, so it offers no theme choice or report links */
export function PublicFooter() {
  return (
    <footer className="pub-foot">
      <div className="legal">
        <div className="foot-meta">
          <OutLink href="/">neon1.tech</OutLink>
          {!LIVE && <LookPick />}
        </div>
        <span className="owner">© {new Date().getFullYear()} neon1 LLC, New York<Sep /><a href="/knowledge/company/registration/">state registration</a></span>
        <nav className="pub-links" aria-label="1NEON public pages">
          <span className="policies">
            <Link to="/faqs" viewTransition>FAQs</Link><Sep /><Link to="/example" viewTransition>Sample project</Link><Sep /><Link to="/agreement" viewTransition>Service agreement</Link>
          </span>
          <span className="sep pub-join" aria-hidden="true">\</span>
          <span className="policies">
            <Link to="/privacy" viewTransition>Privacy</Link><Sep /><Link to="/cookies" viewTransition>Cookies</Link><Sep /><Link to="/terms" viewTransition>Terms</Link>
          </span>
        </nav>
        <ReportBug kind="corner" />
      </div>
    </footer>
  );
}
