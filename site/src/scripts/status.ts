// The page's live half: reads status.json (every 30 s) and history.json
// (once) from Blob Storage, and colours the hero, the components, and the
// 90-day bars. Incidents are part of the static page; they're passed in as
// JSON to colour the components and days they affect.
import {
  type DayCount,
  type HistoryFile,
  type Level,
  STALE_MS,
  type StatusFile,
  sumCounts,
  uptime,
  utcDay,
  worst,
} from "@raptor-status/shared/status";
import "./times";

interface Summary {
  slug: string;
  title: string;
  impact: "minor" | "major" | "maintenance";
  affects: string[];
  started: string;
  ends?: string;
  closed?: string;
}
interface Data {
  base: string;
  days: number;
  components: { id: string; name: string }[];
  incidents: Summary[];
}
type Shown = Level | "maintenance";
type DayLevel = "none" | "ok" | "minor" | "major" | "maint";

/** An element the page always has; missing means the build is broken, so say so. */
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`status page: #${id} is missing`);
  return el as T;
}

function inside<T extends Element = HTMLElement>(root: Element, selector: string): T {
  const el = root.querySelector<T & Element>(selector);
  if (!el) throw new Error(`status page: ${selector} is missing`);
  return el;
}

const data: Data = JSON.parse(byId("status-data").textContent ?? "{}");
const REFRESH_MS = 30_000;
const DAY_MS = 86_400_000;

let status: StatusFile | null = null;
let history: HistoryFile | null = null;
let loadFailed = false;

