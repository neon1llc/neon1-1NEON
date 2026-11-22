// apps/web/src/components/PublicFooter.tsx - The foot of 1NEON's public pages (the sample project, FAQs, and the legal documents): the public pages and policies in one row, and the way back to neon1.tech. The signed-in portal has none.


import { Link } from "react-router";
import { OutLink } from "./OutLink.tsx";


/** The row of public 1NEON pages, the same on every page that shows it */
export function PublicFooter() {
  return (
    <footer className="pub-foot small muted">
      <nav aria-label="1NEON public pages">
        <Link to="/faqs" viewTransition>FAQs</Link> · <Link to="/example" viewTransition>Sample project</Link> · <Link to="/cookies" viewTransition>Cookies</Link> · <Link to="/privacy" viewTransition>Privacy</Link> · <Link to="/terms" viewTransition>Terms</Link> · <Link to="/agreement" viewTransition>Service agreement</Link>
      </nav>
      <p>1NEON is neon1's client portal. <OutLink href="/">neon1.tech</OutLink></p>
    </footer>
  );
}
