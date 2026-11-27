// The shared phone page index is visual progress only, with pointer input disabled.
const compact = matchMedia("(max-width: 1199px), (pointer: coarse)");
const sync = () => {
  document.querySelectorAll<HTMLElement>(".pi-rail").forEach((rail) => {
    rail.toggleAttribute("inert", compact.matches);
    if (compact.matches) rail.setAttribute("aria-hidden", "true");
    else rail.removeAttribute("aria-hidden");
  });
};
new MutationObserver(sync).observe(document.body, { childList: true });
compact.addEventListener("change", sync);
