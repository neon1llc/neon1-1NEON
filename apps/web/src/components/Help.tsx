// apps/web/src/components/Help.tsx - Guidance: the welcome tour on first sign-in, the "?" help
// sheet on every page, and the short spotlight tours both start. Tours use driver.js (MIT).


import { nameProblem, type User } from "@1neon/domain";
import { useQueryClient } from "@tanstack/react-query";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { api } from "../lib/api.ts";
import type { Me, OrgResponse } from "../lib/types.ts";
import { Dialog } from "./ui.tsx";
import { lessMotion } from "../lib/motion.ts";
import { limitedProspect } from "../lib/prospect.ts";


// --- What each page is for --------------------------------------------------------


/** One step of a spotlight tour: the element it points at (by data-tour name) and two short lines */
export interface Step {
  at: string;
  title: string;
  text: string;
}


/** A page's guidance: what it's for in one line, a few how-tos, and its spotlight tour */
interface Guide {
  title: string;
  purpose: string;
  howto: string[];
  tour: Step[];
}


// The pages that have guidance; every signed-in route maps to one
export type PageKey = "home" | "board" | "projects" | "project" | "newproject" | "layer" | "people" | "files" | "settings" | "me" | "contact" | "all" | "proposal" | "invoice" | "agreement" | "prospects" | "needs" | "execute" | "observe" | "normalize";


