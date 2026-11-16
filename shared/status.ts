// The files the checker writes and the page reads, and the rules both sides
// share. Kept dependency-free so the Azure Function and the Astro page can
// each import it.

export type Level = "operational" | "degraded" | "down" | "unknown";

/** One minute's tally for a component on one UTC day. */
export interface DayCount {
  /** Checks run. */
  n: number;
  /** Checks while the component was down. */
  down: number;
  /** Checks that answered, but slowly. */
  slow: number;
}

export interface ComponentState {
  status: Level;
  /** When `status` last changed. */
  since: string;
  latencyMs: number | null;
  /** What the last failing check saw, as "HTTP 503" or "timed out". */
  detail?: string;
  /** Failed checks in a row; down from FAILS_TO_DOWN. */
  fails: number;
  /** Slow checks in a row; degraded from SLOWS_TO_DEGRADED. */
  slows: number;
}

/** status.json: small, rewritten every minute, polled by the page. */
export interface StatusFile {
  version: 1;
  updated: string;
  /** Where the checks run from, for the page's "checked from" line. */
  region: string;
  components: Record<string, ComponentState>;
  /** Today's tallies so far, merged into history.json now and then. */
  today: { day: string; counts: Record<string, DayCount> };
}

/** history.json: one tally per component per UTC day, the last DAYS days. */
export interface HistoryFile {
  version: 1;
  updated: string;
  days: Record<string, Record<string, DayCount>>;
}

export const DAYS = 90;
/** Failed checks in a row before a component shows as down (one check a minute). */
export const FAILS_TO_DOWN = 2;
/** Slow answers in a row before a component shows as degraded. */
export const SLOWS_TO_DEGRADED = 2;
/** The page treats status.json older than this as stale. */
export const STALE_MS = 5 * 60_000;

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Uptime for a tally, or null with no checks. Slow checks count as up. */
export function uptime(c: DayCount | undefined): number | null {
  if (!c || c.n === 0) return null;
  return (c.n - c.down) / c.n;
}

export function sumCounts(list: (DayCount | undefined)[]): DayCount {
  const total: DayCount = { n: 0, down: 0, slow: 0 };
  for (const c of list) {
    if (!c) continue;
    total.n += c.n;
    total.down += c.down;
    total.slow += c.slow;
  }
  return total;
}

const rank: Record<Level, number> = { operational: 0, unknown: 1, degraded: 2, down: 3 };

export function worst(levels: Level[]): Level {
  return levels.reduce<Level>((a, b) => (rank[b] > rank[a] ? b : a), "operational");
}
