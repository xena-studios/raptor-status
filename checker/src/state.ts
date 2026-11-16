// The rules for turning a minute's checks into the next status.json, kept
// pure so they're tested without the network or Azure.
import {
  type ComponentState,
  DAYS,
  type DayCount,
  FAILS_TO_DOWN,
  type HistoryFile,
  type Level,
  SLOWS_TO_DEGRADED,
  type StatusFile,
  utcDay,
} from "@raptor-status/shared/status";
import type { Result } from "./probe.ts";

export interface Change {
  id: string;
  from: Level;
  to: Level;
  /** How long it had been `from`, for "back after 12 min". */
  lastedMs: number;
  detail?: string;
}

export interface Next {
  status: StatusFile;
  /** Yesterday's final tally, when this run started a new day. */
  rolled?: { day: string; counts: Record<string, DayCount> };
  changes: Change[];
}

export function apply(prev: StatusFile | null, results: Record<string, Result>, now: Date, region: string): Next {
  const day = utcDay(now);
  const iso = now.toISOString();
  const sameDay = prev?.today.day === day;
  const counts: Record<string, DayCount> = {};
  const components: Record<string, ComponentState> = {};
  const changes: Change[] = [];

  for (const [id, r] of Object.entries(results)) {
    const before = prev?.components[id];
    const fails = r.ok ? 0 : (before?.fails ?? 0) + 1;
    const slows = r.ok && r.slow ? (before?.slows ?? 0) + 1 : 0;
    const was: Level = before?.status ?? "unknown";

    let status: Level;
    if (!r.ok) {
      // One failure isn't an outage: keep what it was until the second.
      status = fails >= FAILS_TO_DOWN ? "down" : was === "unknown" ? "operational" : was;
    } else if (slows >= SLOWS_TO_DEGRADED) {
      status = "degraded";
    } else if (r.slow && was === "degraded") {
      status = "degraded";
    } else {
      status = "operational";
    }

    const since = status === was && before ? before.since : iso;
    if (status !== was && was !== "unknown") {
      changes.push({
        id,
        from: was,
        to: status,
        lastedMs: before ? now.getTime() - Date.parse(before.since) : 0,
        detail: r.detail,
      });
    }
    components[id] = { status, since, latencyMs: r.latencyMs, fails, slows, ...(r.detail ? { detail: r.detail } : {}) };

    const c = { ...((sameDay && prev?.today.counts[id]) || { n: 0, down: 0, slow: 0 }) };
    c.n += 1;
    if (status === "down") c.down += 1;
    else if (status === "degraded") c.slow += 1;
    counts[id] = c;
  }

  return {
    status: { version: 1, updated: iso, region, components, today: { day, counts } },
    rolled: prev && !sameDay ? { day: prev.today.day, counts: prev.today.counts } : undefined,
    changes,
  };
}

/** Writes tallies into history and drops days older than DAYS. */
export function merge(
  history: HistoryFile | null,
  tallies: { day: string; counts: Record<string, DayCount> }[],
  now: Date,
): HistoryFile {
  const days: HistoryFile["days"] = structuredClone(history?.days ?? {});
  for (const t of tallies) {
    for (const [id, c] of Object.entries(t.counts)) {
      days[id] = { ...days[id], [t.day]: c };
    }
  }
  const oldest = utcDay(new Date(now.getTime() - DAYS * 86_400_000));
  for (const byDay of Object.values(days)) {
    for (const d of Object.keys(byDay)) if (d < oldest) delete byDay[d];
  }
  return { version: 1, updated: now.toISOString(), days };
}