// Plain words, one idea per line. The tours point at data-tour names that pages put on their elements
export const GUIDES: Record<PageKey, Guide> = {
  home: {
    title: "Home",
    purpose: "Your starting point: what needs you, and what changed lately.",
    howto: ["Needs you lists what's waiting on you, most pressing first.", "While a decision waits on you, email reminds you after 3 and 7 business days.", "With projects waiting for an assessment, ask for one under Next step.", "On the calendar, choose a day to see it. Editors can add leave, closures, meetings, and care plan dates.", "View groups the cards: To do, Movement, Visuals, and Shortcuts. Each card's badges count what it holds: red is urgent, amber suggested, green to know. The View button totals them, as shown out of total when some are hidden.", "Visuals holds the charts: finished per week, project health, and delivery (open work, on-time rate, days to decide, measures at target). Hover a number for how it's counted.", "Arrange, under View: hold a card to move it, drag its edge or corner to resize, or open its gear for its sizes and Hide. Tidy up repacks everything. Your layout follows you to any device."],
    tour: [
      { at: "next-step-ask", title: "Next step", text: "Outline a project, then ask for an assessment of up to three. Add a note, then send. You can edit or withdraw it until it goes." },
      { at: "needs-you", title: "Needs you", text: "Things waiting on you: approvals, tasks, and files to send. Open one to act on it." },
      { at: "coming-up", title: "Calendar", text: "Work due, milestones, targets, and your events. Choose a day to see or add. Past, Overdue, Upcoming, and Repeated open below." },
      { at: "glance", title: "Projects at a glance", text: "Each project's stage, health, progress, late work, and what's next." },
      { at: "weekly", title: "Finished per week", text: "Items finished each week for the last eight weeks." },
      { at: "get-to-know", title: "Get to know 1NEON", text: "A way to message me, a sample project, a walkthrough, the demo, and the FAQs. Hide it when you're done." },
      { at: "get-started", title: "Get started", text: "A short setup checklist. It goes away when done." },
      { at: "activity", title: "Recent activity", text: "What people did lately, newest first, with each edit's changes." },
    ],
  },
  board: {
    title: "Board",
    purpose: "Every project as a card, in the stage it's in right now.",
    howto: ["Editors and admins drag a card or use its Move to menu.", "Moving past Decide without an approved option asks for a reason."],
    tour: [
      { at: "board-column", title: "Stages", text: "Columns run left to right, from the first call to care after handover." },
      { at: "board-card", title: "Projects", text: "Hold a card to move it to another stage, or open it to see the work." },
    ],
  },
  projects: {
    title: "Projects",
    purpose: "Every project, as a list or a timeline.",
    howto: ["Switch between List and Timeline.", "Search, filter by layer, or sort the list.", "Editors and admins start a New project, and archive or restore one from its row menu."],
    tour: [
      { at: "new-project", title: "New project", text: "Answer a few questions to start with the right checklist." },
      { at: "project-list", title: "Your projects", text: "Each row shows the stage, health, and target date." },
    ],
  },
  project: {
    title: "Project",
    purpose: "One project, seen the way you work: a shared page, a board, a timeline, or NEON's steps.",
    howto: ["Pick how to look at it: Page to write together, Board to move cards, Timeline to plan by dates, Steps for NEON. Everyone sees the same work, and your pick is remembered.", "Start with Next step.", "Each layer tab has its own help. Tap an item's title for its status, owner, due date, details, and comments.", "Until a decision, Ready for Execute shows what's left to outline. Everything in it is optional.", "Editors and admins set health and post updates under How is it going?", "A client admin names the decision maker under People."],
    tour: [
      { at: "lenses", title: "Ways to look at it", text: "Page, Board, Timeline, or Steps. Same work, your choice." },
      { at: "next-step", title: "Next step", text: "What has to happen now, and who it's waiting on." },
      { at: "readiness", title: "Ready for Execute", text: "0 to 100% before work starts: six outline parts, the assessment, options, and a decision." },
      { at: "stage", title: "Stage", text: "Where the project is. It moves on when this stage's work is done." },
      { at: "layers", title: "The four layers", text: "Needs: what's wanted. Execute: the work. Observe: the results. Normalize: making it last." },
    ],
  },
  needs: {
    title: "Needs",
    purpose: "What's wanted, the options, and the decision.",
    howto: ["Anyone here can add a request and comment.", "Send a file neon1 asked for with Upload beside it.", "Compare options, then Read the proposal for the full terms. A quick fix has one quote instead.", "To approve, type your name as your signature. That's for the decision maker, or a client admin if none is named, once your organization signs the service agreement."],
    tour: [{ at: "next-step", title: "Next step", text: "What has to happen now, and who it's waiting on." }, { at: "layers", title: "The four layers", text: "Needs, Execute, Observe, and Normalize. Overview sums them up." }],
  },
  execute: {
    title: "Execute",
    purpose: "The work: tasks, purchases, hours, and invoices.",
    howto: ["Tap an item's title for its owner, due date, details, and comments.", "You buy listed purchases in your organization's name and attach the receipt. neon1 buys one only after the decision maker initials it, and bills it at cost.", "neon1 logs hours. On an estimate, they're shown against its range.", "Open an invoice to read, print, or pay it, or to dispute part of it.", "Delivery and review shows the handover, your review date, the defect period, and anything neon1 is waiting on."],
    tour: [{ at: "next-step", title: "Next step", text: "What has to happen now, and who it's waiting on." }, { at: "layers", title: "The four layers", text: "Needs, Execute, Observe, and Normalize. Overview sums them up." }],
  },
  observe: {
    title: "Observe",
    purpose: "Whether it worked: measures, checks, and incidents.",
    howto: ["Editors and admins add a dated reading to a measure, shown against its starting number and target.", "Tick a check once it's tested."],
    tour: [{ at: "next-step", title: "Next step", text: "What has to happen now, and who it's waiting on." }, { at: "layers", title: "The four layers", text: "Needs, Execute, Observe, and Normalize. Overview sums them up." }],
  },
  normalize: {
    title: "Normalize",
    purpose: "Handover, training, and care.",
    howto: ["Tick handover steps as they're done.", "When neon1 records the handover, please review within 10 business days. The decision maker signs once to accept, and silence never counts as acceptance. Check it and accept takes one step early.", "How did it go? is optional. neon1 quotes it only if you tick the box, without names."],
    tour: [{ at: "next-step", title: "Next step", text: "What has to happen now, and who it's waiting on." }, { at: "layers", title: "The four layers", text: "Needs, Execute, Observe, and Normalize. Overview sums them up." }],
  },
  newproject: {
    title: "New project",
    purpose: "Start a project with a few questions.",
    howto: ["First pick how the work runs, lightest first: a Workbench, a quick fix, a proposal, or NEON. The four boxes show how involved each is.", "A proposal or NEON then asks what kind of work it is. That sets the key and the starter items, all editable.", "Only the name is required.", "Add a measure, with where it is now and where it should be, to show the before and after."],
    tour: [{ at: "wizard", title: "A few questions", text: "You can change everything later." }],
  },
  layer: {
    title: "Layer",
    purpose: "One layer of the work, across every project.",
    howto: ["Projects are grouped by their stage in this layer, with the rest below.", "Open a project to change its items."],
    tour: [{ at: "layer-list", title: "Across projects", text: "What this layer covers. Below, projects by stage." }],
  },
  people: {
    title: "People",
    purpose: "Who's in this organization, and what each person can do.",
    howto: ["Admins invite by email, resend an invitation, change access, and deactivate or reactivate people.", "Inviting and access changes ask you to confirm it's you.", "A suspended account reads only. Its owner, or an admin, can ask to recommission it."],
    tour: [
      { at: "invite", title: "Invite people", text: "Type their email. They get a link and sign in with a code." },
      { at: "people-list", title: "Access", text: "Change what someone can do, or deactivate them." },
    ],
  },
  files: {
    title: "Files",
    purpose: "Every file shared in this organization.",
    howto: ["Choose where to file before you upload: the organization, a project, or one of its layers.", "Up to 100 MB each.", "To write instead, open Pages with the pen at the top. A page can be saved here as a copy.", "Move refiles a file. Whoever uploaded it, or an admin, can delete it.", "To mark up a proposal, upload your edited Word copy here."],
    tour: [{ at: "upload", title: "Upload", text: "Drop a file here, or choose one." }],
  },
  settings: {
    title: "Settings",
    purpose: "Your organization: its details, agreement, data, and board stages.",
    howto: ["See your organization's details. Admins can change where it's based, its website, and its LinkedIn company page.", "Read the service agreement and see your case study and client list choices.", "Admins download a copy of everything under Your data.", "Admins rename, reorder, limit, and hide board stages, then Save workflow."],
    tour: [{ at: "stages", title: "Stages", text: "Each row is a column on the board, in order." }],
  },
  me: {
    title: "Your profile",
    purpose: "Your details, preferences, notifications, security, and sign out.",
    howto: ["Add your LinkedIn, business page, and website, if you like. People in your organizations see them.", "Most changes save by themselves. Phone and text settings have their own Save.", "Choose what reaches you by email or text under Notifications.", "Add a passkey, authenticator app, or text codes under Security. Admin actions need one.", "Under Help, replay the tour or bring back Get to know 1NEON. Sign out is below."],
    tour: [{ at: "passkey", title: "Two-step verification", text: "Add a passkey, authenticator app, or text codes. Admins need one to manage people and settings." }],
  },
  contact: {
    title: "Contact",
    purpose: "Chat, email, call or text, send a message, or book a call.",
    howto: ["Chat is shared with everyone in your organization. Turn on private to keep a message between you and me.", "Write about a project in that project, so it stays together."],
    tour: [],
  },
  all: {
    title: "All clients",
    purpose: "Every client's projects on one read-only board.",
    howto: ["Switch between By organization and One board.", "Open a client to make changes. Archived projects are left out."],
    tour: [{ at: "board-column", title: "Read only", text: "Look across clients here. Changes happen inside each client." }],
  },
  proposal: {
    title: "Proposal",
    purpose: "The proposal or quote as one document.",
    howto: ["You can read a draft. Approval opens once neon1 issues it, and earlier revisions stay readable.", "Print or save as PDF. An issued proposal also downloads as Word.", "To suggest changes, comment on the option or quote.", "Approve on the project's Needs tab."],
    tour: [],
  },
  invoice: {
    title: "Invoice",
    purpose: "What's billed, what's paid, and what's left.",
    howto: ["Pay online by bank transfer or card. 1NEON never sees your card or bank details.", "For check, Zelle, or wire, put the invoice number in the memo.", "If a line looks wrong, choose Dispute part of this invoice. The rest stays due on its date.", "Print or save it as a PDF. Once it's paid in full, it's your receipt."],
    tour: [],
  },
  agreement: {
    title: "Service agreement",
    purpose: "neon1's terms for all work with your organization.",
    howto: ["An admin signs at the bottom with a typed name, before the first approval, giving the legal name and mailing address.", "Choose about anonymized case studies and neon1's client list. Nothing is selected for you.", "An admin can change either choice later on this page.", "Signatures lists each signature and its edition, with a copy to download."],
    tour: [],
  },
  prospects: {
    title: "Potentials",
    purpose: "Free accounts and clients you made potentials, with recommission requests and every suspension above them.",
    howto: ["Promote makes one a client. You can also suspend, keep, or delete an account, and pause sign-up.", "Recommission lifts a suspension; Set aside closes a request without lifting it.", "The chat inbox here lists potentials only."],
    tour: [],
  },
};


