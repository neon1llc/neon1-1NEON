// apps/web/src/components/Updates.tsx - A project's Updates lens: write to everyone on the project, then one
// stream, newest first, of messages, status updates, comments on items, and what changed. Everyone else
// gets each message by email and can answer by replying to it. References: Basecamp's message board
// (answers from email land in the thread), Linear's project updates, GitHub's timeline.


import { KIND_LAYER, type ItemKind, type Project } from "@1neon/domain";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.ts";
import { problem, useSubmit } from "../lib/hooks.ts";
import { read } from "../lib/reads.ts";
import { gate } from "./Reads.tsx";
import { useOrg, useSession } from "./Shell.tsx";
import { ago, Avatar, Health, layerSlug, useAsk, useToast } from "./ui.tsx";


/** One line of the stream, as GET /stream returns it (apps/api/src/routes/stream.ts) */
type Entry =
  | { type: "message"; id: string; at: string; by: string; authorId: string; body: string; via?: "email" }
  | { type: "update"; id: string; at: string; by: string; title: string; body: string; health?: string }
  | { type: "comment"; id: string; at: string; by: string; body: string; itemId: string; itemTitle: string; itemKind: string }
  | { type: "event"; id: string; at: string; by: string; summary: string; action: string; target: string };

// A change's summary often starts with the person's name, which the line already shows in bold
const withoutName = (summary: string, by: string) => (by && summary.startsWith(`${by} `) ? summary.slice(by.length + 1) : summary);


export function UpdatesLens({ project: p, base }: { project: Project; base: string }) {
  const { org, canAdmin } = useOrg();
  const me = useSession();
  const toast = useToast();
  const ask = useAsk();
  const path = `/t/${org.id}/projects/${p.id}/stream`;
  const stream = useQuery({ queryKey: ["stream", p.id], queryFn: () => read<{ entries: Entry[] }>(path, { entries: "array" }), refetchInterval: 30_000 });
  const [note, setNote] = useState("");
  const [posting, runPost] = useSubmit();

  // Send, then reload; the box clears only if it still holds what was sent
  const send = () => runPost(async () => {
    const sent = note;
    try {
      await api(path, { method: "POST", body: { body: sent } });
      setNote((now) => (now === sent ? "" : now));
      void stream.refetch();
    } catch (e) {
      toast(problem(e));
    }
  });
  // Taking a message back asks first, like every delete
  const remove = async (id: string) => {
    if (!(await ask({ title: "Delete this message?", body: "It's deleted for everyone on this project. Emails already sent stay sent.", yes: "Delete", danger: true }))) return;
    try {
      await api(`${path}/${id}`, { method: "DELETE" });
      void stream.refetch();
    } catch (e) {
      toast(problem(e));
    }
  };
  // An item's comment opens that item on its layer's tab
  const itemLink = (id: string, kind: string) => `${base}/${layerSlug(KIND_LAYER[kind as ItemKind] ?? "needs")}#item-${id}`;

  return (
    <section className="lens-updates" aria-label="Updates">
      {/* Anyone who may comment may write here, viewers included, as on an item */}
      {!p.archived && (
        <form className="say" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void send(); }}>
          <textarea aria-label="Write to everyone on this project" placeholder="Write to everyone on this project. They can reply by email." value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} />
          <button className="btn btn-sm" disabled={!note.trim() || posting}>{posting ? "Sending…" : "Send"}</button>
        </form>
      )}
      {gate([stream], { compact: true, what: "Loading updates…" })}
      {stream.data && stream.data.entries.length === 0 && <p className="empty-line">No updates yet. Write the first one.</p>}
      <ol className="stream">
        {stream.data?.entries.map((e) => {
          if (e.type === "event") return (
            <li key={e.id} className="s-event"><span>{e.by && <b>{e.by}</b>} {withoutName(e.summary, e.by)}</span><time dateTime={e.at}>{ago(e.at)}</time></li>
          );
          return (
            <li key={e.id} className={`s-${e.type}`}>
              <Avatar id={e.type === "message" ? e.authorId : e.by} name={e.by} size={28} />
              <div className="s-body">
                <p className="s-head">
                  <b>{e.by}</b>
                  {e.type === "update" && <> posted a status update {e.health && <Health value={e.health as Project["health"]} />}</>}
                  {e.type === "comment" && <> commented on <Link to={itemLink(e.itemId, e.itemKind)}>{e.itemTitle || "an item"}</Link></>}
                  {" "}<time className="muted small" dateTime={e.at}>{ago(e.at)}</time>
                  {e.type === "message" && e.via === "email" && <span className="muted small"> · by email</span>}
                </p>
                {e.type === "update" && <p className="s-title">{e.title}</p>}
                {e.body && <p className="pre">{e.body}</p>}
              </div>
              {e.type === "message" && (e.authorId === me.user.id || canAdmin) && <button className="icon-act" onClick={() => void remove(e.id)} aria-label="Delete message" title="Delete"><Trash2 size={14} aria-hidden="true" /></button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
