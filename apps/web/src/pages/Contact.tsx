// apps/web/src/pages/Contact.tsx - Every way to reach neon1 from inside 1NEON, for any account (a new
// account included): email, call or text, and a booked call, and the website's form. Plain links, so each opens the person's own
// mail, phone, or calendar app. Writing in a project stays the best place for anything about that project.


import { Link } from "react-router";
import { OutLink } from "../components/OutLink.tsx";
import { useTopBar } from "../components/Shell.tsx";
import { BOOK_A_CALL } from "../lib/prospect.ts";


// The contact form on the website, where a need can be written out without an account
const SITE_CONTACT = "/#contact";


// The same numbers and address the neon1.tech site shows
export const CONTACT = {
  email: "hello@neon1.tech",
  phone: "+14243263661",
  // The number as people read and dial it; the letters spell the business name
  phoneLabel: "(424) 32-neon1",
  phoneDigits: "(424) 326-3661",
} as const;


/** The contact page: one row per way in, then when I answer */
export function ContactPage() {
  useTopBar(<span>Contact</span>, []);
  return (
    <>
      <h1 className="page-title">Contact neon1</h1>
      {/* Two cards side by side on a wide screen: the ways in, then when to expect an answer */}
      <div className="cols2">
        <section className="card contact-ways">
          <h2 className="card-h">Ways to reach me</h2>
          <dl className="facts">
            <div><dt>Message me here</dt><dd><Link to="/chat">Chat in 1NEON</Link></dd></div>
            <div><dt>Email</dt><dd><OutLink href={`mailto:${CONTACT.email}`}>{CONTACT.email}</OutLink></dd></div>
            <div><dt>Call or text</dt><dd><OutLink href={`tel:${CONTACT.phone}`} title={CONTACT.phoneDigits}>{CONTACT.phoneLabel}</OutLink> <span className="muted small">{CONTACT.phoneDigits}</span></dd></div>
            <div><dt>Write it out</dt><dd><OutLink href={SITE_CONTACT}>Send a message</OutLink></dd></div>
            <div><dt>Talk it through</dt><dd><OutLink href={BOOK_A_CALL}>Book a 30-minute call</OutLink></dd></div>
          </dl>
        </section>
        <section className="card contact-ways">
          <h2 className="card-h">When I answer</h2>
          <p style={{ margin: 0 }}>Monday to Thursday 6pm to 9pm, Friday 6pm to 8pm, and weekends 8am to 8pm, Eastern time, usually within a day.</p>
          <p className="muted small">About a project? Write in the project itself. More answers in the <Link to="/faqs">FAQs</Link>.</p>
        </section>
      </div>
    </>
  );
}
