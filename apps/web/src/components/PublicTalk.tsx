// apps/web/src/components/PublicTalk.tsx - The chat with Pradeep as a second tab in the public Neo window (neon1.tech's
// /shared/chat.js), for wherever the signed-in Neo isn't shown: the interactive demo, and any environment without the
// signed-in Neo. Neo stays the first tab, as the public window has always been; this adds neon1 beside it, with a count on
// the tab and the launcher. The conversation itself is components/Talk.tsx, drawn into the tab through a portal, so it keeps
// the page's data, toasts and session.


import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { usePublicNeo, type PublicTab } from "../lib/publicNeo.ts";
import { Talk, useUnread, type ChatOrg } from "./Talk.tsx";


export function PublicTalk({ org, me, demo }: { org?: ChatOrg; me: { id: string; operator: boolean }; demo: boolean }) {
  const neo = usePublicNeo();
  const loc = useLocation();
  const [tab, setTab] = useState<PublicTab>();
  // True while the neon1 tab is the one in view, so the conversation is read (and marked seen) only then
  const [active, setActive] = useState(false);
  // Each organization's chat lives on its own page, so super picking one from the inbox goes there, and each
  // browser tab keeps its own organization (Pradeep, 2026-11-27); everyone else has their own
  const navigate = useNavigate();
  const pick = (o: ChatOrg) => navigate(`/o/${o.slug}?chat=1`);
  const chatOrg = org;
  // In Potentials, the inbox lists potentials only
  const only = loc.pathname.startsWith("/all/prospects") ? ("potential" as const) : undefined;
  const canTalk = me.operator || Boolean(org);

  // Add the tab to the window while this is mounted, and take it away after
  useEffect(() => {
    if (!neo || !canTalk) return;
    const t = neo.addTab({ id: "pradeep", label: me.operator ? "Chat" : "neon1", hint: me.operator ? "Members write here" : "Replies by email", launcher: { label: "ask Neo or neon1", aria: "Ask Neo or message neon1" }, onselect: setActive });
    setTab(t);
    return () => { t.remove(); setTab(undefined); setActive(false); };
  }, [neo, canTalk, me.operator]);

  // The count of what is new, on the tab and the launcher, read now and then without marking anything seen
  const unread = useUnread(chatOrg, me.operator, active);
  useEffect(() => { tab?.badge(unread); }, [tab, unread]);

  // Alert emails open the page with ?chat=1, and links in the page ask with this event
  useEffect(() => {
    if (!neo || !tab) return;
    const talk = () => tab.show();
    if (new URLSearchParams(loc.search).get("chat") === "1") talk();
    addEventListener("1neon:chat", talk);
    return () => removeEventListener("1neon:chat", talk);
  }, [neo, tab, loc.search]);

  if (!tab) return null;
  return createPortal(<Talk org={chatOrg} me={me.id} operator={me.operator} active={active} pick={pick} only={only} note={demo ? "This is the demo: messages stay in your browser." : undefined} />, tab.el);
}
