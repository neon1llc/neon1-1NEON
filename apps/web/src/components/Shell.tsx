// apps/web/src/components/Shell.tsx - App frame: sign-in gate, sidebar with the organization
// chooser, top bar, and the org context.


import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useMenuFit, useTapOutside } from "../lib/menufit.ts";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useNavigationType, useParams } from "react-router";
import { menuOf, PROSPECT_FINAL_DAYS, PROSPECT_GRACE_DAYS, PROSPECT_LIMITS } from "@1neon/domain";
import { api, DEMO as IN_DEMO, LIVE as IN_LIVE, devUser, HttpError, pickPerson, resetDemo, Unconfirmed } from "../lib/api.ts";
import { failureOf, read } from "../lib/reads.ts";
import { passkeyAssertion } from "../lib/passkey.ts";
import { SIGN_IN_METHODS } from "../lib/methods.ts";
import { drew, fade, lessMotion } from "../lib/motion.ts";
import { REWIND } from "../lib/nav.ts";
import { useEntryScroll } from "../lib/scrollmemory.ts";
import { useLandOnHash } from "../lib/land.ts";
import { usePersisting } from "../lib/persist.ts";
import { cleanCode, clearStep, loadStep, saveStep, session } from "../lib/signin.ts";
import type { Me, OrgResponse, OrgSummary } from "../lib/types.ts";
import { limitedProspect, prospectEverywhere } from "../lib/prospect.ts";
import { Bell } from "./Bell.tsx";
import { Offline } from "./Glitch.tsx";
import { Rain } from "./Rain.tsx";
import { PublicBar } from "./PublicBar.tsx";
import { PublicFooter } from "./PublicFooter.tsx";
import { useSiteTheme } from "../lib/sitetheme.ts";
import { paintTheme, setAccountTheme, watchTheme } from "../lib/themepaint.ts";
import { isSentinel, isDarkLook, lookFor, normalizeLook, onLookChange, resolveTheme, saveLook, sharedThemeChoice, styleChoice } from "../lib/style.ts";
import { FileText as FileIcon, Folder as FolderIcon, Home as HomeIcon, Kanban as KanbanIcon, Menu as MenuIcon, Moon, Search as SearchIcon, Sun } from "lucide-react";
import { ConfirmDialog } from "./Confirm.tsx";
import { HelpProvider, useHelp } from "./Help.tsx";
import { Neo } from "./Neo.tsx";
import { WriteProvider } from "./Write.tsx";
import { PublicTalk } from "./PublicTalk.tsx";
import { ReportBug } from "./BugReport.tsx";
import { usePreviewedMenu } from "../lib/preview.ts";
import { SuspendBar } from "./Suspend.tsx";
import { useProspectEverywhere } from "./Prospect.tsx";
import { Palette } from "./Palette.tsx";
import { SignOutButton } from "./SignOutButton.tsx";
import { SignUp } from "./SignUp.tsx";
import { gate, Stale, type Read } from "./Reads.tsx";
import { Arr, Avatar, Icon, initials, LayerBadge, LAYERS, layerHint, layerName, layerSlug, Rings, useAsk } from "./ui.tsx";
import { prefs } from "../lib/prefs.ts";
import type { SignUpInfo } from "../lib/signup.ts";
import { Wm } from "./Wordmark.tsx";


// --- Session -----------------------------------------------------------------


/** The signed-in person and their organizations; a 401 here means "show sign-in" */
export function useMe() {
  // A dropped connection (common on phones waking up) is retried a few times; an HTTP answer is final
  return useQuery({ queryKey: ["me"], queryFn: () => read<Me>("/me", { user: "object", orgs: "array" }), retry: (n, e) => !(e instanceof HttpError) && n < 4, retryDelay: (n) => Math.min(800 * 2 ** n, 6000) });
}


// Session context for everything below Root
const MeCtx = createContext<Me | null>(null);
// Only valid inside Root, after sign-in
export const useSession = () => useContext(MeCtx)!;


// The theme is painted by lib/themepaint.ts from the one saved choice (lib/style.ts); this file only tells it who is signed in
watchTheme();


/** Top-level gate: sign-in, error, first-visit redirect, then the app */
// Whether this browser was last signed in or out, for the background shown while the session loads
const LAST_KEY = "1neon.last";
// Whether sign-up was open at this browser's last look, so the sign-in draws the right wording at once
const SIGNUP_KEY = "1neon.signup";
const SIGNUP_SEEN = () => { const v = prefs.get(SIGNUP_KEY); return v === "open" ? true : v === "closed" ? false : undefined; };
// Remember me also keeps the email on this device, filled in next time; unticked, it's forgotten.
// Not in the demo or a walkthrough: there each sign-in types its own fictional email into an empty box
const EMAIL_KEY = "1neon.email";
const keepEmail = (email: string, remember: boolean) => { if (!IN_DEMO) prefs.set(EMAIL_KEY, remember ? email : ""); };
const keptEmail = () => (IN_DEMO ? "" : prefs.get(EMAIL_KEY) ?? "");
const lastSeen = () => {
  return prefs.get(LAST_KEY);
};


export function Root() {
  // A walkthrough rewinding to a section's start remounts everything below, fresh
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const rewind = () => setEpoch((n) => n + 1);
    addEventListener(REWIND, rewind);
    return () => removeEventListener(REWIND, rewind);
  }, []);
  return <App key={epoch} />;
}


/** The app under Root: the session check, then sign-in or the signed-in pages */
function App() {
  const me = useMe();
  // Whether this visit has shown sign-in (see below)
  const shownSignIn = useRef(false);
  const loc = useLocation();
  // Which location is on screen, for the check that keeps the page with the address (lib/motion.ts)
  useLayoutEffect(() => drew(loc.key), [loc.key]);
  const qc = useQueryClient();
  // Any call that hears 401 asks for a fresh session check; its 401 then shows sign-in below
  useEffect(() => {
    const check = () => void qc.invalidateQueries({ queryKey: ["me"] });
    addEventListener("1neon:signed-out", check);
    return () => removeEventListener("1neon:signed-out", check);
  }, [qc]);
  useEffect(() => {
    if (!me.data) { setAccountTheme(null); return; }
    // The account's theme is only the fallback until a shared choice exists, and arriving late never paints over one
    setAccountTheme(me.data.user.theme);
    paintTheme({ instant: true });
    return () => setAccountTheme(null);
  }, [me.data]);
  // First sign-in from a browser with no saved time zone: keep the browser's, so email shows times in
  // the person's own zone. Once per page load; the profile changes it, and a failure is simply skipped
  const sentZone = useRef(false);
  useEffect(() => {
    const u = me.data?.user;
    if (!u || u.timeZone || sentZone.current || IN_DEMO) return;
    sentZone.current = true;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    api("/me", { method: "PATCH", body: { version: u.version, timeZone: zone } }).then(() => qc.invalidateQueries({ queryKey: ["me"] }), () => undefined);
  }, [me.data, qc]);
  // Remember whether this browser was last signed in, so a reload starts on the right background
  useEffect(() => {
    const state = me.data ? "in" : me.error instanceof HttpError && me.error.status === 401 ? "out" : undefined;
    if (state) prefs.set(LAST_KEY, state);
  }, [me.data, me.error]);
  // Signed out on this visit: a later check (the tab regaining focus, a refresh of the session) keeps the
  // same sign-in on screen while it runs, so the form, what's typed, and the wordmark never start over
  if (me.error instanceof HttpError && me.error.status === 401) shownSignIn.current = true;
  else if (me.data) shownSignIn.current = false;
  if (me.isPending && shownSignIn.current) return <SignIn />;
  if (me.isPending) {
    // Mid sign-in (iOS often reloads the tab after a trip to the mail app): go straight back to the
    // code step while the session check runs; it hands over if the person turns out signed in
    if (loadStep(session())) return <SignIn />;
    // Arriving from the site, or last seen signed out: wait on the dark sign-in background, not a white page
    if (lastSeen() === "out") return <div className="signin" aria-busy="true" />;
    return <div className="content muted" aria-busy="true">Loading…</div>;
  }
  // An ended sign-in always shows sign-in. Any other failure keeps an app already on screen (the frame
  // marks it as not refreshed); with nothing loaded yet it's the lost-signal screen, worded for a
  // server error when the API answered at all
  if (me.error && (me.data === undefined || failureOf(me.error) === "session")) {
    if (me.error instanceof HttpError && me.error.status === 401) return <SignIn />;
    return <Offline onRetry={me.refetch} server={me.error instanceof HttpError} />;
  }
  const data = me.data!;
  // Landing on /1NEON/: the operator starts at All clients, everyone else in their first client organization
  if (loc.pathname === "/" || loc.pathname === "") {
    const first = data.orgs.find((o) => o.slug !== "neon1") ?? data.orgs[0];
    if (data.operator) return <Navigate to="/all/workflow" replace />;
    if (first) return <Navigate to={`/o/${first.slug}/workspace`} replace />;
    return <div className="content"><h1 className="page-title">1NEON</h1><p className="lead">You're signed in but not in any organization yet. Ask neon1 or your admin for an invite.</p></div>;
  }
  return (
    <MeCtx.Provider value={data}>
      <div className="wake" style={{ height: "100%" }}>
        <Outlet />
      </div>
    </MeCtx.Provider>
  );
}


