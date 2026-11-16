// packages/domain/src/timing.ts - Relative request timing ("this month", "this quarter") resolved to
// one absolute due date, the same way in the browser (to show it before sending) and in the API.


// Used when an organization has no time zone of its own
export const DEFAULT_TIME_ZONE = "America/New_York";


/** The words people chose, by the key the request form stores */
export const TIMING_WORDS = { soon: "this month", quarter: "this quarter" } as const;


/** Today's calendar date (YYYY-MM-DD) in a time zone; an unknown zone falls back to the default */
export function todayIn(timeZone: string = DEFAULT_TIME_ZONE, now = new Date()): string {
  const fmt = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return fmt(timeZone);
  } catch {
    return fmt(DEFAULT_TIME_ZONE);
  }
}


/**
 * The organization's calendar (AUTH-P01). Business dates (Today, due, overdue, on time, a reading's day)
 * are calendar dates in the organization's time zone; audit times stay instants. dateIn gives the local
 * date of an instant, plusDays steps a calendar date, and mondayOf finds the week it belongs to
 */
export function dateIn(instant: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const at = new Date(instant);
  return Number.isNaN(at.getTime()) ? instant.slice(0, 10) : todayIn(timeZone, at);
}
export function plusDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
export function mondayOf(date: string): string {
  return plusDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}


/** The last day of the month or quarter that contains today in `timeZone` */
export function periodEnd(period: "month" | "quarter", now = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  const [y, m] = todayIn(timeZone, now).split("-").map(Number) as [number, number];
  const endMonth = period === "month" ? m : Math.ceil(m / 3) * 3;
  // Day 0 of the next month is the last day of this one
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  return `${y}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}


/**
 * A relative choice as an absolute due date plus the original words, fixed at the moment it is made,
 * so it never changes meaning when read in a later month. Undefined for anything that isn't relative
 */
export function resolveTiming(key: unknown, now = new Date(), timeZone?: string): { dueDate: string; requestedTiming: string } | undefined {
  if (key !== "soon" && key !== "quarter") return undefined;
  return { dueDate: periodEnd(key === "soon" ? "month" : "quarter", now, timeZone || DEFAULT_TIME_ZONE), requestedTiming: TIMING_WORDS[key] };
}


/** Whether a string names a real IANA time zone, such as America/Chicago or Europe/Berlin */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}


/**
 * An instant for an email, in the reader's zone with UTC beside it: "Nov 15, 2026, 8:25 AM EST (13:25 UTC)".
 * Email can't run scripts, so the sender picks the zone. The IANA zone (never a fixed offset) means the
 * abbreviation and offset follow daylight saving, and leap days need nothing extra since the engine's
 * calendar already has them. A missing or unknown zone reads as neon1's own (America/New_York). When the
 * local date and the UTC date differ, the UTC part carries its date too
 */
export function formatWhen(at: Date, zone?: string): string {
  const tz = isTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  const parts = (timeZone: string, opts: Intl.DateTimeFormatOptions) => {
    const out: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).formatToParts(at)) out[p.type] = p.value;
    return out;
  };
  // Newer engines put a narrow no-break space before AM/PM; mail clients render it unevenly
  const plain = (s: string) => s.replace(/[  ]/g, " ");
  const date = (p: Record<string, string>) => `${p.month} ${p.day}, ${p.year}`;
  const local = parts(tz, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" });
  const utc = parts("UTC", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const clock = `${local.hour}:${local.minute} ${plain(local.dayPeriod ?? "")}`.trim();
  const head = `${date(local)}, ${clock}`;
  if (tz === "UTC") return plain(`${head} UTC`);
  const sameDay = date(local) === date(utc);
  return plain(`${head} ${local.timeZoneName} (${utc.hour}:${utc.minute} UTC${sameDay ? "" : `, ${utc.month} ${utc.day}`})`);
}
