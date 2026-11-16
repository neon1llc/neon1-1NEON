// apps/web/src/components/BugReport.tsx - "report a bug": an external link to neon1.tech/report-bug in a new tab, with the
// northeast arrow, from the menu, the profile, Settings, and the public screens. The page and its form live on the site.
// Never in a walkthrough, which plays on its own and links nowhere.


import { Icon } from "./ui.tsx";
import { LIVE } from "../lib/api.ts";


export const REPORT_BUG = "https://neon1.tech/report-bug";


// The bug's line drawing, the menu icons' grid and stroke, for the places without an icon box
function BugGlyph() {
  return (
    <svg className="bug-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7.5a3 3 0 0 1 6 0M8 9h8v6a4 4 0 0 1-8 0zM12 9v10M8 12H4M16 12h4M8.5 16.5 5 18.5M15.5 16.5 19 18.5M9 5 7.5 3.5M15 5l1.5-1.5" /></svg>
  );
}


/** The entry. `row` is the menu's own look (icon box, label), `link` a plain word for a line of links, `button` a bordered
 * button for the profile and Settings */
export function ReportBug({ kind = "link" }: { kind?: "row" | "link" | "button" }) {
  if (LIVE) return null;
  const arrow = <span className="out-arrow" aria-hidden="true">↗</span>;
  const props = { href: REPORT_BUG, target: "_blank", rel: "noopener noreferrer", title: "Opens in a new tab" } as const;
  return kind === "row" ? (
    <a className="out bug-link bug-row" {...props}><Icon name="bug" /><span className="lbl">report a bug{arrow}</span></a>
  ) : kind === "button" ? (
    <a className="out btn btn-ghost bug-link" {...props}><BugGlyph />report a bug{arrow}</a>
  ) : (
    <a className="out bug-link" {...props}><BugGlyph />report a bug{arrow}</a>
  );
}
