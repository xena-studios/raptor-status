// Optional: posts to a Discord channel when a component goes down or comes
// back. Degraded and back again isn't posted: it's too noisy for a channel.
import type { Component } from "./config.ts";
import type { Change } from "./state.ts";

export async function notifyDiscord(webhook: string, changes: Change[], components: Component[], pageUrl: string) {
  const lines: string[] = [];
  for (const c of changes) {
    const name = components.find((x) => x.id === c.id)?.name ?? c.id;
    if (c.to === "down") lines.push(`🔴 **${name}** is down${c.detail ? `: ${c.detail}` : ""}`);
    else if (c.from === "down") lines.push(`🟢 **${name}** is back, after ${minutes(c.lastedMs)}`);
  }
  if (lines.length === 0) return;
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `${lines.join("\n")}\n<${pageUrl}>`, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord webhook: HTTP ${res.status}`);
}

function minutes(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
