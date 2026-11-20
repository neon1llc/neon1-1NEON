// apps/web/src/lib/calendar-keys.ts - Keyboard movement for Home's month of days. The month is one place to tab to (one day carries
// tabindex 0, the rest -1), and the arrow keys move between days, so 30 days are not 30 tab stops.


/** Which day, counting from 0 on the 1st, an arrow key moves to. `lead` is the blanks before the 1st (Monday first), so Home and End
 * find the week's ends. Keys that don't move return undefined; a move off the month stays on the edge day */
export function moveDay(key: string, index: number, count: number, lead: number): number | undefined {
  const col = (lead + index) % 7;
  const clamp = (n: number) => Math.max(0, Math.min(count - 1, n));
  switch (key) {
    case "ArrowRight": return clamp(index + 1);
    case "ArrowLeft": return clamp(index - 1);
    case "ArrowDown": return index + 7 < count ? index + 7 : index;
    case "ArrowUp": return index - 7 >= 0 ? index - 7 : index;
    case "Home": return clamp(index - col);
    case "End": return clamp(index + (6 - col));
    default: return undefined;
  }
}


/** The one day in the tab order: the one last focused, else the picked day, else today, else the 1st (all only if in the month shown) */
export function tabDay(shown: string, days: readonly string[], focused?: string, picked?: string, today?: string): string | undefined {
  for (const d of [focused, picked, today]) if (d && d.startsWith(shown) && days.includes(d)) return d;
  return days[0];
}
