import { getCollection, type CollectionEntry } from "astro:content";

export type Incident = CollectionEntry<"incidents">;
export type UpdateStatus = Incident["data"]["updates"][number]["status"];

export const updateLabel: Record<UpdateStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  "in-progress": "In progress",
  completed: "Completed",
};

export const impactLabel = { minor: "Minor", major: "Major", maintenance: "Maintenance" } as const;

/** Newest first, with each incident's updates newest first. */
export async function allIncidents(): Promise<Incident[]> {
  const list = await getCollection("incidents");
  for (const i of list) i.data.updates.sort((a, b) => b.at.getTime() - a.at.getTime());
  return list.sort((a, b) => b.data.started.getTime() - a.data.started.getTime());
}

export function latest(i: Incident) {
  return i.data.updates[0];
}

export function isClosed(i: Incident): boolean {
  const s = latest(i).status;
  return s === "resolved" || s === "completed";
}

/** When it was closed, from its closing update. */
export function closedAt(i: Incident): Date | undefined {
  return isClosed(i) ? latest(i).at : undefined;
}

/** What the browser needs to colour components and days. */
export function summary(i: Incident) {
  return {
    slug: i.id,
    title: i.data.title,
    impact: i.data.impact,
    affects: i.data.affects,
    started: i.data.started.toISOString(),
    ends: i.data.ends?.toISOString(),
    closed: closedAt(i)?.toISOString(),
  };
}
export type IncidentSummary = ReturnType<typeof summary>;

/** "Nov 12, 14:02 UTC": what the page shows before the browser localises it. */
export function utc(d: Date, withDate = true): string {
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return withDate ? `${date}, ${time} UTC` : `${time} UTC`;
}
