// Intentional negative test: restore the compact progress rail to the accessibility tree.
const sync = () => {
  document.querySelectorAll<HTMLElement>(".pi-rail").forEach((rail) => {
    rail.removeAttribute("inert");
    rail.removeAttribute("aria-hidden");
  });
};
new MutationObserver(sync).observe(document.body, { childList: true });