async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(`${data.base}/${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function refresh() {
  try {
    status = await getJSON<StatusFile>("status.json");
    loadFailed = false;
  } catch {
    loadFailed = true;
  }
  render();
}

async function loadHistory() {
  try {
    history = await getJSON<HistoryFile>("history.json");
  } catch {
    // The bars fall back to today's tally from status.json.
  }
  render();
}

const isStale = (now: number) => !status || now - Date.parse(status.updated) > STALE_MS;

function inWindow(i: Summary, now: number) {
  return now >= Date.parse(i.started) && (!i.ends || now <= Date.parse(i.ends));
}

/** What open incidents say about a component right now. */
function incidentLevel(id: string, now: number): Shown | null {
  let level: Shown | null = null;
  for (const i of data.incidents) {
    if (i.closed || !i.affects.includes(id)) continue;
    if (i.impact === "maintenance") {
      if (inWindow(i, now)) level = "maintenance";
      continue;
    }
    const l: Level = i.impact === "major" ? "down" : "degraded";
    level = level === null || level === "maintenance" ? l : worst([level, l]);
  }
  return level;
}

function componentLevel(id: string, now: number): Shown {
  const probe: Level = isStale(now) ? "unknown" : (status?.components[id]?.status ?? "unknown");
  const inc = incidentLevel(id, now);
  if (inc === "maintenance") return "maintenance";
  if (inc) return worst([probe === "unknown" ? "operational" : probe, inc]);
  return probe;
}

const stateText: Record<Shown, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "No data",
  maintenance: "Maintenance",
};

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function lasted(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

function renderHero(levels: Shown[], now: number) {
  const hero = byId("hero");
  const title = byId("overall");
  const checked = byId("checked");
  const real = levels.filter((l) => l !== "maintenance" && l !== "unknown") as Level[];
  const downCount = levels.filter((l) => l === "down").length;
  let level: Shown;
  let text: string;
  if (!status && loadFailed) {
    level = "unknown";
    text = "Live status isn't loading";
  } else if (!status) {
    level = "unknown";
    text = "Checking Raptor…";
  } else if (isStale(now)) {
    level = "unknown";
    text = "Status checks are delayed";
  } else if (downCount > 0) {
    level = "down";
    text = downCount === levels.length || componentLevel("api", now) === "down" ? "Major outage" : "Partial outage";
  } else if (worst(real) === "degraded") {
    level = "degraded";
    text = "Some systems are degraded";
  } else if (levels.includes("maintenance")) {
    level = "maintenance";
    text = "Maintenance in progress";
  } else {
    level = "operational";
    text = "All systems operational";
  }
  hero.dataset.level = level;
  if (title.textContent !== text) title.textContent = text;

  if (!status) {
    checked.textContent = loadFailed
      ? "The checker's results couldn't be loaded. Incidents below are still current."
      : "Loading the latest checks…";
  } else {
    const when = ago(now - Date.parse(status.updated));
    checked.textContent = isStale(now)
      ? `The last check was ${when}. Incidents below are still current.`
      : `Checked ${when} from Microsoft Azure (${status.region}), once a minute.`;
  }

  const panelDown = componentLevel("api", now) === "down" || componentLevel("app", now) === "down";
  byId("unaffected").hidden = !panelDown;
}

function dayLevel(id: string, day: string, c: DayCount | undefined): DayLevel {
  const start = Date.parse(`${day}T00:00:00Z`);
  const end = start + DAY_MS;
  let level: DayLevel = "none";
  if (c && c.n > 0) {
    // One check a minute: under half an hour down is a partial day.
    level = c.down === 0 ? "ok" : c.down < 30 ? "minor" : "major";
  }
  for (const i of data.incidents) {
    if (!i.affects.includes(id)) continue;
    const from = Date.parse(i.started);
    const to = i.closed ? Date.parse(i.closed) : i.ends ? Date.parse(i.ends) : Date.now();
    if (from >= end || to < start) continue;
    if (i.impact === "major") level = "major";
    else if (i.impact === "minor" && level !== "major") level = "minor";
    else if (i.impact === "maintenance" && (level === "ok" || level === "none")) level = "maint";
  }
  return level;
}

interface BarInfo {
  day: string;
  counts?: DayCount;
  incidents: Summary[];
}
const barInfo = new WeakMap<Element, BarInfo>();

function countsFor(id: string, day: string): DayCount | undefined {
  if (status && status.today.day === day) return status.today.counts[id];
  return history?.days[id]?.[day];
}

function renderComponent(li: HTMLElement, now: number) {
  const id = li.dataset.id ?? "";
  const level = componentLevel(id, now);
  li.dataset.level = level;
  const state = status?.components[id];
  inside(li, ".state-text").textContent =
    level === "down" && state?.status === "down"
      ? `Down for ${lasted(now - Date.parse(state.since))}`
      : stateText[level];
  const latency = inside(li, ".latency");
  if (!isStale(now) && state) {
    latency.textContent =
      state.status === "down" ? (state.detail ?? "") : state.latencyMs != null ? `${state.latencyMs} ms` : "";
  } else latency.textContent = "";

  const bars = li.querySelectorAll<HTMLElement>(".bars > span");
  const today = Date.parse(`${utcDay(new Date(now))}T00:00:00Z`);
  const all: (DayCount | undefined)[] = [];
  bars.forEach((bar, n) => {
    const day = utcDay(new Date(today - (bars.length - 1 - n) * DAY_MS));
    const counts = countsFor(id, day);
    all.push(counts);
    bar.dataset.day = dayLevel(id, day, counts);
    const start = Date.parse(`${day}T00:00:00Z`);
    barInfo.set(bar, {
      day,
      counts,
      incidents: data.incidents.filter((i) => {
        const to = i.closed ? Date.parse(i.closed) : i.ends ? Date.parse(i.ends) : now;
        return i.affects.includes(id) && Date.parse(i.started) < start + DAY_MS && to >= start;
      }),
    });
  });

  const total = uptime(sumCounts(all));
  const name = data.components.find((c) => c.id === id)?.name ?? id;
  inside(li, ".uptime").textContent = total === null ? "No data yet" : `${percent(total)} uptime`;
  inside(li, ".bars").setAttribute(
    "aria-label",
    total === null
      ? `${name}: no uptime data yet`
      : `${name}: ${percent(total)} uptime over the last ${data.days} days`,
  );
}

/** Rounded down, so a day with any downtime never reads 100%. */
function percent(u: number): string {
  if (u >= 1) return "100%";
  return `${(Math.floor(u * 10_000) / 100).toFixed(2)}%`;
}

function render() {
  const now = Date.now();
  const items = [...document.querySelectorAll<HTMLElement>(".component")];
  for (const li of items) renderComponent(li, now);
  renderHero(
    items.map((li) => li.dataset.level as Shown),
    now,
  );
  renderMaintenance(now);
}

function renderMaintenance(now: number) {
  document.querySelectorAll<HTMLElement>('.card[data-impact="maintenance"]').forEach((card) => {
    const i = data.incidents.find((x) => x.slug === card.dataset.slug);
    const label = card.querySelector("[data-maint-status]");
    if (!i || !label || i.closed) return;
    label.textContent = now < Date.parse(i.started) ? "Scheduled" : "In progress";
  });
}

// The day tooltip.
const tip = byId("tip");
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function showTip(bar: HTMLElement) {
  const info = barInfo.get(bar);
  if (!info) return;
  const u = uptime(info.counts);
  const lines = [`<strong>${dayFormat.format(new Date(`${info.day}T00:00:00Z`))}</strong>`];
  if (u === null || !info.counts) lines.push("<span>No checks this day</span>");
  else {
    const { down, slow } = info.counts;
    const extra = [down && `${lasted(down * 60_000)} down`, slow && `${lasted(slow * 60_000)} slow`].filter(Boolean);
    lines.push(`<span>${percent(u)} up${extra.length ? `, ${extra.join(", ")}` : ""}</span>`);
  }
  for (const i of info.incidents)
    lines.push(`<span class="tip-incident" data-impact="${i.impact}">${escapeHTML(i.title)}</span>`);
  tip.innerHTML = lines.join("");
  tip.hidden = false;
  const r = bar.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${r.top + window.scrollY - t.height - 8}px`;
}

function escapeHTML(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

document.addEventListener("pointerover", (e) => {
  const bar = (e.target as Element).closest<HTMLElement>(".bars > span");
  if (bar) showTip(bar);
});
document.addEventListener("pointerout", (e) => {
  if ((e.target as Element).closest(".bars > span")) tip.hidden = true;
});
window.addEventListener(
  "scroll",
  () => {
    tip.hidden = true;
  },
  { passive: true },
);

// Go.
render();
void refresh();
void loadHistory();
setInterval(() => {
  if (!document.hidden) void refresh();
}, REFRESH_MS);
// The "checked 12 s ago" line ticks without redrawing the bars.
setInterval(() => {
  if (document.hidden) return;
  const levels = [...document.querySelectorAll<HTMLElement>(".component")].map((li) => li.dataset.level as Shown);
  renderHero(levels, Date.now());
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
