// apps/web/src/components/BugReport.tsx - "report a bug": a link to the site's /report-bug and /feedback pages (the same origin, so dev opens dev's and production opens production's) in a new tab, with the
// northeast arrow, from the menu, the profile, Settings, and the public screens. The page and its form live on the site.
// Never in a walkthrough, which plays on its own and links nowhere.


import { DEMO, LIVE } from "../lib/api.ts";


// "Feedback" is its sibling: the site's /feedback page, for comments, complaints, and concerns, opened the same way
export const sendFeedback = () => `/feedback/?from=${DEMO ? "demo" : "1neon"}`;


// ?from= tells the page where the reader came from; no noreferrer, since the page also reads document.referrer
export const reportBug = () => `/report-bug/?from=${DEMO ? "demo" : "1neon"}`;


// The bug's line drawing, the one the site's footer link uses (16px grid, outline, currentColor)
function BugGlyph() {
  return (
    <svg className="bug-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.2V4a2.5 2.5 0 0 1 5 0v1.2M4.4 6.2h7.2v3.6a3.6 3.6 0 0 1-7.2 0zM8 6.4v7M1.8 7.6l2.6.9M14.2 7.6l-2.6.9M2.2 12.2l2.5-1.2M13.8 12.2 11.3 11" /></svg>
  );
}


// The speech bubble, the site footer's drawing for feedback (16px grid, outline, currentColor)
function FeedbackGlyph() {
  return (
    <svg className="bug-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h11v7.2H8.4L5.2 13v-2.8H2.5zM5.4 5.8h5.2M5.4 7.6h3.2" /></svg>
  );
}


/** The entry. `row` is the menu's own look (icon box, label), `link` a plain word for a line of links, `button` a bordered
 * button for the profile and Settings, `corner` the lowercase link fixed at the bottom right of the sign-in and sign-up screens */
export function ReportBug({ kind = "link" }: { kind?: "row" | "feedbackRow" | "link" | "button" | "buttons" | "corner" }) {
  if (LIVE) return null;
  const arrow = <span className="out-arrow" aria-hidden="true" />;
  const props = { href: reportBug(), target: "_blank", rel: "noopener", title: "Opens in a new tab" } as const;
  const fprops = { href: sendFeedback(), target: "_blank", rel: "noopener", title: "Opens in a new tab" } as const;
  return kind === "row" ? (
    <a className="out bug-link bug-row" {...props}><span className="ico" aria-hidden="true"><BugGlyph /></span><span className="lbl">Report a bug{arrow}</span></a>
  ) : kind === "feedbackRow" ? (
    <a className="out bug-link bug-row" {...fprops}><span className="ico" aria-hidden="true"><FeedbackGlyph /></span><span className="lbl">Feedback{arrow}</span></a>
  ) : kind === "corner" ? (
    // "report" leads both links, a plain muted word, as on the site's footer: "report bug \ feedback"
    <span className="bug-corner">
      <span className="bug-lead">report</span>
      <a className="out bug-link" {...props} aria-label="report a bug"><BugGlyph />bug{arrow}</a>
      <span className="bug-sep" aria-hidden="true">\</span>
      <a className="out bug-link" {...fprops} aria-label="report feedback"><FeedbackGlyph />feedback{arrow}</a>
    </span>
  ) : kind === "buttons" ? (
    <span className="bug-buttons">
      <a className="out btn btn-ghost bug-link" {...props}><BugGlyph />Report a bug{arrow}</a>
      <a className="out btn btn-ghost bug-link" {...fprops}><FeedbackGlyph />Feedback{arrow}</a>
    </span>
  ) : kind === "button" ? (
    <a className="out btn btn-ghost bug-link" {...props}><BugGlyph />Report a bug{arrow}</a>
  ) : (
    <a className="out bug-link" {...props}><BugGlyph />Report a bug{arrow}</a>
  );
}
