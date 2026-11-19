// apps/web/src/pages/Contact.tsx - Every way to reach neon1 from inside 1NEON, for any account (a new
// account included): email, call or text, and a booked call. Plain links, so each opens the person's own
// mail, phone, or calendar app. Writing in a project stays the best place for anything about that project.


import { Link } from "react-router";
import { OutLink } from "../components/OutLink.tsx";
import { useTopBar } from "../components/Shell.tsx";
import { BOOK_A_CALL } from "../lib/prospect.ts";


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
      <p className="lead">Reach me whichever way suits you.</p>
      {/* Two cards side by side on a wide screen: the ways in, then when to expect an answer */}
      <div className="cols2">
        <section className="card contact-ways">
          <h2 className="card-h">Ways to reach me</h2>
          <dl className="facts">
            <div><dt>Email</dt><dd><OutLink href={`mailto:${CONTACT.email}`}>{CONTACT.email}</OutLink></dd></div>
            <div><dt>Call or text</dt><dd><OutLink href={`tel:${CONTACT.phone}`} title={CONTACT.phoneDigits}>{CONTACT.phoneLabel}</OutLink> <span className="muted small">{CONTACT.phoneDigits}</span></dd></div>
            <div><dt>Talk it through</dt><dd><OutLink href={BOOK_A_CALL}>Book a free 30-minute call</OutLink></dd></div>
          </dl>
        </section>
        <section className="card contact-ways">
          <h2 className="card-h">When I answer</h2>
          <p style={{ margin: 0 }}>Weekends 8am to 8pm and weekday evenings 6pm to 9pm, Eastern time, usually within a day.</p>
          <p className="muted small">About a project? Write in the project itself, so everything stays together. More answers in the <Link to="/faqs">FAQs</Link>.</p>
        </section>
      </div>
    </>
  );
}
