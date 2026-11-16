// apps/web/src/components/SignUp.tsx - Sign-up on the sign-in screen: someone from the site makes their
// own account. It asks the API whether sign-up is open, shows the form (with the invisible Turnstile
// check and a hidden field for bots), and hands the answer back to sign-in, which carries on with the
// same emailed code as everyone. On a wide screen the needed fields sit left and the optional ones right.


import { useEffect, useRef, useState } from "react";
import { DESCRIBES, FOUND_VIA, OUTSIDE_US, US_STATES } from "@1neon/domain";
import { Link } from "react-router";
import { api, HttpError, Unconfirmed } from "../lib/api.ts";
import { elapsedSince, needsOrg, orgRequired, signUpBody, signUpProblems, signUpReady, type SignUpInfo } from "../lib/signup.ts";
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
  // "Which describes you best?", their words for "Something else", and the organization's name (not
  // asked of an individual)
  const [kind, setKind] = useState("");
  const [kindOther, setKindOther] = useState("");
  const [org, setOrg] = useState("");
  // Where the business is based (a city with its state, or the state alone) and its website: optional
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [link, setLink] = useState("");
  // How they found neon1: optional, one answer from FOUND_VIA, with their words for "Somewhere else"
  const [found, setFound] = useState("");
  const [foundOther, setFoundOther] = useState("");
  // Fields someone has left (a problem shows once they move on), and the API's answers by field
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
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

  const fields = { email, name, kind, kindOther, org, city, state, link, found, foundOther, terms };
  const ready = signUpReady(fields);
  const own = signUpProblems(fields);
  // What shows beside a field: the API's answer for it, else the form's own once the field was left
  const problem = (f: string) => fieldErrs[f] ?? (touched[f] ? own[f] : undefined);
  const leave = (f: string) => () => setTouched((t) => (t[f] ? t : { ...t, [f]: true }));
  // Typing in a field clears the API's answer for it
  const edit = <T,>(f: string, set: (v: T) => void) => (v: T) => {
    set(v);
    setFieldErrs((e) => { if (!(f in e)) return e; const { [f]: _gone, ...rest } = e; return rest; });
  };
  const send = async (check: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<Step>("/auth/signup", { method: "POST", body: signUpBody(fields, { check, website, elapsed: elapsedSince(shownAt.current), remember }) });
      // A local build sends no email, so there's no code to wait for
      if (local) setError("This local build sends no email, so there's no code. Sign in as a demo person below.");
      else onStep(r, email.trim());
    } catch (e) {
      // Field by field answers go beside their fields; anything else shows at the top
      const byField = e instanceof HttpError && e.body.error === "check_fields" ? (e.body.current as { fields?: Record<string, string> } | undefined)?.fields : undefined;
      if (byField) {
        setFieldErrs(byField);
        setError("");
        // Keyboard and screen reader users land on the first field that needs a look
        const first = ["email", "name", "kind", "kindOther", "org", "link", "place", "found", "foundOther"].find((f) => byField[f]);
        if (first) document.getElementById(`su-${first === "place" ? "city" : first}`)?.focus();
      } else
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
      {error && <p className="notice full su-error" role="alert">{error}</p>}
      {/* Two columns on a wide screen (styles: "Sign-up, wide"): what's needed, marked with a green
          asterisk, on the left; what's optional on the right, past a faint line. One column on a phone */}
      <div className="su-col su-need">
        <Field id="email" label="Email address" required problem={problem("email")}>
          <input id="su-email" name="username" type="email" required autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => edit("email", setEmail)(e.target.value)} onBlur={leave("email")} {...invalid("email", problem("email"))} />
        </Field>
        <Field id="name" label="Your name" required problem={problem("name")}>
          <input id="su-name" name="name" required maxLength={80} autoComplete="name" value={name} onChange={(e) => edit("name", setName)(e.target.value)} onBlur={leave("name")} {...invalid("name", problem("name"))} />
        </Field>
        <Field id="kind" label="Which describes you best?" required problem={problem("kind")}>
          <select id="su-kind" name="kind" required className={kind ? undefined : "unpicked"} value={kind} onChange={(e) => edit("kind", setKind)(e.target.value)} {...invalid("kind", problem("kind"))}>
            <option value="" disabled>Choose one</option>
            {Object.entries(DESCRIBES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {kind === "other" && (
          <Field id="kindOther" label="In your words" required problem={problem("kindOther")}>
            <input id="su-kindOther" name="kindOther" required maxLength={80} placeholder="A family office, a club, a studio" value={kindOther} onChange={(e) => edit("kindOther", setKindOther)(e.target.value)} onBlur={leave("kindOther")} {...invalid("kindOther", problem("kindOther"))} />
          </Field>
        )}
        {needsOrg(kind) && (
          <Field id="org" label="Organization name" required={orgRequired(kind)} problem={problem("org")}>
            <input id="su-org" name="org" required={orgRequired(kind)} maxLength={80} autoComplete="organization" value={org} onChange={(e) => edit("org", setOrg)(e.target.value)} onBlur={leave("org")} {...invalid("org", problem("org"))} />
          </Field>
        )}
      </div>
      {/* Where the business can be seen: optional, since some people would rather stay private until we talk */}
      <div className="su-col su-opt">
        <Field id="link" label="Website or public page" problem={problem("link")}>
          <input id="su-link" name="url" inputMode="url" maxLength={200} autoComplete="url" placeholder="yourbusiness.com" value={link} onChange={(e) => edit("link", setLink)(e.target.value)} onBlur={leave("link")} {...invalid("link", problem("link"), "su-face-hint")} />
        </Field>
        {/* City and state side by side: the state alone is fine, a city needs its state */}
        <div className="f f-place">
          <div className="su-pair">
            <div className="f">
              <label className="field-label" htmlFor="su-city">{state === OUTSIDE_US ? "City and country" : "City"}</label>
              <input id="su-city" name="city" maxLength={80} autoComplete={state === OUTSIDE_US ? "off" : "address-level2"} placeholder={state === OUTSIDE_US ? "Toronto, Canada" : "Albany"} value={city} onChange={(e) => edit("place", setCity)(e.target.value)} onBlur={leave("place")} {...invalid("place", problem("place"), "su-face-hint")} />
            </div>
            <div className="f">
              <label className="field-label" htmlFor="su-state">State</label>
              <select id="su-state" name="state" autoComplete="address-level1" className={state ? undefined : "unpicked"} value={state} onChange={(e) => edit("place", setState)(e.target.value)} onBlur={leave("place")} {...invalid("place", problem("place"), "su-face-hint")}>
                <option value="">State</option>
                {Object.entries(US_STATES).map(([code, n]) => <option key={code} value={code}>{n}</option>)}
                {/* US first; anywhere else is welcome to ask */}
                <option value={OUTSIDE_US}>Outside the US</option>
              </select>
            </div>
          </div>
          {problem("place") && <p className="fine field-error" id="su-place-error" role="status">{problem("place")}</p>}
        </div>
        <Field id="found" label="How did you find neon1?" problem={problem("found")}>
          <select id="su-found" name="found" className={found ? undefined : "unpicked"} value={found} onChange={(e) => edit("found", setFound)(e.target.value)}>
            <option value="">Choose one</option>
            {Object.entries(FOUND_VIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {found === "other" && (
          <Field id="foundOther" label="Where?" required problem={problem("foundOther")}>
            <input id="su-foundOther" name="foundOther" required maxLength={80} placeholder="A podcast, a newsletter, an event" value={foundOther} onChange={(e) => edit("foundOther", setFoundOther)(e.target.value)} onBlur={leave("foundOther")} {...invalid("foundOther", problem("foundOther"))} />
          </Field>
        )}
      </div>
      {/* One line on a wide screen; narrower, the second sentence moves down whole (styles: .face-hint .whole) */}
      <p className="fine face-hint" id="su-face-hint"><span>Helps me see who I'd be working with. <span className="whole">You can add these later.</span></span></p>
      {/* Off-screen, not display:none, since some bots skip hidden fields; people and screen readers never reach it */}
      <div className="hp" aria-hidden="true">
        <input name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {/* The portal's terms, opened in a new tab so what's typed here stays */}
      <label className="remember agree su-terms">
        <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>I agree to the <Link to="/terms" target="_blank" rel="noopener">terms of use</Link></span>
      </label>
      {/* Turnstile draws here only if Cloudflare needs the person to do something */}
      <div ref={box} className="check full su-end1" />
      <button className="btn btn-primary full su-end2" type="submit" disabled={!ready || busy || waiting}>{busy || waiting ? "One moment…" : "Create account"}</button>
      <p className="fine next-hint full su-end3">You'll get a code by email to finish. No password. <a href="/knowledge/guides/free-accounts/" target="_blank" rel="noopener">How free accounts work</a></p>
      <p className="fine full su-end4"><button className="linkish" type="button" onClick={onBack}>Back to sign-in</button></p>
    </form>
  );
}


/** A labeled field with its message under it. Required fields carry a green asterisk (the input's own
 * `required` tells screen readers) */
function Field({ id, label, required, problem, children }: { id: string; label: string; required?: boolean; problem?: string; children: React.ReactNode }) {
  return (
    <div className={`f f-${id}`}>
      <label className="field-label" htmlFor={`su-${id}`}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      {children}
      {problem && <p className="fine field-error" id={`su-${id}-error`} role="status">{problem}</p>}
    </div>
  );
}


/** The attributes that tie a field to its message, and mark it while there is one */
function invalid(id: string, problem: string | undefined, hint?: string) {
  const errId = id === "place" ? "su-place-error" : `su-${id}-error`;
  const describedBy = [problem ? errId : "", hint ?? ""].filter(Boolean).join(" ");
  return { "aria-invalid": problem ? true : undefined, ...(describedBy ? { "aria-describedby": describedBy } : {}) };
}
