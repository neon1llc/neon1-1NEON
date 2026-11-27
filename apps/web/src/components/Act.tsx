// apps/web/src/components/Act.tsx - The action button: a small round icon that opens sideways to its name on the
// first press, and acts on the second (Home's View menu started it with Tidy up and Reset). A record's standalone
// actions (suspend, deactivate, resend, archive) use it instead of text that looks like a link. For a major one,
// `run` opens that action's own dialog, which says what will happen and takes its choices.


import type { LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";


// One open at a time across the page: opening one closes the rest
const ARM = "1neon:act-arm";


/** A two-press action: the first press shows its name, the second runs it */
export function Act({ icon: Icon, label, run, tone, disabled, title, className }: {
  icon: LucideIcon; label: string; run: () => void; tone?: "danger"; disabled?: boolean; title?: string; className?: string;
}) {
  const id = useId();
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // Closes when another opens, on Escape, or on a press anywhere else
  useEffect(() => {
    if (!armed) return;
    const other = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setArmed(false); };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setArmed(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setArmed(false); };
    addEventListener(ARM, other);
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => { removeEventListener(ARM, other); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [armed, id]);
  return (
    <button ref={ref} type="button" className={`act${armed ? " open" : ""}${tone ? ` ${tone}` : ""}${className ? ` ${className}` : ""}`} disabled={disabled}
      aria-label={armed ? `${label}: press again` : label} title={title ?? label}
      // A control inside something clickable (an upload zone, a row) acts on its own
      onClick={(e) => {
        e.stopPropagation();
        if (armed) { setArmed(false); run(); return; }
        setArmed(true);
        dispatchEvent(new CustomEvent(ARM, { detail: id }));
      }}>
      <span className="act-l"><span>{label}</span></span><Icon size={15} aria-hidden="true" />
    </button>
  );
}


/** A row of actions, kept on one line and ending at the row's end */
export function Acts({ children }: { children: ReactNode }) {
  return <span className="acts">{children}</span>;
}
