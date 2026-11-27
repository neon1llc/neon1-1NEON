// apps/web/src/lib/itemRoute.ts - An item's panel lives in the address (#item-<id>), as Linear's and Asana's
// items have their own links: opening one adds the address, so it can be pasted, and Back closes it; a link
// from Home, the calendar, the bell, or an email opens the panel, not just the row.


import { useEffect, useId, useRef } from "react";
import { useLocation, useNavigate } from "react-router";

// The first row on the page for an item opens its panel; another copy of the same item (a summary elsewhere
// on the page) never opens a second one
const claimed = new Map<string, string>();


/** Whether this item's panel is open, and a way to open or close it through the address */
export function useItemRoute(itemId: string): [boolean, (open: boolean) => void] {
  const { hash, pathname, search, state } = useLocation();
  const navigate = useNavigate();
  const me = useId();
  // Claim the item while mounted; give it up on unmount
  if (!claimed.has(itemId)) claimed.set(itemId, me);
  useEffect(() => () => { if (claimed.get(itemId) === me) claimed.delete(itemId); }, [itemId, me]);
  const open = hash === `#item-${itemId}` && claimed.get(itemId) === me;
  // Opened here (not arrived at by link): closing goes Back, so the address and history stay one step
  const pushed = useRef(false);
  const set = (next: boolean) => {
    if (next && !open) {
      pushed.current = true;
      navigate({ pathname, search, hash: `item-${itemId}` }, { preventScrollReset: true, state: { ...(state as object | null), itemPanel: itemId } });
    } else if (!next && open) {
      if (pushed.current && (state as { itemPanel?: string } | null)?.itemPanel === itemId) navigate(-1);
      else navigate({ pathname, search, hash: "" }, { replace: true, preventScrollReset: true });
      pushed.current = false;
    }
  };
  return [open, set];
}
