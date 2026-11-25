// apps/web/src/components/SignOutButton.tsx - The menu's two-step way out: the first press opens the icon into a button
// that says Sign out, and pressing that signs out.


import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSignOut } from "../lib/signout.ts";


// How long the opened button waits before closing, and how soon a second press counts (a double tap opens it only)
const WAIT_MS = 4000;
const SETTLE_MS = 400;


/** Closes again after a few seconds, on Escape, when focus leaves, or on a press anywhere else */
export function SignOutButton() {
  const signOut = useSignOut();
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const armed = armedAt !== null;
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const close = () => setArmedAt(null);
    const timer = window.setTimeout(close, WAIT_MS);
    // Safari doesn't focus a tapped button, so a tap elsewhere is watched for as well as the focus leaving
    const outside = (e: PointerEvent) => { if (!button.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", outside, true);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", outside, true); };
  }, [armed]);
  return (
    <>
      <button ref={button} className={`sign-out${armed ? " armed" : ""}`} type="button" aria-label={armed ? "Confirm sign out" : "Sign out"} title={armed ? undefined : "Sign out"}
        onClick={(e) => {
          // Safari leaves a tapped button unfocused, so it takes focus here for Escape and leaving it to close it
          if (armedAt === null) { e.currentTarget.focus({ preventScroll: true }); setArmedAt(e.timeStamp); return; }
          if (e.timeStamp - armedAt >= SETTLE_MS) void signOut();
        }}
        // Escape closes the button and leaves the menu open
        onKeyDown={(e) => { if (armed && e.key === "Escape") { e.stopPropagation(); setArmedAt(null); } }}
        // Safari drops a button's focus as it's pressed, which would close it under the finger before the press counted
        onMouseDown={(e) => e.preventDefault()}
        onBlur={() => setArmedAt(null)}>
        <LogOut size={16} aria-hidden="true" />
        <span aria-hidden="true">Sign out</span>
      </button>
      <span className="sr" role="status">{armed ? "Press again to sign out." : ""}</span>
    </>
  );
}
