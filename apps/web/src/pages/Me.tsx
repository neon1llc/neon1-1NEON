// apps/web/src/pages/Me.tsx - Your profile: name, title, phone, menu, and notices (saved together),
// motion (this browser's, at once),
// then two-step verification, the tutorial, and signing out (each takes effect right away).


import type { User } from "@1neon/domain";
import type { SmsState } from "../lib/types.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useSession, useTopBar } from "../components/Shell.tsx";
import { Avatar, useAsk, useToast } from "../components/ui.tsx";
import { api, BASE_PATH, devUser, LIVE, pickPerson } from "../lib/api.ts";
import { menuOf, NOTIFY_GROUPS } from "@1neon/domain";
import { problem } from "../lib/hooks.ts";
import { passkeyCreation } from "../lib/passkey.ts";
import { useProspectEverywhere } from "../components/Prospect.tsx";
import { useHelp } from "../components/Help.tsx";
import { guidesHidden, hideGuides } from "../components/HomeGuide.tsx";
import { previewMenu } from "../lib/preview.ts";
import { ReportBug } from "../components/BugReport.tsx";
import { askToConfirm, TotpSetup } from "../components/Confirm.tsx";
import { chosenLessMotion, deviceLessMotion, setLessMotion } from "../lib/motion.ts";
import { forgetScroll } from "../lib/scrollmemory.ts";


// What the profile says under the text consent for each state
const SMS_NOTE: Record<SmsState, string> = {
  unavailable: "Texts aren't switched on for 1NEON yet. Email notices work now.",
  no_number: "",
  not_agreed: "",
  opted_out: "You replied STOP, so texts are off. Reply START to the number 1NEON texts come from, then check Text me and save to confirm again.",
  unverified: "We sent a setup text. Reply YES to confirm this number, or ask for a code here. Texts start after confirmation.",
  ready: "Texts are on for this number.",
};


// The signed-in person's own profile, outside any organization
// The browser's own zone, and the zones it knows (plus UTC, and the current value if the list lacks it)
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
const zoneChoices = (current: string) => [...new Set(["UTC", ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []), current])].sort();