// --- Sign-in -------------------------------------------------------------------


// The demo's people, each with what they can do; the buttons render in a dev build and in /1NEON/demo
const PEOPLE = [
  ["priya@harborlineoutfitters.example", "Priya Raman", "Harborline Outfitters' operations director: approves options and manages people"],
  ["tomas@harborlineoutfitters.example", "Tomas Greer", "Harborline Outfitters' inventory lead: adds requests, answers, and files"],
  ["pradeep@neon1.tech", "Pradeep", "neon1's engineer: every client, proposals, and the work"],
] as const;
// The demo signs in by picking a person; the live playback always shows the real sign-in instead
// (email, then a code from her email), answered in the browser
const PICKER = IN_DEMO && !IN_LIVE;
// Sign-up shows in the real portal and in every walkthrough, so a walkthrough's sign-in reads exactly as the
// real one does; the in-browser API answers it there (live/signin.ts). The demo's picker has no accounts to make
const SIGNUP_HERE = !PICKER;


// What the API answers at each sign-in step
export type Step = { step: "email" | "choose" | "code" | "totp" | "passkey" | "done" | "failed" | "not_invited"; methods?: ("code" | "passkey")[]; options?: unknown; wrong?: boolean };


// The wordmark's letters, each with the rest of the word it stands for
const SPELLED = [["1", "portal"], ["N", "eeds"], ["E", "xecute"], ["O", "bserve"], ["N", "ormalize"]] as const;


/** 1NEON that spells itself out on one line and folds back: once after load, then on hover, focus,
 * or tap. Its accessible name stays "1NEON", described by the full meaning */
function Wordmark() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  // Open now; with `hold`, fold back after that many milliseconds
  const show = (hold?: number) => {
    clearTimeout(timer.current);
    setOpen(true);
    if (hold) timer.current = window.setTimeout(() => setOpen(false), hold);
  };
  // Fold back now
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  // One unprompted spell-out shortly after load, skipped for reduced motion
  useEffect(() => {
    if (lessMotion()) return;
    const start = window.setTimeout(() => show(4600), 900);
    return () => { clearTimeout(start); clearTimeout(timer.current); };
  }, []);
  return (
    <>
      <h1 className={`word${open ? " open" : ""}`} tabIndex={0} aria-label="1NEON" aria-describedby="word-meaning"
        // Hover is a mouse's only: a tap on a phone fires a hover that never ends, so it opens through the
        // click's timed spell-out instead. Focus opens it only from the keyboard, for the same reason
        onPointerEnter={(e) => e.pointerType === "mouse" && show()} onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show()} onBlur={hide} onClick={() => show(4600)}>
        <span className="wm" aria-hidden="true">
          {/* The 1NEON mark beside the word, sized with it so it stays beside it when the word spells out */}
          <Rings />
          {SPELLED.map(([initial, rest], i) => (
            <span key={i} className="seg">
              <span className="init">{initial}</span>
              <span className="rest" style={{ "--n": rest.length } as CSSProperties}>{rest}</span>
            </span>
          ))}
        </span>
      </h1>
      <p id="word-meaning" className="sr">1 portal: Needs, Execute, Observe, Normalize</p>
    </>
  );
}