// A free account's own people see less on these pages, so their help differs
export const FREE: Partial<Record<PageKey, { purpose?: string; howto: string[] }>> = {
  home: { howto: ["Outline up to three projects, then ask for an assessment under Next step.", "On the calendar, choose a day to see it or add to it.", "Your account shows how long it's kept, with Keep it 30 more days and Download a copy.", "View shows or hides any card; Arrange moves and resizes them; Tidy up repacks them."] },
  project: { howto: ["Pick how to look at it: Page, Board, Timeline, or Steps. Everyone sees the same work.", "Start with Next step.", "Each layer tab has its own help. Tap an item's title for its status, owner, due date, details, and comments.", "Ready for Execute shows what's left to outline. Everything in it is optional.", "Set health and post updates under How is it going?"] },
  needs: { purpose: "What's wanted.", howto: ["Add requests and the details behind them. Tap an item's title to comment.", "Options and approvals start once we're working together."] },
  execute: { purpose: "The work: tasks, milestones, and changes.", howto: ["Tap an item's title for its owner, due date, details, and comments."] },
  normalize: { howto: ["Tick handover steps as they're done."] },
  people: { howto: ["Inviting people starts once we're working together."] },
  files: { howto: ["Choose where to file before you upload: the organization, a project, or one of its layers.", "10 files, 10 MB each and 50 MB in all.", "Whoever uploaded a file, or an admin, can delete it."] },
  settings: { purpose: "Your organization: its details, data, and board stages.", howto: ["Admins can change where it's based, its website, and its LinkedIn company page.", "Admins download a copy of everything under Your data.", "Board stages open up once we're working together."] },
};


