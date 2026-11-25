// apps/web/src/lib/signout.ts - The one way out of 1NEON, for the profile's button and the menu's.


import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, BASE_PATH, devUser, LIVE, pickPerson } from "./api.ts";
import { forgetScroll } from "./scrollmemory.ts";


/** Dev and demo: forget who you picked. Production: the API revokes tokens and returns Cognito's logout URL */
export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    forgetScroll();
    // The live playback's story lives in this page, so signing out stays in it, at the sign-in
    if (LIVE) {
      devUser.set("");
      qc.clear();
      navigate("/");
      return;
    }
    if (pickPerson) {
      devUser.set("");
      location.href = `${BASE_PATH}/`;
      return;
    }
    const r = await api<{ redirect: string }>("/auth/logout", { method: "POST" }).catch(() => ({ redirect: "/1NEON/" }));
    location.href = r.redirect;
  };
}