/** Sign-in on this page: email, then a code by email or a passkey, through the API */
function SignIn() {
  // A step saved before a reload comes back if it's still answerable
  const [saved] = useState(() => loadStep(session()));
  // Invite links carry the email, so it's filled in already
  // ...or, with Remember me, the email this device signed in with last
  const [email, setEmail] = useState(() => saved?.email ?? new URLSearchParams(location.search).get("email") ?? keptEmail());
  // ...including a link followed while this page is already open
  const { search } = useLocation();
  useEffect(() => {
    const e = new URLSearchParams(search).get("email");
    if (e) setEmail(e);
  }, [search]);
  const [code, setCode] = useState("");
  // Remember me: keep the sign-in for 30 days and the email filled in; unchecked, the sign-in ends
  // when the browser closes and the email is forgotten
  const [remember, setRemember] = useState(true);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const [at, setAt] = useState<Step>(() => (saved ? { step: saved.step, methods: saved.methods } : { step: "email" }));
  // Sign-up instead of sign-in, opened from the link below the form, or by ?signup=1 (the quiet-prospect
  // email's way back). The real portal only: the demo has no accounts to make
  const [signingUp, setSigningUp] = useState(() => !IN_DEMO && !saved && new URLSearchParams(location.search).get("signup") === "1");
  // Sign-up has its own address (/1NEON/?signup=1), so every way to it lands on that one link and Back and Forward move between it
  // and the sign-in screen: opening it adds a history entry, going back from it steps out of that entry (or, arriving by the link
  // itself, replaces the address), and finishing or restarting drops the query. The demo and walkthroughs keep their own routing
  const ownsAddress = !IN_DEMO && !IN_LIVE;
  const signupHere = () => new URLSearchParams(location.search).get("signup") === "1";
  const signupAddress = (on: boolean) => `${location.pathname}${on ? "?signup=1" : ""}${location.hash}`;
  const pushedSignup = useRef(false);
  const openSignUp = () => {
    if (ownsAddress && !signupHere()) { history.pushState(history.state, "", signupAddress(true)); pushedSignup.current = true; }
    setSigningUp(true);
  };
  const closeSignUp = () => {
    if (ownsAddress && signupHere()) {
      if (pushedSignup.current) { pushedSignup.current = false; history.back(); return; } // popstate below shows the sign-in screen
      history.replaceState(history.state, "", signupAddress(false));
    }
    setSigningUp(false);
  };
  // Back and Forward between the two addresses show the matching screen
  useEffect(() => {
    if (!ownsAddress) return;
    const follow = () => setSigningUp(!saved && signupHere());
    addEventListener("popstate", follow);
    return () => removeEventListener("popstate", follow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Whether sign-up is open, so the invitation note and the "New here?" link show only when it is.
  // Asked once by the real portal; while closed (production until neon1 opens it) neither shows
  // The last answer is kept in this browser and used at once, so the page doesn't draw the closed
  // wording and then switch; with no answer yet (a first visit) that wording waits, hidden, for it
  const [signupOpen, setSignupOpen] = useState<boolean | undefined>(() => (!SIGNUP_HERE ? false : IN_LIVE ? true : SIGNUP_SEEN()));
  // The whole answer (with Turnstile's site key) is kept too and handed to the form, so "Start a free
  // account" draws the form at once instead of "One moment…" while it asks again
  const [signupInfo, setSignupInfo] = useState<SignUpInfo | undefined>(undefined);
  useEffect(() => {
    if (!SIGNUP_HERE) return;
    let live = true;
    api<SignUpInfo>("/auth/signup").then((r) => {
      if (!live) return;
      setSignupInfo(r);
      setSignupOpen(r.open === true);
      // The walkthrough's answer is its own, never the real portal's
      if (!IN_LIVE) prefs.set(SIGNUP_KEY, r.open === true ? "open" : "closed");
    }, () => live && setSignupOpen((v) => v ?? false));
    return () => { live = false; };
  }, []);
  const [busy, setBusy] = useState(false);
  // The last call got no answer, so it may or may not have gone through
  const [unsure, setUnsure] = useState(false);
  const qc = useQueryClient();
  // The Managed Login callback sends people back here with a reason when sign-in can't finish
  const problem = at.step === "failed" || at.step === "not_invited" ? at.step : new URLSearchParams(location.search).get("signin");
  // Dev sign-in: remember the demo email and refetch everything as that person
  const pick = (e: string) => {
    devUser.set(e);
    qc.invalidateQueries();
  };
  // One round trip to the API; a passkey step prompts the browser and answers right away
  const send = async (body: object) => {
    setBusy(true);
    setUnsure(false);
    try {
      let r = await api<Step>("/auth/step", { method: "POST", body });
      if (r.step === "passkey") r = await api<Step>("/auth/step", { method: "POST", body: { op: "answer", kind: "passkey", value: await passkeyAssertion(r.options as never) } });
      setCode("");
      // Keep a step that waits on the person; finishing or failing forgets it
      if (r.step === "choose" || r.step === "code" || r.step === "totp") saveStep(session(), { email: email.trim(), step: r.step, methods: r.methods });
      else clearStep(session());
      if (r.step === "done") await qc.invalidateQueries();
      // Each step cross-fades into the next (lib/motion.ts), or switches at once with less motion
      else fade(() => setAt(r));
    } catch (e) {
      // No answer within the deadline: stay on this step with the email kept, and check the session
      // (a safe read), which hands over to the app if the sign-in did finish. Nothing is resent
      if (e instanceof Unconfirmed) {
        setUnsure(true);
        void api("/me").then(() => qc.invalidateQueries(), () => undefined);
      } else {
        clearStep(session());
        setAt({ step: "failed" });
      }
    }
    setBusy(false);
  };
  // A code link from the email: take the code from the fragment, clear it from the address, and
  // answer at once. The link only works in the browser holding the sign-in that sent the code
  const [fromLink, setFromLink] = useState(false);
  useEffect(() => {
    const m = /^#code=(\d{6,8})$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, "", location.pathname + location.search);
    setFromLink(true);
    void send({ op: "answer", kind: "code", value: m[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A fresh code was asked for, so the line above the box says so
  const [resent, setResent] = useState(false);
  // Start over with another email, forgetting the saved step
  const restart = () => { clearStep(session()); fade(() => { setAt({ step: "email" }); setCode(""); setResent(false); closeSignUp(); }); };
  // Sign-up answered like the first sign-in step: carry on at the emailed code, in the same state machine
  const signedUp = (r: Step, mail: string) => {
    keepEmail(mail, remember);
    setEmail(mail);
    setCode("");
    setResent(false);
    if (r.step === "choose" || r.step === "code" || r.step === "totp") saveStep(session(), { email: mail, step: r.step, methods: r.methods });
    fade(() => { setAt(r); pushedSignup.current = false; if (ownsAddress && signupHere()) history.replaceState(history.state, "", signupAddress(false)); setSigningUp(false); });
  };
  // Sign-in, the demo's person picker, and a walkthrough's sign-in all share neon1.tech's family and mode choices
  // (awake until picked) and the same bar: the logo on the left, the theme switch on the right
  const [look, setLook] = useSiteTheme();
  // Awake and providence are light; plugged has rain; desert of the real is dark without it (the sentinel
  // style has no rain, and the landing's choice decides which style this is)
  const awake = !isDarkLook(look);
  const rainy = look === "plugged";
  return (
    <main className={`signin${awake ? " awake" : ""}`}>
      {rainy && <Rain panes=".signin .panel, .signin .n1-logo" controls={false} />}
      {rainy && <div className="veil" />}
      <PublicBar theme={look} onChange={setLook} />
      {/* Signing up widens the panel on a wide screen, so the form fits without scrolling */}
      <div className={`panel glass${signingUp ? " signing-up" : ""}`}>
        <Wordmark />
        {/* Who this is for, worded and sized the same on the real sign-in and the demo's picker */}
        {PICKER ? (
          <>
            <h2 className="signin-h">Interactive demo</h2>
            <p className="signin-lead">A working copy of 1NEON with made-up clients. Everything you do stays in this browser.</p>
          </>
        ) : signingUp ? (
          // Sign-up: who it's for and what happens next, in place of the sign-in note
          <>
            <h2 className="signin-h">Start in 1NEON</h2>
            <p className="signin-lead">Free. Outline what your project needs, ask for an assessment, and book a 30-minute call.
              {/* Before anything is typed: the project limit and how long it's kept (Pradeep: the other limits show in use) */}
              <span className="signin-limits">Up to {PROSPECT_LIMITS.projects} projects, kept {PROSPECT_FINAL_DAYS + PROSPECT_GRACE_DAYS} days after your last change.</span>
            </p>
          </>
        ) : (
          <>
            <h2 className="signin-h">Client portal</h2>
            <p className="signin-lead" style={signupOpen === undefined ? { visibility: "hidden" } : undefined}>{signupOpen ? "Sign in to your 1NEON account. New here? Create one." : "Sign in to your 1NEON account."}</p>
          </>
        )}
        {problem === "not_invited" && <p className="notice" role="alert">That email has no invite. Ask your organization's admin or neon1.</p>}
        {unsure && <p className="notice" role="alert">I couldn't confirm that finished. If a code arrives, use it, or try again.</p>}
        {problem === "failed" && <p className="notice" role="alert">{fromLink ? "That link works only in the browser where you asked for the code. Type the code there, or start again here." : "Sign-in didn't finish. Try again."}</p>}
        {/* The demo: no accounts, just pick who to be */}
        {PICKER && (
          <div className="dev demo-pick" aria-label="Demo people">
            <TabOnly />
            <p className="eyebrow">Try it as</p>
            {PEOPLE.map(([e, name, role]) => (
              <button key={e} onClick={() => pick(e)}><b>{name}</b><span>{role}</span></button>
            ))}
          </div>
        )}
        {PICKER && <p className="fine"><a className="linkish" href="/1NEON/">Back to sign-in</a></p>}
        {/* Not signed in and not a client yet: the walkthrough leads, ahead of the form. Returning clients still land on the form below */}
        {!PICKER && !signingUp && at.step === "email" && (
          <a className="btn btn-ghost walk-lead" href="/1NEON/live">Watch the walkthrough</a>
        )}
        {/* Step 1: the email */}
        {!PICKER && signingUp && (at.step === "email" || at.step === "failed" || at.step === "not_invited") && (
          <SignUp info={signupInfo} email={email} remember={remember} onStep={signedUp} onBack={() => fade(closeSignUp)} local={pickPerson && !IN_LIVE} />
        )}
        {!PICKER && !signingUp && (at.step === "email" || at.step === "failed" || at.step === "not_invited") && (
          <form className="stack" name="signin" onSubmit={(e) => { e.preventDefault(); keepEmail(email.trim(), remember); void send({ op: "start", email: email.trim(), remember }); }}>
            {/* A label that stays on screen, so it survives autofill and typed text (the placeholder doesn't) */}
            <label className="field-label" htmlFor="email">Email address</label>
            {/* Remember me opens under the email once it looks like a real address */}
            <div className={`email-row${emailOk ? " ok" : ""}`}>
              {/* "username" is what password managers look for to offer a saved sign-in (passkeys included, through "webauthn") */}
              <input id="email" name="username" type="email" required autoComplete="username webauthn" placeholder="you@company.com" aria-describedby="email-next" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="remember" aria-hidden={!emailOk}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} tabIndex={emailOk ? 0 : -1} />
                remember me
              </label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "One moment…" : "Continue"}</button>
            {/* What Continue leads to, worded the same whether or not the address has an account */}
            <p id="email-next" className="fine next-hint">{SIGN_IN_METHODS}</p>
          </form>
        )}
        {/* Step 2a: a passkey or a code, when both are on offer */}
        {at.step === "choose" && (
          <div className="steps-col">
            <p className="fine">Signing in as <b>{email}</b></p>
            {at.methods?.includes("passkey") && <button className="btn btn-primary" disabled={busy} onClick={() => void send({ op: "choose", method: "passkey" })}>Use my passkey</button>}
            {at.methods?.includes("code") && <button className="btn btn-ghost" disabled={busy} onClick={() => void send({ op: "choose", method: "code" })}>Email me a code</button>}
          </div>
        )}
        {/* Step 2b: the emailed code, or an authenticator app's code */}
        {(at.step === "code" || at.step === "totp") && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void send({ op: "answer", kind: at.step, value: code.trim() }); }}>
            <p className="fine" role="status">{at.step === "code" ? <>We sent {resent ? "a new code" : "a code"} to <b>{email}</b>.</> : "Enter the code from your authenticator app."}</p>
            {at.wrong && <p className="notice" role="alert">That code didn't match. Check it and try again.</p>}
            {/* Whose code this is, so a password manager picks the matching saved sign-in */}
            <input className="sr" type="text" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" />
            <label className="sr" htmlFor="code">Code</label>
            <input id="code" name="code" className="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" required autoFocus placeholder="code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} />
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
            {/* No email yet? Starting again with the same address sends a fresh code */}
            {at.step === "code" && <button className="linkish fine" type="button" disabled={busy} onClick={() => { setResent(true); void send({ op: "start", email: email.trim(), remember }); }}>Send a new code</button>}
          </form>
        )}
        {at.step !== "email" && <p className="fine"><button className="linkish" onClick={restart}>Use a different email</button></p>}
        {/* Not a client yet: start in 1NEON on your own, as a new account */}
        {SIGNUP_HERE && signupOpen && !signingUp && (at.step === "email" || at.step === "failed" || at.step === "not_invited") && (
          <p className="fine"><button className="linkish" onClick={() => fade(openSignUp)}>Create an account</button></p>
        )}
        {/* Not a client yet: one door, the guided walkthrough, with no sign-in to attempt. The sample
            project and the demo stay reachable from inside it (its end card) and from the FAQs.
            The demo, already one of them, offers the guided walkthrough in the same place instead */}
        {PICKER && (
          <nav className="signin-more" aria-label="Another way to see it">
            <a href="/1NEON/live">Or watch the guided walkthrough</a>
          </nav>
        )}
        {/* Without an account: the demo to click around in, and the guided walkthrough, side by side on
            sign-in and create account alike */}
        {!PICKER && (
          <nav className="signin-more" aria-label="Without an account">
            <a href="/1NEON/demo/">Try it yourself</a>
            {/* The walkthrough already leads above the form on the plain sign-in screen */}
            {(signingUp || at.step !== "email") && (<>
              <span className="more-sep" aria-hidden="true">\</span>
              <a href="/1NEON/live">Or see how it works</a>
            </>)}
          </nav>
        )}
        {/* Local builds also offer the demo people under the real form */}
        {pickPerson && !IN_DEMO && (
          <div className="dev" aria-label="Local demo accounts">
            <p className="fine" style={{ margin: "6px 0 0" }}>Local demo: sign in as</p>
            {PEOPLE.map(([e, name]) => (
              <button key={e} onClick={() => pick(e)}>{name}</button>
            ))}
          </div>
        )}
      </div>
      {/* The public pages and policies, and the way back to neon1.tech, below the card as on every public page */}
      <PublicFooter />
    </main>
  );
}


// --- Organization context ---------------------------------------------------------


/** The organization in view, its stages, and what the caller may do in it */
interface OrgCtxValue extends OrgResponse {
  summary: OrgSummary;
  canWrite: boolean;
  canAdmin: boolean;
  // A new account's own person: the API refuses what's hidden for them (packages/domain/src/prospect.ts)
  prospect: boolean;
}
// Organization context for everything inside OrgLayout
const OrgCtx = createContext<OrgCtxValue | null>(null);
// Only valid inside OrgLayout
export const useOrg = () => useContext(OrgCtx)!;


/** Routes under /o/:slug: resolve the slug from the person's own list, then load the organization */
export function OrgLayout() {
  const me = useSession();
  const qc = useQueryClient();
  const { slug } = useParams();
  const summary = me.orgs.find((o) => o.slug === slug);
  const org = useQuery({ queryKey: ["org", summary?.id], queryFn: () => read<OrgResponse>(`/t/${summary!.id}`, { org: "object", access: "string" }), enabled: Boolean(summary) });
  // A 403 or 404 for an organization in my list means my access changed: refresh the list, which drops it
  const lost = org.isError && failureOf(org.error) === "unavailable";
  useEffect(() => {
    if (lost) void qc.invalidateQueries({ queryKey: ["me"] });
  }, [lost, qc]);
  // Not in my list, or no longer mine: the same "not here", without saying whether it exists
  if (!summary || lost) return <Frame><NotMember /></Frame>;
  // Still loading, or failed with nothing to show: say which, with Try again
  const wait = gate([org]);
  if (wait || !org.data) return <Frame org={summary}>{wait}</Frame>;
  const access = org.data.access;
  // A suspended person reads only (the API refuses the rest), so nothing offers a change
  const s = org.data.suspension;
  const held = Boolean(s) && !me.operator;
  const value: OrgCtxValue = { ...org.data, summary, canWrite: access !== "viewer" && !held, canAdmin: access === "admin" && !held, prospect: limitedProspect(org.data.org, me.operator) };
  return (
    <OrgCtx.Provider value={value}>
      <Frame org={summary} reads={[org]} banner={s && <SuspendBar tid={summary.id} name={summary.name} s={s} operator={me.operator} admin={access === "admin"} me={me.user.id} />}>
        <Outlet />
      </Frame>
    </OrgCtx.Provider>
  );
}


/** Pages outside any organization (the profile) still get the frame, search, and help */
export function PlainLayout() {
  return (
    <Frame>
      <Outlet />
    </Frame>
  );
}


/** The All clients view, operator only */
export function AllLayout() {
  const me = useSession();
  if (!me.operator) return <Frame><NotMember /></Frame>;
  return (
    <Frame all>
      <Outlet />
    </Frame>
  );
}


// One answer for missing and forbidden, so nobody learns which organizations exist
function NotMember() {
  return (
    <div className="content">
      <h1 className="page-title">Not here</h1>
      <p className="lead">That organization doesn't exist, or you don't have access to it.</p>
      <Link className="btn btn-ghost" to="/">Go to my workspace</Link>
    </div>
  );
}


// --- Frame: sidebar + top bar ----------------------------------------------------


// The top bar's content is set by the page in view
const Crumbs = createContext<(c: ReactNode) => void>(() => undefined);
/** Pages set their breadcrumb trail and presence avatars in the top bar */
export function useTopBar(node: ReactNode, deps: unknown[]) {
  const set = useContext(Crumbs);
  useEffect(() => {
    set(node);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}


/** One menu entry: its icon box and label line up with every other entry; picking it closes the full menu */
function Item({ to, icon, label, sub, end, tour }: { to: string; icon: ReactNode; label: string; sub?: string; end?: boolean; tour?: string }) {
  return (
    <li>
      <NavLink to={to} end={end} title={sub ? `${label}: ${sub}` : label} data-tour={tour}>
        {icon}
        {/* A layer's plain subtitle rides on the same row, so every row keeps its height */}
        <span className="lbl">{label}{sub && <small className="sub"><span className="sr">, </span>{sub}</small>}</span>
      </NavLink>
    </li>
  );
}


/** Menu, top bar, phone tab bar, and content area shared by every signed-in page. `reads` are the
 * layout's own queries, marked like the session when a refresh fails */
function Frame({ org, all, reads, banner, children }: { org?: OrgSummary; all?: boolean; reads?: Read[]; banner?: ReactNode; children: ReactNode }) {
  const me = useSession();
  const inOrg = useContext(OrgCtx);
  return (
    <HelpProvider me={me}>
      {/* Pages from anywhere in an organization: the pen goes in the top bar */}
      <WriteProvider org={inOrg ? { id: inOrg.summary.id, name: inOrg.summary.name, canWrite: inOrg.canWrite } : undefined}>
        {(pen) => <FrameBody org={org} all={all} reads={reads} banner={banner} pen={pen}>{children}</FrameBody>}
      </WriteProvider>
    </HelpProvider>
  );
}



/** Said in the demo once this browser refuses to save it: the demo still works, from memory */
function TabOnly() {
  const ok = usePersisting();
  if (ok) return null;
  return <span className="demo-tab-only" role="status">This demo lasts until you close or reload this tab.</span>;
}


/** The demo's strip above the portal: what this is, who you're being, and a way to start over */
function DemoBar() {
  const me = useSession();
  const qc = useQueryClient();
  // Back to the picker as someone else, starting from home: the page in view may belong to an
  // organization the next person can't open. Resetting first drops the last person's session, so
  // home waits for the next one instead of redirecting by the old one. The demo's data stays as it is
  const navigate = useNavigate();
  const switchPerson = () => { devUser.set(""); void qc.resetQueries(); navigate("/", { replace: true }); };
  // Start over forgets every change made on this device
  const ask = useAsk();
  const startOver = async () => { if (await ask({ title: "Start the demo over?", body: "Every change you made in this demo goes away.", yes: "Start over", danger: true })) void resetDemo(); };
  return (
    <div className="demo-bar" role="region" aria-label="Interactive demo">
      <span className="demo-tag">interactive demo</span>
      <span className="demo-note">You're {me.user.name || me.user.email}. Everything stays in this browser.</span>
      <TabOnly />
      <span className="demo-acts">
        <button className="linkish" onClick={switchPerson}>Switch person</button>
        <button className="linkish" onClick={startOver}>Start over</button>
      </span>
    </div>
  );
}

// The organization last in view, for the menu on pages outside one: the remembered one if it's still
// theirs, else their only one; someone in several with nothing remembered picks from the chooser
const LAST_ORG = "1neon.lastOrg";
function lastOrg(orgs: OrgSummary[]) {
  let slug: string | null = null;
  slug = prefs.get(LAST_ORG);
  return orgs.find((o) => o.slug === slug) ?? (orgs.length === 1 ? orgs[0] : undefined);
}
// What can take focus inside the menu, for moving focus into it when it opens
/** Where the rail was last scrolled to, kept across the frame remounting between pages */
let railScroll = 0;
// The row at the top of the rail, with how far down the rail it sat. The open menu's rows differ a little in
// height from the rail's (section labels), so it opens on this same row rather than at the same offset
let railAnchor: { key: string; y: number } | null = null;
const rowKey = (a: Element) => `${a.getAttribute("href") ?? ""}|${a.textContent?.trim() ?? ""}`;
function findAnchor(side: HTMLElement): { key: string; y: number } | null {
  const top = side.getBoundingClientRect().top;
  for (const a of side.querySelectorAll("a, button")) {
    const r = a.getBoundingClientRect();
    if (r.height > 2 && r.bottom - top > 1) return { key: rowKey(a), y: r.top - top };
  }
  return null;
}
/** Where the open menu should scroll so the rail's top row stays at the top */
function anchorScroll(side: HTMLElement): number {
  if (!railAnchor) return railScroll;
  const top = side.getBoundingClientRect().top;
  for (const a of side.querySelectorAll("a, button")) {
    if (rowKey(a) !== railAnchor.key) continue;
    const r = a.getBoundingClientRect();
    if (r.height > 2) return Math.max(0, side.scrollTop + (r.top - top) - railAnchor.y);
  }
  return railScroll;
}
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])";


// The menu's switches use the same origin-wide family and mode as neon1.tech
function currentMenuLook(theme: string) {
  const current = resolveTheme(theme);
  return current === "device" ? lookFor(styleChoice() ?? "sentinel", matchMedia("(prefers-color-scheme: dark)").matches) : normalizeLook(current);
}


function MenuThemeControls({ theme, kind }: { theme: string; kind: "mode" | "family" }) {
  // The mode and family switches are two instances; both redraw from the saved choice on any change, here or in another tab
  const [look, setLook] = useState(() => currentMenuLook(theme));
  useEffect(() => {
    setLook(currentMenuLook(theme));
    return onLookChange(() => setLook(currentMenuLook(theme)));
  }, [theme]);
  const dark = isDarkLook(look);
  const family = isSentinel(look) ? "sentinel" : "matrix";
  // Each click reads the saved choice afresh, so flipping one axis never puts back an old value of the other
  const pick = (flip: "mode" | "family") => {
    const now = currentMenuLook(theme);
    const nowDark = isDarkLook(now), nowFamily = isSentinel(now) ? "sentinel" : "matrix";
    const next = flip === "mode" ? lookFor(nowFamily, !nowDark) : lookFor(nowFamily === "sentinel" ? "matrix" : "sentinel", nowDark);
    // Saving announces the pick to this page and other tabs; the page repaints from the saved choice (lib/themepaint.ts)
    saveLook(next);
  };
  if (kind === "family") {
    return <button className="menu-theme-switch style-switch" type="button" role="switch" aria-checked={family === "sentinel"} aria-label="Sentinel theme" title={`Switch to ${family === "sentinel" ? "Matrix" : "Sentinel"}`} onClick={() => pick("family")}>
      <svg className="switch-sun" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5v6M12 3.5v9M17 3.5v5M7 14v6.5M12 16.5v4M17 12v8.5" /></svg>
      <svg className="switch-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8h17v11.5h-17zM8.5 8V5.5h7V8M3.5 13h17" /></svg>
      <span className="switch-knob" aria-hidden="true" />
    </button>;
  }
  return (
    <>
      <button className="menu-theme-switch" type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title={`Switch to ${dark ? "light" : "dark"} mode`} onClick={() => pick("mode")}>
        <Sun className="switch-sun" size={14} aria-hidden="true" /><Moon className="switch-moon" size={14} aria-hidden="true" /><span className="switch-knob" aria-hidden="true" />
      </button>
      <span className="sr" aria-live="polite">{sharedThemeChoice() ? "Shared theme preference active" : `Using your saved ${theme} theme`}</span>
    </>
  );
}


// The frame itself, inside the help context so the ? button and search can use it
function FrameBody({ org, all, reads = [], banner, pen, children }: { org?: OrgSummary; all?: boolean; reads?: Read[]; banner?: ReactNode; pen?: ReactNode; children: ReactNode }) {  const me = useSession();
  // The session query itself, for marking the frame when a background check of it fails
  const meRead = useMe();
  const help = useHelp();
  // The person's choice: default opens the full menu from a button; mini also keeps the icon rail
  // on screen at every size. Either way the full menu opens over the page from the menu buttons
  // (the profile previews its pick here before it is saved: lib/preview.ts)
  const previewed = usePreviewedMenu();
  const mini = (previewed ?? menuOf(me.user.menu)) === "mini";
  // Until it's known whether this is a new account, the panel stays away so it doesn't flash in. A new account never gets Neo, but it does get the panel with the chat with Pradeep in it
  const newAccount = useProspectEverywhere(me);
  // The organization in view, when this frame is inside one, for hiding what a new account can't do
  const inOrg = useContext(OrgCtx);
  const [open, setOpen] = useState(false);
  const side = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  // Closing starts on the element itself: the drawer's class and the scrim's change in the frame of the tap, and the re-render that
  // follows (the whole shell, tens of milliseconds on a phone) waits until the slide is over, so it never holds up a frame of it
  const shutTurn = useRef(0);
  const shut = () => {
    // Only an open menu closes: on the collapsed rail the mark link and row taps call this too, and the class changes below are not
    // undone by a render when nothing was open, so they stuck the rail's rows at the open menu's width
    if (!side.current?.classList.contains("open")) return;
    const turn = ++shutTurn.current;
    side.current?.classList.remove("open");
    side.current?.classList.add("leaving");
    document.querySelector(".scrim")?.classList.add("closing");
    window.setTimeout(() => { if (turn === shutTurn.current) setOpen(false); }, 230);
  };
  // Opening again during the slide puts back what the early close changed
  useLayoutEffect(() => {
    if (!open) return;
    shutTurn.current++;
    side.current?.classList.add("open");
    side.current?.classList.remove("leaving");
    document.querySelector(".scrim")?.classList.remove("closing");
  }, [open]);
  const [scrimVisible, setScrimVisible] = useState(false);
  // The page behind the open menu turns inert only once the menu has finished moving, and stays so until it has finished
  // closing: changing inert restyles the whole page, and in the frame the menu starts to move that was a visible stutter
  const [behind, setBehind] = useState(false);
  const [neoOpen, setNeoOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [top, setTop] = useState<ReactNode>(null);
  const loc = useLocation();
  useLayoutEffect(() => {
    if (!neoOpen) return;
    // Listen at the document so controls rendered through portals (Search, dialogs, menus) are covered too.
    const dismiss = (event: Event) => {
      if (!(event.target instanceof Element) || event.target.closest(".n1neo")) return;
      if (!event.target.closest("button, a[href], input, select, [role=button]")) return;
      setNeoOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("click", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("click", dismiss, true);
    };
  }, [neoOpen]);
  // Each page (a project counts as one, whatever its tab) eases in when you arrive
  const parts = loc.pathname.split("/");
  const section = parts.slice(0, parts[3] === "projects" && parts[4] && parts[4] !== "new" ? 5 : 4).join("/");
  // Back, Forward, and reload return to where each history entry was left; a new page opens at its top
  const how = useNavigationType();
  useEntryScroll(loc.key, section, loc.hash, how);
  useLandOnHash();
  // The full menu closes after navigating, and on Escape
  useEffect(() => setOpen(false), [loc.pathname]);
  // Arriving on another page puts keyboard focus on its title, so a screen reader hears where it is and
  // the next Tab starts in the page. Only when focus would otherwise be lost (on the body, gone, or in the
  // menu that navigated); a link to a spot on the page (#item-...) and background refreshes keep theirs (AP-05)
  const firstSection = useRef(true);
  useEffect(() => {
    if (firstSection.current) { firstSection.current = false; return; }
    if (loc.hash) return;
    const t = window.setTimeout(() => {
      const at = document.activeElement;
      const lost = !at || at === document.body || !at.isConnected || Boolean(side.current?.contains(at)) || Boolean(at.closest(".tabbar"));
      const title = document.querySelector<HTMLElement>("#main h1, #main .page-title");
      if (!lost || !title) return;
      if (!title.hasAttribute("tabindex")) title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      shut();
      menuTrigger.current?.focus({ preventScroll: true });
    };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [open]);
  // Offscreen means out of the focus order: the menu is inert while it's tucked away behind the menu
  // buttons, and while it's open as an overlay the page behind it is inert instead
  // Still moving out on a phone (the page behind is inert until it is over): the rows keep their size and labels meanwhile
  const leaving = !open && behind;
  const tucked = !open && !mini && !leaving;
  const trigger = useRef<HTMLElement | null>(null);
  // Keep the backdrop through the drawer's close transition so the page doesn't flash into view
  useEffect(() => {
    if (open) {
      setScrimVisible(true);
      return;
    }
    if (!scrimVisible) return;
    const drawer = side.current;
    const durations = drawer ? getComputedStyle(drawer).transitionDuration.split(",").map((value) => {
      const duration = Number.parseFloat(value) || 0;
      return value.trim().endsWith("ms") ? duration : duration * 1000;
    }) : [];
    const fallback = Math.max(0, ...durations) + 50;
    if (fallback <= 50) {
      setScrimVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setScrimVisible(false), fallback);
    return () => window.clearTimeout(timer);
  }, [open, scrimVisible]);
  useEffect(() => {
    if (open === behind) return;
    const t = window.setTimeout(() => setBehind(open), 220);
    return () => window.clearTimeout(t);
  }, [open, behind]);
  // Opening moves focus into the menu (to the page in view, or its first control) unless it's already
  // there; closing puts focus back on whatever opened it, if focus would otherwise be lost
  useEffect(() => {
    const el = side.current;
    if (!el) return;
    if (open) {
      // The open menu starts on the same row the rail was showing at its top (the rows differ a little in height,
      // so the row is matched, not the offset); focusing the page in view must not scroll it (on the profile,
      // that link sits at the very bottom)
      el.scrollTop = mini ? anchorScroll(el) : 0;
      if (!el.contains(document.activeElement)) (el.querySelector<HTMLElement>("a[aria-current='page']") ?? el.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
      return;
    }
    // Closing (or arriving) puts the rail on the row the open menu showed at its top, not at its top
    el.scrollTop = mini ? anchorScroll(el) : railScroll;
    railScroll = el.scrollTop;
    // The width is still easing in; place the rail once more after layout settles
    if (mini) requestAnimationFrame(() => { el.scrollTop = anchorScroll(el); railScroll = el.scrollTop; });
  }, [open]);
  // Once the menu has closed and the page is no longer inert, focus goes back to whatever opened it, if it would otherwise be lost
  useEffect(() => {
    if (open || behind) return;
    const el = side.current, back = trigger.current;
    trigger.current = null;
    const lost = !document.activeElement || document.activeElement === document.body || !!el?.contains(document.activeElement);
    // preventScroll: refocusing the opener must not drag the rail to it, away from the row the menu showed
    if (back?.isConnected && !back.closest("[inert]") && lost) back.focus({ preventScroll: true });
  }, [open, behind]);
  // The rail keeps its scroll through everything that remounts the frame (the profile and Contact neon1
  // sit outside the organization's pages, so reaching them rebuilds it) and through the open menu,
  // which always opens at its top: the position is kept here, saved while the rail is what shows
  useLayoutEffect(() => { if (side.current) side.current.scrollTop = railScroll; }, []);
  // Rail and open menu follow each other row for row (Mini only): scrolling either records the top row
  const keepRail = () => {
    if (!mini || !side.current) return;
    if (!open) railScroll = side.current.scrollTop;
    railAnchor = findAnchor(side.current);
  };
  // A tap on the rail while the page is still coasting from a swipe only stops the coast on touch
  // screens, and the rail doesn't answer until the page is still. A short touch that stays put
  // on the rail is taken as a tap right there, so the rail answers first time
  useEffect(() => {
    const el = side.current;
    if (!el) return;
    let from: { x: number; y: number; at: number } | null = null;
    const down = (e: TouchEvent) => { const t = e.touches[0]; from = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, at: e.timeStamp } : null; };
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0], f = from;
      from = null;
      if (!f || !t || el.classList.contains("open") || e.timeStamp - f.at > 500 || Math.hypot(t.clientX - f.x, t.clientY - f.y) > 10) return;
      const hit = (e.target as Element | null)?.closest<HTMLElement>("a[href], button:not(:disabled)");
      if (!hit || !el.contains(hit)) return;
      e.preventDefault(); // the browser's own click for this tap is dropped, so it never fires twice
      hit.click();
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchend", up, { passive: false });
    return () => { el.removeEventListener("touchstart", down); el.removeEventListener("touchend", up); };
  }, []);
  // Remember the organization in view, so pages outside one (profile, FAQs) keep its menu and tabs
  useEffect(() => { if (org) prefs.set(LAST_ORG, org.slug); }, [org]);
  const navOrg = org ?? (all ? undefined : lastOrg(me.orgs));
  // The signed-in panel: Neo where a model is wired, Trin inside an organization where it is
  const signedPanel = Boolean(me.neo || (me.trin && navOrg));
  const base = navOrg ? `/o/${navOrg.slug}` : "";
  // Home: the organization's Home, All clients' board for an operator there, or the app's landing
  const home = navOrg ? `${base}/workspace` : all ? "/all/workflow" : "/";
  return (
    <div className={`shell${mini ? " mini" : ""}`}>
      {/* First stop for the keyboard: straight to the page, past the menu and top bar. Focus moves in
          code, so the address never gains a #main that pages would read as a link to an item */}
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      {IN_DEMO && !IN_LIVE && <DemoBar />}
      {/* Scrim behind the full menu; a tap outside closes it */}
      {(open || scrimVisible) && <div className={`scrim${open ? "" : " closing"}`} onClick={shut} aria-hidden="true" />}
      {/* Start the drawer's exit on the selecting tap, before the route commits; modifier clicks keep this tab open */}
      <aside ref={side} onScroll={keepRail} onClickCapture={(event) => {
        const target = event.target;
        const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
        if (open && link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && link.target !== "_blank") shut();
      }} onTransitionEnd={(event) => {
        if (!open && event.target === event.currentTarget && ["width", "transform", "clip-path"].includes(event.propertyName)) setScrimVisible(false);
      }} className={`side${open ? " open" : ""}${leaving ? " leaving" : ""}`} aria-label="Menu" inert={tucked}>
        {/* The mark and name lead Home, from the open menu and the Mini rail alike. It sits exactly where
            the top bar's own mark sits, so opening the menu covers one with the other */}
        <div className="side-head">
          <Link className="brand" to={home} onClick={shut} title="Home" aria-label="1NEON, Home">
            <span className="ico mark" aria-hidden="true"><Rings /></span>
            <span className="lbl">1NEON</span>
          </Link>
          {open && <MenuThemeControls theme={me.user.theme} kind="mode" />}
        </div>
        {/* Edge to edge, exactly on the top bar's bottom edge: the mark row above is the top bar's own height */}
        <div className="edge edge-top" aria-hidden="true" />
        {/* Organization: the full chooser when there's room for labels, its initials otherwise */}
        <div className="org-full"><OrgChooser current={org} all={all} shown={open} /></div>
        <button className="org-mini" type="button" onClick={() => setOpen(true)} title={all ? "All clients" : navOrg?.name ?? "Choose an organization"}>
          <span className="ico">{all ? "All" : navOrg ? initials(navOrg.name) : "?"}</span>
          <span className="lbl">{all ? "All clients" : navOrg?.name ?? "Organizations"}</span>
        </button>
        {/* Organization pages get the main places and the four layers; All clients gets only its board */}
        <ul className="nav">
          {navOrg ? (
            <>
              <Item to={`${base}/workspace`} icon={<Icon name="workspace" />} label="Home" tour="nav-home" />
              <Item to={`${base}/workflow`} icon={<Icon name="workflow" />} label="Board" tour="nav-board" />
              <Item to={`${base}/projects`} icon={<Icon name="projects" />} label="Projects" end={false} tour="nav-projects" />
              <Item to={`${base}/documents`} icon={<Icon name="documents" />} label="Files" tour="nav-files" />
              <li className="sep" data-tour="nav-layers"><span className="lbl gl"><span className="gt">Layers</span></span>
                <ul className="nav">
                  {LAYERS.map((l) => (
                    <Item key={l} to={`${base}/layer/${layerSlug(l)}`} icon={<LayerBadge layer={l} />} label={layerName(l)} sub={layerHint(l)} />
                  ))}
                </ul>
              </li>
              <li className="sep"><span className="lbl gl"><span className="gt">Organization</span></span></li>
              <Item to={`${base}/people`} icon={<Icon name="people" />} label="People" />
              <Item to={`${base}/settings`} icon={<Icon name="settings" />} label="Settings" />
            </>
          ) : all ? (
            <>
              <Item to="/all/workflow" icon={<Icon name="workflow" />} label="Board" />
              <Item to="/all/prospects" icon={<Icon name="people" />} label="Potentials" />
            </>
          ) : null}
        </ul>
        {/* Every way to reach neon1, for every account, new ones included; the signed-in person ends the
            Organization group, so it shows on the first screen and is never taken for Report a bug */}
        <ul className="nav contact-nav">
          <Item to={all ? "/all/contact" : "/contact"} icon={<Icon name="contact" />} label="Contact neon1" tour="nav-contact" />
          {/* Their row, with the way out at its end in the open menu; from the Mini rail it's on the profile */}
          <li className="who-row">
            <NavLink to={all ? "/all/me" : "/me"} className="who-link" title="Your profile" data-tour="nav-me">
              <span className="ico av-box"><Avatar id={me.user.id} name={me.user.name || me.user.email} size={24} /></span>
              <span className="lbl">{me.user.name.trim().split(/\s+/)[0] || me.user.email}</span>
            </NavLink>
            {open && <SignOutButton />}
          </li>
        </ul>
        {/* Links out of 1NEON read as one untitled group: the neon1 way to say something is broken, the way to
            say anything else (both in a new tab) */}
        <div className="out-group">
          <div className="gline" aria-hidden="true" />
          <ul className="nav">
            <li><ReportBug kind="row" /></li>
            <li><ReportBug kind="feedbackRow" /></li>
          </ul>
        </div>
        {/* The footer's top border is the edge above its 60px row, aligned with the mobile tab bar */}
        <div className="menu-footer">
          <a className="site-link site-end" href="/" title="neon1.tech">
            {/* The site logo's mark (v5 set), drawn in the theme's accent inside a round border */}
            <span className="ico site-mark" aria-hidden="true">
              <svg viewBox="3 4 58 58"><path d="M6 6a24 24 0 0 1 24 24v30M6 12a18 18 0 0 1 18 18v30M6 18a12 12 0 0 1 12 12v30M6 24a6 6 0 0 1 6 6v30M34 6a24 24 0 0 1 24 24v30M34 12a18 18 0 0 1 18 18v30M34 18a12 12 0 0 1 12 12v30M34 24a6 6 0 0 1 6 6v30" /></svg>
            </span>
            <span className="lbl"><Wm /></span>
          </a>
          {open && <MenuThemeControls theme={me.user.theme} kind="family" />}
        </div>
      </aside>
      <div className="main" inert={behind}>
        {/* Only the board is read only; Potentials has neon1's actions, and Contact is not a client workspace */}
        {all && loc.pathname === "/all/workflow" && (
          <div className="readonly-bar" role="status">
            <strong>All clients · read only.</strong> Open a client to make changes.
          </div>
        )}
        {/* A suspension's banner (components/Suspend.tsx), on every page of the organization */}
        {banner}
        {/* Top bar: the menu button (always: it costs no room), the page's crumbs, then search and help */}
        <header className="top">
          {/* The mark and name, Home's way in, before the menu button; in Mini the rail shows the mark instead */}
          {!mini && <Link className="top-brand" to={home} title="Home" aria-label="1NEON, Home"><span className="mark-box" aria-hidden="true"><Rings /></span><span className="lbl">1NEON</span></Link>}
          <button className="icon-btn menu-btn" onClick={(e) => { if (open) shut(); else { menuTrigger.current = e.currentTarget; trigger.current = e.currentTarget; setOpen(true); } }} aria-expanded={open} aria-label="Menu" title="Menu" data-tour="menu"><MenuIcon size={18} /></button>
          <div className="crumb">{top}</div>
          <span className="spacer" />
          <button className="search-btn" onClick={() => { setNeoOpen(false); setSearch(true); }} data-tour="search" aria-label={`Search ${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}`}>
            <SearchIcon size={16} aria-hidden="true" />
            <span className="hide-sm">Search</span>
            {" "}
            <span className="kbd hide-sm" aria-hidden="true">{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</span>
          </button>
          {pen}
          {org && <Bell tid={org.id} slug={org.slug} />}
          <button className="icon-btn help-btn" onClick={help.open} data-tour="help" aria-label="Help for this page" title="Help for this page">?</button>
        </header>
        <Crumbs.Provider value={setTop}>
          <main className="content" id="main" tabIndex={-1}>
            <Stale reads={[meRead, ...reads]} />
            <div className="page-in" key={section}>{children}</div>
          </main>
        </Crumbs.Provider>
      </div>
      {/* Phones: the main places as a tab bar at the bottom, within thumb reach */}
      <nav className="tabbar" aria-label="Main" inert={behind}>
        {navOrg ? (
          <>
            <NavLink to={`${base}/workspace`} data-tour="nav-home"><HomeIcon size={20} aria-hidden="true" /><span>Home</span></NavLink>
            <NavLink to={`${base}/workflow`} data-tour="nav-board"><KanbanIcon size={20} aria-hidden="true" /><span>Board</span></NavLink>
            <NavLink to={`${base}/projects`} data-tour="nav-projects"><FolderIcon size={20} aria-hidden="true" /><span>Projects</span></NavLink>
            <NavLink to={`${base}/documents`} data-tour="nav-files"><FileIcon size={20} aria-hidden="true" /><span>Files</span></NavLink>
          </>
        ) : (
          <NavLink to="/"><HomeIcon size={20} aria-hidden="true" /><span>Home</span></NavLink>
        )}
        <button type="button" className="menu-btn" onClick={(e) => { if (open) shut(); else { menuTrigger.current = e.currentTarget; trigger.current = e.currentTarget; setOpen(true); } }} aria-expanded={open}><MenuIcon size={20} aria-hidden="true" /><span>Menu</span></button>
      </nav>
      <Palette me={me} org={org} prospect={inOrg?.prospect} open={search} setOpen={setSearch} onHelp={help.open} onTour={help.welcomeTour} />
      <ConfirmDialog me={me} />
      {/* Neo for signed-in people, where a model is wired; elsewhere the public Neo stays */}
      {/* The signed-in Neo (two tabs, and plans it can run) where it's on; everywhere else the public Neo, with the chat as a second tab */}
      {!IN_DEMO && newAccount !== undefined && signedPanel && newAccount === false && <Neo open={neoOpen} setOpen={setNeoOpen} org={navOrg ? { id: navOrg.id, name: navOrg.name, slug: navOrg.slug } : undefined} me={{ id: me.user.id, operator: me.operator }} neo={Boolean(me.neo)} trin={Boolean(me.trin)} />}
      {(IN_DEMO || (newAccount !== undefined && !(signedPanel && newAccount === false))) && (navOrg || me.operator) && <PublicTalk org={navOrg ? { id: navOrg.id, name: navOrg.name, slug: navOrg.slug } : undefined} me={{ id: me.user.id, operator: me.operator }} demo={IN_DEMO} />}
    </div>
  );
}


/** The organization switcher at the top of the sidebar: a button that shows a short list of links.
 * Tab and Enter work as everywhere; arrow keys move through the list, Escape closes it and returns
 * focus to the button, and focus leaving the chooser closes it */
function OrgChooser({ current, all, shown }: { current?: OrgSummary; all?: boolean; shown: boolean }) {
  const me = useSession();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useMenuFit(menu, open);
  useTapOutside(ref, open, useCallback(() => setOpen(false), []));
  // The list closes with the side menu, and each opening starts with an empty search
  useEffect(() => { if (!shown) setOpen(false); }, [shown]);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  // With a mouse, opening puts focus on the search box, or the current organization, or the first
  // entry. On touch nothing takes focus, so no keyboard rises; the current organization is scrolled to
  useEffect(() => {
    if (!open) return;
    const list = menu.current;
    const here = list?.querySelector<HTMLElement>("[aria-current='true']");
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const scroller = list?.querySelector<HTMLElement>(".menu-scroll");
      if (here && scroller) scroller.scrollTop += here.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (scroller.clientHeight - here.offsetHeight) / 2;
      return;
    }
    (list?.querySelector<HTMLElement>("input") ?? here ?? list?.querySelector<HTMLElement>("a"))?.focus();
  }, [open]);
  // Arrow keys step through the entries; Escape closes without leaving the frame's menu
  const keys = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      toggle.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(".menu a") ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  // People in one organization see its name, not a chooser
  const many = me.operator || me.orgs.length > 1;
  // Outside an organization (profile, FAQs): one organization reads as a way back to it; several, as a choice
  const only = !many ? me.orgs[0] : undefined;
  const label = all ? "All clients" : current?.name ?? only?.name ?? "Choose an organization";
  const sub = all ? "read only" : current?.clientId ?? (only ? "back to Home" : "");
  const list = me.orgs.filter((o) => (o.name + o.clientId).toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} style={{ position: "relative" }} onKeyDown={keys} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget && setOpen(false)}>
      {!current && !all && only ? (
        <Link className="org" to={`/o/${only.slug}/workspace`}><b><span className="nm">{label}</span></b><small>{sub}</small></Link>
      ) : (
        <button ref={toggle} className={`org${all ? " all" : ""}`} onClick={() => many && setOpen(!open)} aria-expanded={many ? open : undefined} aria-controls={many ? "org-list" : undefined} disabled={!many && !current}>
          <b><span className="nm">{label}</span>{many && <Arr />}</b>
          <small>{sub}</small>
        </button>
      )}
      {open && (
        <div ref={menu} className="menu menu-fit" id="org-list" style={{ top: "calc(100% + 6px)", left: 0, right: 0 }}>
          {me.orgs.length > 6 && <input aria-label="Search organizations" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 6 }} />}
          {/* Search stays put; the entries scroll under it */}
          <div className="menu-scroll">
          {/* The operator can always jump to All clients */}
          {me.operator && (
            <>
              <Link to="/all/workflow" aria-current={all ? "true" : undefined} onClick={() => setOpen(false)}>
                All clients <small>read only</small>
              </Link>
              <Link to="/all/prospects" onClick={() => setOpen(false)}>Potentials</Link>
              <hr />
            </>
          )}
          {list.map((o) => (
            <Link key={o.id} to={`/o/${o.slug}/workspace`} aria-current={o.id === current?.id ? "true" : undefined} onClick={() => setOpen(false)}>
              {o.name} <small>{o.clientId}</small>
            </Link>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