export function MePage() {
  const me = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // A link to a part of the profile (#security, #notifications) lands on it
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [hash]);
  const toast = useToast();
  const ask = useAsk();
  const help = useHelp();
  const [totpOpen, setTotpOpen] = useState(false);
  useTopBar(<span>Your profile</span>, []);
  // Edits stay local until Save
  const [draft, setDraft] = useState({ name: me.user.name, title: me.user.title, phone: me.user.phone, timeZone: me.user.timeZone ?? browserZone(), menu: menuOf(me.user.menu), notify: me.user.notify ?? {}, smsConsent: Boolean(me.user.smsConsentAt) });
  const [busy, setBusy] = useState(false);
  // Motion is this browser's choice, not the account's, so it changes at once and isn't part of Save
  const deviceLess = deviceLessMotion();
  const [less, setLess] = useState(() => deviceLess || chosenLessMotion());
  // Anything that differs from what's saved; Save waits for a change
  const saved = { name: me.user.name, title: me.user.title, phone: me.user.phone, timeZone: me.user.timeZone ?? browserZone(), menu: menuOf(me.user.menu), notify: me.user.notify ?? {}, smsConsent: Boolean(me.user.smsConsentAt) };
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // Leaving the profile unsaved puts the menu preview back to its saved style
  useEffect(() => () => { previewMenu(undefined); }, []);
  // The phone check: a code is texted, then typed here
  const [code, setCode] = useState<string | undefined>(undefined);
  // A new account has no texts: no number to add, no text notices, no text codes
  const noTexts = useProspectEverywhere(me) === true;
  const textsAvailable = !noTexts && Boolean(draft.phone.trim()) && draft.smsConsent;
  const sms = me.sms?.state ?? "unavailable";
  // A saved change to the number or consent matters before a code makes sense
  const smsDirty = draft.phone !== me.user.phone || draft.smsConsent !== Boolean(me.user.smsConsentAt);
  const sendCode = async () => {
    try {
      await api("/me/phone/verify", { method: "POST", body: {} });
      setCode("");
      toast("Code sent. It's good for 10 minutes.");
    } catch (e) {
      toast(problem(e));
    }
  };
  const checkCode = async () => {
    try {
      await api("/me/phone/confirm", { method: "POST", body: { code } });
      setCode(undefined);
      toast("Number confirmed. Text notices are on. You can add Text message under Two-step verification.");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast(problem(e));
    }
  };
  // Save the profile; shared theme controls live in the menu, so this form leaves the account theme untouched
  const save = async () => {
    setBusy(true);
    try {
      const changingPhone = draft.phone !== me.user.phone;
      const startingTexts = draft.smsConsent && !me.user.smsConsentAt && draft.phone === me.user.phone;
      const user = await api<User>("/me", { method: "PATCH", body: { version: me.user.version, ...draft } });
      qc.setQueryData(["me"], { ...me, user });
      setDraft((current) => ({ ...current, phone: user.phone, smsConsent: Boolean(user.smsConsentAt) }));
      // The text state depends on what was saved; read it back fresh
      qc.invalidateQueries({ queryKey: ["me"] });
      toast(startingTexts
        ? "Saved. Reply YES to the 1NEON text to confirm this number."
        : changingPhone && draft.smsConsent ? "Phone saved. Check Text me and save to opt in to this number." : "Saved");
    } catch (e) {
      toast(problem(e));
      qc.invalidateQueries({ queryKey: ["me"] });
    }
    setBusy(false);
  };
  // Make a passkey on this device and register it with the account
  const addPasskey = async () => {
    try {
      const { options } = await api<{ options: Parameters<typeof passkeyCreation>[0] }>("/me/passkey/start", { method: "POST", body: {} });
      const credential = await passkeyCreation(options);
      await api("/me/passkey/finish", { method: "POST", body: { credential } });
      toast("Passkey added. Use it whenever 1NEON asks you to confirm it's you.");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast(e instanceof DOMException ? "The passkey wasn't made. Try again when you're ready." : problem(e));
    }
  };
  // Text codes: on once the number is proved; off needs a confirmed session (the API asks)
  const textFactor = async (on: boolean) => {
    if (!on && !(await ask({ title: "Turn off text codes?", body: "You'll confirm it's you with a passkey or your authenticator app instead.", yes: "Turn off", danger: true }))) return;
    try {
      await api("/me/text-factor", { method: on ? "POST" : "DELETE", body: on ? {} : undefined });
      toast(on ? "Text codes are on. Use one whenever 1NEON asks you to confirm it's you." : "Text codes are off.");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast(problem(e));
    }
  };
  // Remove the authenticator app (the API asks to confirm first when needed)
  const removeTotp = async () => {
    if (!(await ask({ title: "Remove the authenticator app?", body: "Its codes stop working for your account. You can set it up again any time.", yes: "Remove", danger: true }))) return;
    try {
      await api("/me/totp", { method: "DELETE" });
      toast("Authenticator app removed.");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast(problem(e));
    }
  };
  // Dev and demo: forget who you picked. Production: the API revokes tokens and returns Cognito's logout URL
  const signOut = async () => {
    forgetScroll();
    // The live playback's story lives in this page, so signing out stays in it, at the sign-in
    if (LIVE) {
      devUser.set("");
      qc.clear();
      navigate("/");
      return;
    }
    if (pickPerson) {
      devUser.set("");
      location.href = `${BASE_PATH}/`;
      return;
    }
    const r = await api<{ redirect: string }>("/auth/logout", { method: "POST" }).catch(() => ({ redirect: "/1NEON/" }));
    location.href = r.redirect;
  };
  return (
    <div>
      {/* Who this is */}
      <h1 className="page-title" style={{ display: "flex", gap: 12, alignItems: "center" }}><Avatar id={me.user.id} name={me.user.name || me.user.email} size={40} />Your profile</h1>
      <p className="lead">{me.user.email}{me.operator ? " · neon1 operator" : ""}</p>
      {/* Name, title, and mobile number */}
      {/* Two columns on a wide screen: profile and preferences beside notifications; one column when narrow */}
      <div className="cols2">
      <form id="profile" className="form profile-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <section className="card profile-section">
          <h2 className="card-h">Your details</h2>
        <div><label htmlFor="nm">Name</label><input id="nm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} autoComplete="name" /></div>
        <div><label htmlFor="tt">Title</label><input id="tt" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} autoComplete="organization-title" /></div>
        {!noTexts && <div><label htmlFor="ph">Phone (only you see it)</label><input id="ph" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} maxLength={32} autoComplete="tel" /></div>}
        {/* The zone email shows times in; the browser's until changed */}
        <div>
          <label htmlFor="tz">Time zone (email times)</label>
          <select id="tz" value={draft.timeZone} onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}>
            {zoneChoices(draft.timeZone).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
          <span className="muted">Emails show times in this zone, with UTC beside them. Daylight saving follows it automatically.</span>
        </div>
        </section>
        <section className="card profile-section">
          <h2 className="card-h">Preferences</h2>
        {/* Motion: smooth by default; Reduced turns every animation off in this browser at once, and a device
            that asks for less motion keeps it reduced (lib/motion.ts) */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 8 }}>Motion</legend>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["smooth", "reduced"] as const).map((m) => (
              <label key={m} className={`chip${(m === "reduced") === less ? " on" : ""}`} style={{ cursor: deviceLess ? "default" : "pointer" }}>
                <input type="radio" name="motion" className="sr" disabled={deviceLess} checked={(m === "reduced") === less} onChange={() => { setLessMotion(m === "reduced"); setLess(m === "reduced"); }} />
                {m === "smooth" ? "Smooth" : "Reduced"}
              </label>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>{deviceLess ? "Your device asks for less motion, so 1NEON keeps it reduced." : "Applies right away, in this browser."}</p>
        </fieldset>
        {/* Menu: default opens it from the menu buttons; mini also keeps a slim icon menu on screen */}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: 8 }}>Menu</legend>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["default", "mini"] as const).map((m) => (
              <label key={m} className={`chip${draft.menu === m ? " on" : ""}`} style={{ cursor: "pointer" }}>
                <input type="radio" name="menu" className="sr" checked={draft.menu === m} onChange={() => { setDraft({ ...draft, menu: m }); previewMenu(m); }} />
                {m === "default" ? "Default" : "Mini"}
              </label>
            ))}
          </div>
          <p className="muted small" style={{ margin: "6px 0 0" }}>{draft.menu === "mini" ? "A slim menu of icons stays on the left. The menu button opens the full menu over it." : "The menu button opens the full menu. A tap outside it, or the button again, closes it."}</p>
          {draft.menu !== menuOf(me.user.menu) && <p className="unsaved small" role="status">Showing this now. Press Save to keep it.</p>}
        </fieldset>
        </section>
      </form>
      <div className="form">
        {/* Each notification kind keeps its email and text choices together */}
        <div className="card small notify" id="notifications">
          <b>Notifications</b>
          <span className="muted">Everything shows under the bell. Choose what also reaches you by email or text. Important ones email you by default.</span>
          <div className="notify-table-scroll" role="region" aria-label="Notification delivery preferences" tabIndex={0}>
            <table className="notify-table">
              <thead><tr><th scope="col">When</th><th scope="col">Email</th><th scope="col">Text</th></tr></thead>
              <tbody>
                {NOTIFY_GROUPS.map((g) => {
                  // The saved choice, or the group's default
                  const cur = draft.notify[g.id] ?? { email: g.email, sms: false };
                  const set = (patch: Partial<typeof cur>) => setDraft({ ...draft, notify: { ...draft.notify, [g.id]: { ...cur, ...patch } } });
                  return (
                    <tr key={g.id}>
                      <th scope="row"><span>{g.label}{g.level === "critical" && <span className="tag rec">important</span>}</span><span className="muted">{g.hint}</span></th>
                      <td><label className="notify-hit"><input type="checkbox" aria-label={`Email me: ${g.label}`} checked={cur.email} onChange={(e) => set({ email: e.target.checked })} /></label></td>
                      <td><label className="notify-hit"><input type="checkbox" aria-label={`Text me: ${g.label}`} checked={textsAvailable && cur.sms} disabled={!textsAvailable} onChange={(e) => set({ sms: e.target.checked })} /></label></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!noTexts && <fieldset className="notify-texts" id="texts">
            <legend>Text messages</legend>
            {/* Consent is distinct from proving the number; the setup message asks for an explicit YES reply */}
            {draft.phone.trim() ? (
              <label className="sms-consent">
                <input type="checkbox" checked={draft.smsConsent} onChange={(e) => setDraft({ ...draft, smsConsent: e.target.checked })} />
                <span>
                  <b>Text me at {draft.phone.trim()}</b> one setup text, then 1NEON project notices from neon1 LLC for the kinds I choose below. If I turn on Text message under Two-step verification, I may also get sign-in codes. Reply YES to confirm this number after saving.
                  <span className="muted"> Texts are optional and not required to use 1NEON. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. See the <Link to="/privacy">Privacy policy</Link> and <Link to="/terms">Terms</Link>.</span>
                </span>
              </label>
            ) : (
              <span className="muted">To get texts, add a phone number above.</span>
            )}
            {/* Where texts stand once saved, and the code check that turns them on */}
            {!smsDirty && SMS_NOTE[sms] && <span className={`muted sms-${sms}`} role="status">{SMS_NOTE[sms]}</span>}
            {!smsDirty && sms === "unverified" && (code === undefined
              ? <button className="btn btn-ghost btn-sm" type="button" onClick={() => void sendCode()}>Text me a code</button>
              : (
                <form className="sms-code" onSubmit={(e) => { e.preventDefault(); void checkCode(); }}>
                  <label id="smscode-label" htmlFor="smscode">Code from the text</label>
                  <input id="smscode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
                  <button className="btn btn-primary btn-sm" type="submit" disabled={code.length !== 6}>Confirm</button>
                  <button className="linkish small" type="button" onClick={() => void sendCode()}>Send another</button>
                </form>
              ))}
            {smsDirty && (draft.smsConsent || draft.phone !== me.user.phone) && draft.phone.trim() && <span className="muted">Save first, then confirm the number with a texted code.</span>}
          </fieldset>}
        </div>
      </div>
      </div>
        {/* Save covers the profile and the notifications; it opens only when something changed */}
        <div className="actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" form="profile" disabled={busy || !dirty}>{busy ? "Saving…" : "Save"}</button>
          {dirty && <span className="unsaved small" role="status">Unsaved changes. Press Save to keep them.</span>}
        </div>
      {/* Everything below takes effect right away, so it sits outside the profile form */}
      <div className="cols2" style={{ marginTop: 28 }}>
      <div className="form">
        {/* Two-step verification: any one of these confirms it's you before admin actions */}
        <div className="card small security" data-tour="passkey" id="security">
          <b>Two-step verification</b>
          <span className="muted">Any one works. Add a second as a backup.</span>
          <ul className="factors">
            <li>
              <span><b>Passkey</b><br /><span className="muted">Your face, fingerprint, or device PIN. Works on iPhone, Android, Mac, and Windows.</span></span>
              {me.factors?.passkey ? <span className="tag client">on</span> : null}
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void addPasskey()}>{me.factors?.passkey ? "Add another" : "Add"}</button>
            </li>
            <li>
              <span><b>Authenticator app</b><br /><span className="muted">A 6-digit code from Google Authenticator, Authy, or similar.</span></span>
              {me.factors?.totp ? <span className="tag client">on</span> : null}
              {me.factors?.totp
                ? <button className="btn btn-ghost btn-sm" type="button" onClick={() => void removeTotp()}>Remove</button>
                : <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTotpOpen(true)}>Set up</button>}
            </li>
            {!noTexts && <>
            {/* Text codes go only to the number proved under Notifications, and only once texting is live */}
            <li>
              <span><b>Text message</b><br /><span className="muted">
                {sms === "unavailable" ? "A 6-digit code by text. Available once 1NEON texting is switched on."
                  : me.factors?.sms || sms === "ready" ? <>A 6-digit code texted to {me.user.phone}.</>
                  : <>A 6-digit code by text. First <a href="#notifications">confirm your number</a> under Notifications.</>}
              </span></span>
              {me.factors?.sms ? <span className="tag client">on</span> : null}
              {me.factors?.sms
                ? <button className="btn btn-ghost btn-sm" type="button" onClick={() => void textFactor(false)}>Turn off</button>
                : <button className="btn btn-ghost btn-sm" type="button" disabled={sms !== "ready"} onClick={() => void textFactor(true)}>Turn on</button>}
            </li>
            </>}
          </ul>
          <span className="muted">
            {me.strongSession ? "This session is confirmed. Admin actions are open." : me.factors?.any ? <>To use admin actions, <button type="button" className="link" onClick={askToConfirm}>confirm it's you</button>.</> : "Add one of these to use admin actions."}
          </span>
        </div>
      </div>
      <div className="form">
        {/* The tutorial: replay the welcome tour, or read the FAQs */}
        <div className="card small" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <b>Tutorial</b>
          <span className="muted">Each page also has its own guide under ?. Home's guide card links the example, the walkthrough, and the FAQs.</span>
          <div className="actions">
            <button className="btn btn-ghost" type="button" onClick={help.welcomeTour}>Replay the tour</button>
            <Link className="btn btn-ghost" to="/faqs">FAQs</Link>
            <button className="btn btn-ghost" type="button" onClick={() => { const was = guidesHidden(me.user.id); hideGuides(me.user.id, false); toast(was ? "Guide cards are back on Home." : "Guide cards are already showing on Home."); }}>Show guide cards on Home</button>
          </div>
        </div>
        {/* Something broken or confusing: straight to neon1, with the page and theme */}
        <div className="card small" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <b>Something not working?</b>
          <span className="muted">Tell me what happened, or what you think, on a page that opens in a new tab.</span>
          <div className="actions"><ReportBug kind="buttons" /></div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
      </div>
      {/* The authenticator setup has its own form, so it lives outside the profile form: Enter there
          checks the code instead of saving the profile */}
      <TotpSetup open={totpOpen} onClose={() => setTotpOpen(false)} onDone={() => { setTotpOpen(false); qc.invalidateQueries({ queryKey: ["me"] }); }} />
    </div>
  );
}
