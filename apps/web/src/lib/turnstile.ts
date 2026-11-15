// apps/web/src/lib/turnstile.ts - Cloudflare Turnstile, the invisible check on the sign-up form. Its
// script loads only when the form opens, never on other screens, so the rest of 1NEON makes no call to
// Cloudflare. The page's security policy allows exactly this host for scripts and frames.


// The script's address; render=explicit means nothing draws until the form asks
export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";


/** The part of Turnstile's browser API used here */
export interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}


// One load, shared by every call; a failed load is forgotten so the next open tries again
let loading: Promise<TurnstileApi> | undefined;

/** Load Turnstile's script once and resolve with its API */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      s.remove();
      loading = undefined;
      reject(new Error("turnstile blocked"));
    };
    document.head.append(s);
  });
  return loading;
}


/** The widget's options: invisible unless Cloudflare needs the person to do something */
export function widgetOptions(sitekey: string, handlers: { callback: (token: string) => void; expired: () => void; error: () => void }) {
  return { sitekey, action: "signup", appearance: "interaction-only", size: "flexible", callback: handlers.callback, "expired-callback": handlers.expired, "error-callback": handlers.error };
}
