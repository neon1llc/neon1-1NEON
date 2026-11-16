// apps/web/src/components/OrgFace.tsx - Where an organization can be seen from outside: the city and
// state it's based in, and its website or a public page. Both are optional at sign-up, so a person who'd
// rather stay private can start; this shows them, lets an admin change them (Settings), and asks for them
// on Home when an organization has neither, until the admin adds one or says "Not now".


import { HttpError } from "../lib/api.ts";
import { joinPlace, normalizeLink, OUTSIDE_US, placeShapeProblem, splitPlace, US_STATES, type Tenant } from "@1neon/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { problem } from "../lib/hooks.ts";
import { prefs } from "../lib/prefs.ts";
import { useOrg } from "./Shell.tsx";
import { useToast } from "./ui.tsx";


/** A link that leaves neon1: a new tab, no referrer, and the northeast arrow */
export function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="out" href={href} target="_blank" rel="noopener noreferrer">{children}<span className="out-arrow" aria-hidden="true">↗</span></a>;
}


/** The link as people read it: no https://, no trailing slash */
export function linkLabel(link: string) {
  return link.replace(/^https?:\/\//, "").replace(/\/$/, "");
}


/** The place and link, read only, or "Not added yet" */
export function FaceFacts({ place, link }: Pick<Tenant, "place" | "link">) {
  if (!place && !link) return <span className="muted">Not added yet</span>;
  return <>{place}{place && link && " · "}{link && <OutLink href={link}>{linkLabel(link)}</OutLink>}</>;
}


// Home's ask stays put away once an admin says "Not now", per organization, in this browser
const askKey = (orgId: string) => `1neon.face-ask.${orgId}`;
export const faceAskDismissed = (orgId: string) => prefs.get(askKey(orgId)) === "no";


/** An admin's form for the place and link. `ask` is Home's version, with the reason it's asked */
export function FaceForm({ ask = false, onDone }: { ask?: boolean; onDone?: () => void }) {
  const { org, summary, access } = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  // The place in two parts, as on sign-up: a city needs its state, the state alone is fine
  const [city, setCity] = useState(() => splitPlace(org.place ?? "").city);
  const [state, setState] = useState<string>(() => splitPlace(org.place ?? "").state);
  const [link, setLink] = useState(org.link ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The API's answers by field (a link or place it can't take), shown under each
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const place = joinPlace(city, state);
  const linkBad = link.trim() !== "" && normalizeLink(link) === undefined;
  const placeBad = placeShapeProblem(city, state);
  const linkMsg = fieldErrs.link ?? (linkBad ? "Enter a web address, like yourbusiness.com." : undefined);
  const placeMsg = fieldErrs.place ?? placeBad;
  // Home's ask needs one to save; Settings can also clear both
  const ready = (!ask || place !== "" || link.trim() !== "") && !linkBad && !placeBad;
  const changed = place !== (org.place ?? "") || (link.trim() ? normalizeLink(link) : "") !== (org.link ?? "");

  // Save both against the organization's version; the frame's copy of the organization takes the answer
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await api<Tenant>(`/t/${org.id}/profile`, { method: "PUT", body: { version: org.version, place, link } });
      qc.setQueryData(["org", summary.id], { org: next, access });
      setLink(next.link ?? "");
      // The place comes back in its proper spelling
      setCity(splitPlace(next.place ?? "").city);
      setState(splitPlace(next.place ?? "").state);
      setFieldErrs({});
      toast("Saved");
      onDone?.();
    } catch (e) {
      const byField = e instanceof HttpError && e.body.error === "check_fields" ? (e.body.current as { fields?: Record<string, string> } | undefined)?.fields : undefined;
      if (byField) setFieldErrs(byField);
      else setError(problem(e));
    }
    setBusy(false);
  };

  return (
    <form className={`face-form${ask ? " card" : ""}`} onSubmit={(e) => { e.preventDefault(); if (ready && changed && !busy) void save(); }}>
      {ask && <h2 className="section-h">Where can I see your business?</h2>}
      <p className="muted small">{ask ? "If you'd like, add your website or a public page (Google, Yelp, LinkedIn), or where you're based, so I know who I'm working with. One is enough, and you can skip it." : "Your website or a public page, and where you're based. Both are optional."}</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <label className="field-label" htmlFor="face-link">Website or public page</label>
      <input id="face-link" inputMode="url" maxLength={200} autoComplete="url" placeholder="yourbusiness.com" aria-invalid={linkMsg ? true : undefined} aria-describedby={linkMsg ? "face-link-error" : undefined} value={link} onChange={(e) => { setLink(e.target.value); setFieldErrs(({ link: _l, ...r }) => r); }} />
      {linkMsg && <p className="small field-error" id="face-link-error" role="status">{linkMsg}</p>}
      {/* City and state side by side, the state narrower */}
      <div className="face-pair">
        <div>
          <label className="field-label" htmlFor="face-city">{state === OUTSIDE_US ? "City and country" : "City"}</label>
          <input id="face-city" maxLength={80} autoComplete={state === OUTSIDE_US ? "off" : "address-level2"} placeholder={state === OUTSIDE_US ? "Toronto, Canada" : "Albany"} aria-invalid={placeMsg ? true : undefined} aria-describedby={placeMsg ? "face-place-error" : undefined} value={city} onChange={(e) => { setCity(e.target.value); setFieldErrs(({ place: _p, ...r }) => r); }} />
        </div>
        <div>
          <label className="field-label" htmlFor="face-state">State</label>
          <select id="face-state" autoComplete="address-level1" aria-invalid={placeMsg ? true : undefined} value={state} onChange={(e) => { setState(e.target.value); setFieldErrs(({ place: _p, ...r }) => r); }}>
            <option value="">State</option>
            {Object.entries(US_STATES).map(([code, n]) => <option key={code} value={code}>{n}</option>)}
            <option value={OUTSIDE_US}>Outside the US</option>
          </select>
        </div>
      </div>
      {placeMsg && <p className="small field-error" id="face-place-error" role="status">{placeMsg}</p>}
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={!ready || !changed || busy}>{busy ? "Saving…" : "Save"}</button>
        {onDone && !ask && <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>}
        {ask && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { prefs.set(askKey(org.id), "no"); onDone?.(); }}>Not now</button>}
      </div>
    </form>
  );
}