/** The guide for the page at this path */
export function pageKey(path: string): PageKey {
  if (path.startsWith("/all/me")) return "me";
  if (path.startsWith("/all/contact")) return "contact";
  if (path.startsWith("/all/prospects")) return "prospects";
  if (path.startsWith("/all")) return "all";
  if (path.startsWith("/me")) return "me";
  if (path.startsWith("/contact")) return "contact";
  if (/\/projects\/new$/.test(path)) return "newproject";
  if (/\/projects\/[^/]+\/proposal$/.test(path)) return "proposal";
  if (/\/projects\/[^/]+\/invoices\//.test(path)) return "invoice";
  const tab = /\/projects\/[^/]+\/(needs|execute|execution|observe|observation|normalize|next)$/.exec(path)?.[1];
  if (tab) return tab === "execution" ? "execute" : tab === "observation" ? "observe" : tab === "next" ? "normalize" : (tab as PageKey);
  if (/\/projects\/[^/]+/.test(path)) return "project";
  if (path.endsWith("/agreement")) return "agreement";
  if (path.endsWith("/projects")) return "projects";
  if (path.includes("/workflow")) return "board";
  if (path.includes("/layer/")) return "layer";
  if (path.endsWith("/people")) return "people";
  if (path.endsWith("/documents")) return "files";
  if (path.endsWith("/settings")) return "settings";
  return "home";
}


// --- Spotlight tours ---------------------------------------------------------------


/** Only steps whose element is on screen right now; phones and desktops show different elements */
function visible(steps: Step[]): DriveStep[] {
  return steps.flatMap((s) => {
    // On screen means laid out and inside the viewport; the phone menu slides its items off to the left
    const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${s.at}"]`)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
    });
    return el ? [{ element: el, popover: { title: s.title, description: s.text } }] : [];
  });
}


