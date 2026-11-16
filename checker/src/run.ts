// One run: check everything at once, write status.json, and fold the day's
// tallies into history.json at the top of each hour and when a day ends.
import type { HistoryFile, StatusFile } from "../../shared/status.ts";
import { components, settings } from "./config.ts";
import { notifyDiscord } from "./notify.ts";
import { probe, type Result } from "./probe.ts";
import { apply, merge } from "./state.ts";
import type { Store } from "./store.ts";

export interface Log {
  info(msg: string): void;
  warn(msg: string): void;
}

export async function runOnce(store: Store, log: Log, now = new Date()) {
  const s = settings();
  const prev = parse<StatusFile>(await store.read("status.json"));
  const entries = await Promise.all(components.map(async (c) => [c.id, await probe(c.probe)] as const));
  const results: Record<string, Result> = Object.fromEntries(entries);

  const next = apply(prev, results, now, s.region);
  await store.write("status.json", JSON.stringify(next.status), 15);

  // Once an hour is enough: the page adds today's live tally itself.
  if (next.rolled || !prev || now.getUTCMinutes() === 0) {
    const history = parse<HistoryFile>(await store.read("history.json"));
    const tallies = [...(next.rolled ? [next.rolled] : []), next.status.today];
    await store.write("history.json", JSON.stringify(merge(history, tallies, now)), 300);
  }

  const summary = entries.map(([id, r]) => `${id}=${r.ok ? (r.slow ? "slow" : "ok") : `FAIL(${r.detail})`}${r.latencyMs ?? "-"}ms`);
  log.info(summary.join(" "));
  for (const c of next.changes) log.warn(`${c.id}: ${c.from} -> ${c.to}${c.detail ? ` (${c.detail})` : ""}`);

  if (s.discordWebhook && next.changes.length) {
    await notifyDiscord(s.discordWebhook, next.changes, components, s.pageUrl).catch((err) => log.warn(String(err)));
  }
  if (s.heartbeat) {
    await fetch(s.heartbeat, { signal: AbortSignal.timeout(10_000) }).catch((err) => log.warn(`heartbeat: ${err}`));
  }
  return next;
}

function parse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as { version?: number };
    return v.version === 1 ? (v as T) : null;
  } catch {
    return null;
  }
}
