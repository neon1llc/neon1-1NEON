// apps/web/src/components/SignUp.tsx - Sign-up on the sign-in screen: someone from the site makes their
// own account. It asks the API whether sign-up is open, shows the form (with the invisible Turnstile
// check and a hidden field for bots), and hands the answer back to sign-in, which carries on with the
// same emailed code as everyone. On a wide screen the needed fields sit left and the optional ones right.


import { useEffect, useRef, useState } from "react";
import { FOUND_VIA } from "@1neon/domain";
import { Link } from "react-router";
import { api, HttpError, Unconfirmed } from "../lib/api.ts";
import { elapsedSince, linkOk, signUpBody, signUpReady, type SignUpInfo } from "../lib/signup.ts";
import { loadTurnstile, widgetOptions } from "../lib/turnstile.ts";
import type { Step } from "./Shell.tsx";


/** The sign-up form, or the words for when it's closed. `onStep` receives the API's sign-in answer;
 * `local` is a build with no email, where the code can't arrive */
export function SignUp({ info: known, email: start, remember, onStep, onBack, local }: { info?: SignUpInfo; email: string; remember: boolean; onStep: (r: Step, email: string) => void; onBack: () => void; local: boolean }) {
  // Whether sign-up is open, asked before anything shows. `undefined` while waiting, `null` if the ask failed
  // The sign-in screen's answer when it has one, so the form shows at once
  const [info, setInfo] = useState<SignUpInfo | null | undefined>(known);
  const [email, setEmail] = useState(start);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  // Where the business is based, and its website or a public page: at least one, so Pradeep can see who it is
  const [place, setPlace] = useState("");
  const [link, setLink] = useState("");
  // How they found neon1: optional, one answer from FOUND_VIA
  const [found, setFound] = useState("");
  const [terms, setTerms] = useState(false);
  // The hidden field. A person never sees it, so anything in it came from a script
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Turnstile's token, and whether a send is waiting for it
  const [token, setToken] = useState("");
  const [waiting, setWaiting] = useState(false);
  // When the form was shown; the API refuses a form filled faster than a person can
  const shownAt = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);

  // Ask the API whether sign-up is open, and for Turnstile's site key
  useEffect(() => {
    if (known) return;
    let live = true;
    api<SignUpInfo>("/auth/signup").then((r) => live && setInfo(r), () => live && setInfo(null));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The form is on screen from the moment the answer says open: start the clock then
  const open = info?.open === true;
  useEffect(() => {
    if (open) shownAt.current = Date.now();
  }, [open]);

  // Load Turnstile only now, with the form, and draw it into the box. With no site key (local runs) the
  // check is skipped and the token stays empty
  const siteKey = open ? info?.siteKey : undefined;
  useEffect(() => {
    if (!siteKey) return;
    let gone = false;
    loadTurnstile().then((t) => {
      if (gone || !box.current) return;
      widget.current = t.render(box.current, widgetOptions(siteKey, {
        callback: setToken,
        expired: () => setToken(""),
        // The check can't run (blocked, or Cloudflare is down): stop waiting and say so
        error: () => { setToken(""); setWaiting(false); setError("The check that you're a person didn't load. Reload the page and try again."); },
      }));
    }, () => setError("The check that you're a person didn't load. Reload the page and try again."));
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = undefined;
    };
  }, [siteKey]);

  const ready = signUpReady({ email, name, org, place, link, terms });
  const send = async (check: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<Step>("/auth/signup", { method: "POST", body: signUpBody({ email, name, org, place, link, found, terms }, { check, website, elapsed: elapsedSince(shownAt.current), remember }) });
      // A local build sends no email, so there's no code to wait for
      if (local) setError("This local build sends no email, so there's no code. Sign in as a demo person below.");
      else onStep(r, email.trim());
    } catch (e) {
      // The API's own words (a limit reached, a failed check, sign-up paused), or a note that it may have gone through
      setError(e instanceof HttpError ? e.body.message : e instanceof Unconfirmed ? "We couldn't confirm whether this finished. If a code arrives by email, go back and use it, or try again." : "Couldn't reach 1NEON. Check your connection and try again.");
      // A token works once: a new one for the next try
      setToken("");
      if (widget.current) window.turnstile?.reset(widget.current);
    }
    setBusy(false);
  };
  // A send that came before the check finished goes as soon as the token arrives
  useEffect(() => {
    if (waiting && token) {
      setWaiting(false);
      void send(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, token]);
  const submit = () => {
    if (!ready || busy || waiting) return;
    if (siteKey && !token) setWaiting(true);
    else void send(token);
  };

  if (info === undefined) return <p className="fine" role="status">One moment…</p>;
  // Closed, or the ask failed: the same way out in both
  if (!open) {
    return (
      <>
        <p className="notice" role="status">{info === null ? "Couldn't reach 1NEON. Check your connection and try again." : "Sign-up is paused right now. Email hello@neon1.tech, and I'll set you up."}</p>
        <p className="fine"><button className="linkish" onClick={onBack}>Back to sign-in</button></p>
      </>
    );
  }
  return (
    <form className="stack signup-form" name="signup" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {error && <p className="notice full" role="alert">{error}</p>}
      {/* Each field is a label and its input together, so a wide screen can set who you are beside where
          to see the business, in two columns, with no scrolling (styles: "Sign-up, wide") */}
      <div className="f f-email">
        <label className="field-label" htmlFor="su-email">Email address</label>
        <input id="su-email" name="username" type="email" required autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="f f-name">
        <label className="field-label" htmlFor="su-name">Your name</label>
        <input id="su-name" name="name" required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="f f-org">
        <label className="field-label" htmlFor="su-org">Organization name</label>
        <input id="su-org" name="org" required maxLength={80} autoComplete="organization" value={org} onChange={(e) => setOrg(e.target.value)} />
      </div>
      {/* Where the business can be seen: optional, since some people would rather stay private until we talk */}
      <div className="f f-link">
        <label className="field-label" htmlFor="su-link">Website or public page <span className="opt">optional</span></label>
        <input id="su-link" name="url" inputMode="url" maxLength={200} autoComplete="url" placeholder="yourbusiness.com" aria-describedby="su-face-hint" aria-invalid={!linkOk(link)} value={link} onChange={(e) => setLink(e.target.value)} />
        {!linkOk(link) && <p className="fine field-error" role="status">Enter a web address, like yourbusiness.com.</p>}
      </div>
      <div className="f f-place">
        <label className="field-label" htmlFor="su-place">City and state <span className="opt">optional</span></label>
        <input id="su-place" name="place" maxLength={80} autoComplete="address-level2" placeholder="Albany, NY" aria-describedby="su-face-hint" value={place} onChange={(e) => setPlace(e.target.value)} />
      </div>
      <div className="f f-found">
        <label className="field-label" htmlFor="su-found">How did you find neon1? <span className="opt">optional</span></label>
        <select id="su-found" name="found" className={found ? undefined : "unpicked"} aria-describedby="su-face-hint" value={found} onChange={(e) => setFound(e.target.value)}>
          <option value="">Choose one</option>
          {Object.entries(FOUND_VIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {/* A line between what's needed (left) and what's optional (right), on a wide screen only */}
      <div className="col-rule" aria-hidden="true" />
      <p className="fine face-hint" id="su-face-hint">Helps me see who I'd be working with. You can add it later.</p>
      {/* Off-screen, not display:none, since some bots skip hidden fields; people and screen readers never reach it */}
      <div className="hp" aria-hidden="true">
        <input name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {/* The portal's terms, opened in a new tab so what's typed here stays */}
      <label className="remember agree">
        <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>I agree to the <Link to="/terms" target="_blank" rel="noopener">terms of use</Link></span>
      </label>
      {/* Turnstile draws here only if Cloudflare needs the person to do something */}
      <div ref={box} className="check full" />
      <button className="btn btn-primary full" type="submit" disabled={!ready || busy || waiting}>{busy || waiting ? "One moment…" : "Create account"}</button>
      <p className="fine next-hint full">You'll get a code by email to finish. No password. <a href="/knowledge/guides/free-accounts/" target="_blank" rel="noopener">How free accounts work</a></p>
      <p className="fine full"><button className="linkish" type="button" onClick={onBack}>Back to sign-in</button></p>
    </form>
  );
}