// The tour on screen, if any; `quiet` ends it without counting it as finished
let current: { d: ReturnType<typeof driver>; quiet: boolean } | undefined;

/** End a tour that's showing without marking it done (the walkthrough rewinding past it) */
export function endTour() {
  if (!current) return;
  current.quiet = true;
  current.d.destroy();
}

/** Run a spotlight tour: everything else is shaded, one short popover at a time */
export function runTour(steps: Step[], onDone?: () => void) {
  const list = visible(steps);
  if (!list.length) {
    onDone?.();
    return;
  }
  const d = driver({
    steps: list,
    showProgress: list.length > 1,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "n1-tour",
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 10,
    // With reduced motion the spotlight jumps instead of gliding, and the page doesn't smooth-scroll (AP-07)
    animate: !lessMotion(),
    smoothScroll: !lessMotion(),
    onDestroyed: () => {
      const was = current;
      current = undefined;
      if (!was?.quiet) onDone?.();
    },
  });
  current = { d, quiet: false };
  d.drive();
}


// The welcome tour: the frame first (menu, search, help), then this page's own steps, then where to replay it
const FRAME: Step[] = [
  { at: "nav-home", title: "Home", text: "Start here. It shows what needs you." },
  { at: "nav-board", title: "Board", text: "Every project, in the stage it's in." },
  { at: "nav-projects", title: "Projects and files", text: "Each project keeps its needs, work, results, and files together." },
  { at: "nav-layers", title: "N E O N", text: "Needs, Execute, Observe, Normalize: the four layers of every project." },
  { at: "menu", title: "Menu", text: "Every page and the four layers. Choose Mini on your profile to keep the menu's icons on screen." },
  { at: "search", title: "Search", text: "Jump to any page or project, or start something new." },
  { at: "help", title: "Help", text: "Tap ? on any page for a short guide to it." },
];
const LAST: Step = { at: "help", title: "You're set", text: "Replay this tour anytime from ? or from your profile." };


// --- Help sheet, welcome dialog, and the context that opens them ------------------


// Opens the help sheet and starts the welcome tour from anywhere in the frame
const HelpCtx = createContext<{ open: () => void; welcomeTour: () => void }>({ open: () => undefined, welcomeTour: () => undefined });
export const useHelp = () => useContext(HelpCtx);


