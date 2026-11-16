// One check of one component. Every check has a deadline, and none throws:
// a failure is a result with a reason the page can show.
import { Resolver, promises as dns } from "node:dns";
import type { Probe } from "./config.ts";

export interface Result {
  ok: boolean;
  slow: boolean;
  latencyMs: number | null;
  /** Why it failed, or what was slow: "HTTP 503", "timed out". */
  detail?: string;
}

const TIMEOUT_MS = 10_000;
const USER_AGENT = "raptor-status/1 (+https://status.raptorpanel.net)";

export async function probe(p: Probe): Promise<Result> {
  try {
    return p.kind === "http" ? await http(p) : await soa(p);
  } catch (err) {
    return { ok: false, slow: false, latencyMs: null, detail: describe(err) };
  }
}

async function http(p: Extract<Probe, { kind: "http" }>): Promise<Result> {
  const start = performance.now();
  const res = await fetch(p.url, {
    headers: { "User-Agent": USER_AGENT, "Cache-Control": "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Read the body under the same deadline, so a stalled stream counts.
  const body = await res.text();
  const latencyMs = Math.round(performance.now() - start);
  if (res.status !== p.expect) return { ok: false, slow: false, latencyMs, detail: `HTTP ${res.status}` };
  if (p.contains && !body.includes(p.contains)) {
    return { ok: false, slow: false, latencyMs, detail: "unexpected response" };
  }
  return { ok: true, slow: latencyMs > p.slowMs, latencyMs };
}

// The zone's own nameservers, looked up through the normal resolver and kept
// for an hour: what's checked is that they answer for the zone, not whether
// some recursive resolver has it cached.
let nameservers: { ips: string[]; at: number } | null = null;

async function zoneNameservers(zone: string): Promise<string[]> {
  if (nameservers && Date.now() - nameservers.at < 3_600_000) return nameservers.ips;
  const names = await dns.resolveNs(zone);
  const ips = (await Promise.all(names.map((n) => dns.resolve4(n).catch(() => [] as string[])))).flat();
  if (ips.length === 0) throw new Error(`no addresses for ${zone}'s nameservers`);
  nameservers = { ips, at: Date.now() };
  return ips;
}

async function soa(p: Extract<Probe, { kind: "dns-soa" }>): Promise<Result> {
  const ips = await zoneNameservers(p.zone);
  const answers = await Promise.all(
    ips.map(async (ip) => {
      const r = new Resolver({ timeout: 3000, tries: 1 });
      r.setServers([ip]);
      const start = performance.now();
      try {
        await new Promise<void>((resolve, reject) => r.resolveSoa(p.zone, (err) => (err ? reject(err) : resolve())));
        return Math.round(performance.now() - start);
      } catch {
        return null;
      }
    }),
  );
  const times = answers.filter((t): t is number => t !== null);
  if (times.length === 0) return { ok: false, slow: false, latencyMs: null, detail: "no nameserver answered" };
  const latencyMs = Math.min(...times);
  // Resolvers retry another nameserver, so some down is slow, not down.
  if (times.length < ips.length) {
    return { ok: true, slow: true, latencyMs, detail: `${times.length} of ${ips.length} nameservers answered` };
  }
  return { ok: true, slow: latencyMs > p.slowMs, latencyMs };
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timed out";
    const cause = (err as { cause?: { code?: string } }).cause;
    if (cause?.code) return cause.code === "ENOTFOUND" ? "DNS lookup failed" : `connection failed (${cause.code})`;
    return err.message.slice(0, 80);
  }
  return "failed";
}
