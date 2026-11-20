// apps/web/src/lib/dialogfocus.ts - Where keyboard focus goes when a modal dialog opens. The browser puts it on the dialog's first
// focusable element, or on the dialog itself when it is still empty, and React's `autoFocus` runs before a closed dialog can take
// focus, so a box that asked for focus (the search field) lost it to whatever came first. Dialog (components/ui.tsx) mounts its
// content once it is showing, so `autoFocus` works; these two functions cover content that asks for nothing.


/** What a person can tab to inside a dialog */
export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';


/** Does a just-opened dialog still need focus placed in it? Not when something inside already has it (an `autoFocus` box) */
export function needsInitialFocus(dialog: { contains(node: unknown): boolean }, active: unknown): boolean {
  return active === dialog || !dialog.contains(active);
}


/** The element to focus in a dialog that asked for nothing: its first control, if it has one */
export function firstControl<T>(dialog: { querySelector(selector: string): T | null }): T | null {
  return dialog.querySelector(FOCUSABLE);
}