/** Provides the "?" sheet and the welcome tour, and offers the tour once per sign-in until it's done */
export function HelpProvider({ me, children }: { me: Me; children: ReactNode }) {
  const qc = useQueryClient();
  const loc = useLocation();
  const [sheet, setSheet] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const key = pageKey(loc.pathname);

  // The person's tour choice is kept with their account, so it follows them to every device
  const [name, setName] = useState("");
  const [nameLeft, setNameLeft] = useState(false);
  const saveTour = useCallback(async (tour: NonNullable<User["tour"]>) => {
    const cur = qc.getQueryData<Me>(["me"]) ?? me;
    // A name typed in the welcome dialog is saved with the choice, so people show by name to others
    const named = !cur.user.name && name.trim() && !nameProblem(name, { neon1: cur.operator }) ? { name: name.trim() } : {};
    try {
      const user = await api<User>("/me", { method: "PATCH", body: { version: cur.user.version, tour, ...named } });
      qc.setQueryData(["me"], { ...cur, user });
    } catch {
      // Not saved: the offer simply comes back next time
    }
  }, [me, qc, name]);

  // The whole tour; finishing or closing it counts as done, since ? brings it back
  const welcomeTour = useCallback(() => {
    setSheet(false);
    setWelcome(false);
    setTimeout(() => runTour([...FRAME, ...GUIDES[key].tour, LAST], () => void saveTour("done")), 250);
  }, [key, saveTour]);

  // Offer the tour once per browser session while it's new or postponed
  useEffect(() => {
    if (me.user.tour === "done") return;
    try {
      if (sessionStorage.getItem("1neon.tour-offered")) return;
    } catch {
      // No storage: offer it anyway
    }
    // The flag is set when the offer shows, so a remount before then doesn't swallow it
    const t = setTimeout(() => {
      try { sessionStorage.setItem("1neon.tour-offered", "1"); } catch { /* no storage */ }
      setWelcome(true);
    }, 700);
    return () => clearTimeout(t);
  }, [me.user.tour]);

  const value = useMemo(() => ({ open: () => setSheet(true), welcomeTour }), [welcomeTour]);
  // The organization in the address, once loaded, says whether this person sees the free-account page
  const orgId = me.orgs.find((o) => o.slug === /^\/o\/([^/]+)/.exec(loc.pathname)?.[1])?.id;
  const nameError = name.trim() ? nameProblem(name, { neon1: me.operator }) : undefined;
  const free = limitedProspect(orgId ? qc.getQueryData<OrgResponse>(["org", orgId])?.org : undefined, me.operator);
  const g = { ...GUIDES[key], ...(free ? FREE[key] : undefined) };
  return (
    <HelpCtx.Provider value={value}>
      {children}
      {/* The help sheet: what this page is for, a few how-tos, and its tour */}
      <Dialog open={sheet} onClose={() => setSheet(false)} label={`Help: ${g.title}`} className="sheet">
        {/* A visible way out beside Escape and the backdrop (AP-03); the dialog returns focus to the ? button */}
        <button type="button" className="icon-btn sheet-close" onClick={() => setSheet(false)} aria-label="Close help" style={{ float: "right" }}>×</button>
        <p className="eyebrow">Help · {g.title}</p>
        <h2>{g.purpose}</h2>
        <ul className="howto">{g.howto.map((h) => <li key={h}>{h}</li>)}</ul>
        <div className="actions">
          {g.tour.length > 0 && <button className="btn btn-primary" onClick={() => { setSheet(false); setTimeout(() => runTour(g.tour), 250); }}>Tour this page</button>}
          <button className="btn btn-ghost" onClick={welcomeTour}>Full tour</button>
        </div>
        <p className="small muted"><Link to="/faqs" onClick={() => setSheet(false)}>FAQs</Link> · <Link to={loc.pathname.startsWith("/all/") ? "/all/contact" : "/contact"} onClick={() => setSheet(false)}>Contact neon1</Link> · <Link to="/example" onClick={() => setSheet(false)}>Sample project</Link> · <a href="/1NEON/live">Walkthrough</a></p>
      </Dialog>
      {/* First sign-in: offer the tour, with remind-me and skip */}
      <Dialog open={welcome} onClose={() => setWelcome(false)} label="Welcome to 1NEON">
        <p className="eyebrow">Welcome to 1NEON</p>
        <h2>New here? Take the 1-minute tour.</h2>
        {!me.user.name && (
          <div style={{ margin: "12px 0" }}>
            <label htmlFor="welcome-name">Your name</label>
            <input id="welcome-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="First and last name" onBlur={() => setNameLeft(true)} onFocus={() => setNameLeft(false)} aria-invalid={nameLeft && nameError ? true : undefined} aria-describedby={nameLeft && nameError ? "welcome-name-error" : undefined} />
            {nameLeft && nameError && <p className="small field-error" id="welcome-name-error" role="status">{nameError}</p>}
          </div>
        )}
        <div className="actions stack-sm">
          <button className="btn btn-primary" onClick={() => (nameError ? setNameLeft(true) : welcomeTour())}>Start the tour</button>
          <button className="btn btn-ghost" onClick={() => { setWelcome(false); void saveTour("later"); }}>Remind me next time</button>
          <button className="btn btn-ghost" onClick={() => { setWelcome(false); void saveTour("done"); }}>Skip</button>
        </div>
        <p className="small muted">You can replay it anytime from <b>?</b> at the top right, or from your profile.</p>
      </Dialog>
    </HelpCtx.Provider>
  );
}
