// apps/web/src/lib/keys.ts - Keyboard semantics for the whole portal: focus rings show only while someone moves by
// keyboard (html[data-keys], the rule is in neon1.tech's shared/neon1.css), F6 steps between the page's regions (menu,
// top bar, the section, Neo), and [ opens or closes the menu. A modal dialog and the open menu already keep Tab inside
// themselves (native showModal, and Shell's inert page), so these only move between what is reachable.


// Keys that move focus rather than type; a letter typed into a field keeps the ring hidden
const MOVES = new Set(["Tab", "F6", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
const FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable='true']";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), summary";
// The page's regions in reading order; each is reached with F6 (Shift+F6 goes back)
const REGIONS = [".side", "header.top", "#main", ".tabbar", ".n1chat"];

const inField = (t: EventTarget | null) => t instanceof Element && t.matches(FIELD);
const visible = (el: Element) => !el.closest("[inert]") && (el as HTMLElement).offsetParent !== null;


/** Installs the listeners once; main.tsx calls it at start */
export function keyboardSemantics() {
  const root = document.documentElement;
  // Arrows inside a field move the text caret, not focus, so they don't count there
  addEventListener("keydown", (e) => {
    if (MOVES.has(e.key) && !(e.key.startsWith("Arrow") && inField(e.target))) root.dataset.keys = "";
  }, true);
  // Any pointer or touch puts the rings away again
  addEventListener("pointerdown", () => { delete root.dataset.keys; }, true);

  addEventListener("keydown", (e) => {
    // F6: the next region that's on screen and not behind the open menu or a dialog
    if (e.key === "F6" && !document.querySelector("dialog[open]")) {
      const regions = REGIONS.map((s) => document.querySelector<HTMLElement>(s)).filter((el): el is HTMLElement => !!el && visible(el));
      if (!regions.length) return;
      e.preventDefault();
      const at = regions.findIndex((r) => r.contains(document.activeElement));
      const next = regions[(at + (e.shiftKey ? -1 : 1) + regions.length) % regions.length]!;
      const target = next.querySelector<HTMLElement>("[aria-current='page']") ?? [...next.querySelectorAll<HTMLElement>(FOCUSABLE)].find(visible) ?? next;
      if (target === next && !next.hasAttribute("tabindex")) next.tabIndex = -1;
      target.focus();
      return;
    }
    // [ toggles the menu (Linear's key for its sidebar), never while typing or with a modifier
    if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey && !inField(e.target) && !document.querySelector("dialog[open]")) {
      const btn = [...document.querySelectorAll<HTMLElement>(".menu-btn")].find(visible);
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });
}
