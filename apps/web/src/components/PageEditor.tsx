// apps/web/src/components/PageEditor.tsx - One shared page, written together. Tiptap (ProseMirror) on a
// Yjs document kept in step by lib/pagesync.ts, so two people typing at once both keep their words.
// Markdown shortcuts work as typed ("# ", "- ", "[ ] ", "> "); the bar holds the same few formats for
// touch. References: Plane's Pages and Notion for the quiet page, Google Docs for presence.


import Collaboration from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListChecks, ListOrdered, Quote } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type * as Y from "yjs";
import { usePageSync, type Here, type PageMeta } from "../lib/pagesync.ts";
import { Avatar } from "./ui.tsx";


/** A page's content as Markdown, for download and saving to Files */
export function toMarkdown(node: JSONContent, depth = 0): string {
  const inline = (n: JSONContent): string => (n.content ?? []).map((c) => {
    if (c.type === "hardBreak") return "  \n";
    let t = c.text ?? "";
    for (const m of c.marks ?? []) {
      if (m.type === "bold") t = `**${t}**`;
      else if (m.type === "italic") t = `*${t}*`;
      else if (m.type === "code") t = `\`${t}\``;
      else if (m.type === "strike") t = `~~${t}~~`;
      else if (m.type === "link") t = `[${t}](${String(m.attrs?.href ?? "")})`;
    }
    return t;
  }).join("");
  const pad = "  ".repeat(depth);
  const list = (n: JSONContent, mark: (i: number, c: JSONContent) => string) => (n.content ?? []).map((item, i) => {
    const [first, ...rest] = item.content ?? [];
    return `${pad}${mark(i, item)}${first ? inline(first) : ""}\n${rest.map((r) => toMarkdown({ type: "doc", content: [r] }, depth + 1)).join("")}`;
  }).join("");
  return (node.content ?? []).map((n) => {
    switch (n.type) {
      case "heading": return `${"#".repeat(Number(n.attrs?.level ?? 2))} ${inline(n)}\n\n`;
      case "paragraph": return depth ? `${pad}${inline(n)}\n` : `${inline(n)}\n\n`;
      case "bulletList": return list(n, () => "- ") + (depth ? "" : "\n");
      case "orderedList": return list(n, (i) => `${i + 1}. `) + (depth ? "" : "\n");
      case "taskList": return list(n, (_i, c) => (c.attrs?.checked ? "- [x] " : "- [ ] ")) + (depth ? "" : "\n");
      case "blockquote": return toMarkdown(n).trim().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
      case "codeBlock": return `\`\`\`\n${inline(n)}\n\`\`\`\n\n`;
      case "horizontalRule": return "---\n\n";
      default: return inline(n);
    }
  }).join("");
}


/** The formats a touch screen can't type as shortcuts, as one row of icon buttons */
function Bar({ editor }: { editor: Editor }) {
  const on = useEditorState({ editor, selector: ({ editor: e }) => ({
    h: e.isActive("heading", { level: 2 }), b: e.isActive("bold"), i: e.isActive("italic"),
    ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), todo: e.isActive("taskList"), q: e.isActive("blockquote"),
  }) });
  // Pressing a format keeps the text's selection (mousedown would take focus)
  const btn = (label: string, active: boolean, run: () => void, icon: ReactNode) => (
    <button type="button" className={`icon-act${active ? " on" : ""}`} aria-label={label} title={label} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run}>{icon}</button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="page-bar" role="toolbar" aria-label="Format">
      {btn("Heading", on.h, () => c().toggleHeading({ level: 2 }).run(), <Heading2 size={16} aria-hidden="true" />)}
      {btn("Bold", on.b, () => c().toggleBold().run(), <Bold size={16} aria-hidden="true" />)}
      {btn("Italic", on.i, () => c().toggleItalic().run(), <Italic size={16} aria-hidden="true" />)}
      {btn("Bulleted list", on.ul, () => c().toggleBulletList().run(), <List size={16} aria-hidden="true" />)}
      {btn("Numbered list", on.ol, () => c().toggleOrderedList().run(), <ListOrdered size={16} aria-hidden="true" />)}
      {btn("Checklist", on.todo, () => c().toggleTaskList().run(), <ListChecks size={16} aria-hidden="true" />)}
      {btn("Quote", on.q, () => c().toggleBlockquote().run(), <Quote size={16} aria-hidden="true" />)}
    </div>
  );
}


/** The editor proper, made once the document has loaded so it never starts from a blank copy */
function Surface({ doc, canEdit, placeholder, onEditor }: { doc: Y.Doc; canEdit: boolean; placeholder: string; onEditor: (e: Editor) => void }) {
  const editor = useEditor({
    // Undo comes from the shared document's history, so StarterKit's own is off
    extensions: [
      StarterKit.configure({ undoRedo: false, link: { openOnClick: !canEdit, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Collaboration.configure({ document: doc, field: "page" }),
    ],
    editable: canEdit,
    editorProps: { attributes: { class: "page-text", "aria-label": "Page" } },
  }, [doc, canEdit]);
  // The live editor goes up for download and the plain copy; a rebuilt one replaces it
  useEffect(() => { if (editor) onEditor(editor); }, [editor, onEditor]);
  if (!editor) return null;
  return (
    <>
      {canEdit && <Bar editor={editor} />}
      <EditorContent editor={editor} />
    </>
  );
}


/** Others with the page open, as avatars */
function Present({ here }: { here: Here[] }) {
  if (!here.length) return null;
  const names = here.map((h) => h.name).join(", ");
  return <span className="page-here" title={`Here now: ${names}`} aria-label={`Here now: ${names}`}>{here.slice(0, 4).map((h) => <Avatar key={h.id} id={h.id} name={h.name} size={22} />)}</span>;
}


/**
 * A shared page at `path` (its API path). `head` sits above the text (a title, actions) and gets the
 * editor once there is one, for download and saving
 */
export function PageEditor({ path, canEdit, placeholder = "Write anything: notes, ideas, what you need, links.", head }: { path: string; canEdit: boolean; placeholder?: string; head?: (x: { editor?: Editor; meta?: PageMeta; here: ReactNode }) => ReactNode }) {
  const [editor, setEditor] = useState<Editor>();
  const { doc, ready, here, trouble, meta } = usePageSync(path, () => (editor && !editor.isDestroyed ? editor.getText({ blockSeparator: "\n\n" }) : ""));
  return (
    <div className="page-doc">
      {head?.({ editor, meta, here: <Present here={here} /> })}
      {trouble && <p className="helper warn" role="status">{trouble}</p>}
      {ready ? <Surface doc={doc} canEdit={canEdit} placeholder={placeholder} onEditor={setEditor} /> : !trouble && <p className="helper" role="status">Opening…</p>}
    </div>
  );
}
