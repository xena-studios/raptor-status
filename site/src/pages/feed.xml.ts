// An Atom feed of incidents and maintenance, for feed readers and Discord
// or Slack feed bots: subscribing without an email list to run.
import type { APIRoute } from "astro";
import { allIncidents, impactLabel, updateLabel } from "../lib/incidents";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() ?? "https://status.raptorpanel.net").replace(/\/$/, "");
  const list = (await allIncidents()).slice(0, 50);
  const updated = new Date(Math.max(0, ...list.map((i) => i.data.updates[0]?.at.getTime() ?? 0)));
  const entries = list
    .map((i) => {
      const u = i.data.updates[0];
      const url = `${base}/incidents/${i.id}/`;
      const body = i.data.updates
        .map((x) => `<p><b>${updateLabel[x.status]}</b> (${x.at.toISOString()}): ${esc(x.text)}</p>`)
        .join("");
      return `<entry><id>${url}</id><title>${esc(`[${impactLabel[i.data.impact]}] ${i.data.title}: ${updateLabel[u.status]}`)}</title><link href="${url}"/><published>${i.data.started.toISOString()}</published><updated>${u.at.toISOString()}</updated><content type="html">${esc(body)}</content></entry>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${base}/</id><title>Raptor status</title><link href="${base}/"/><link rel="self" href="${base}/feed.xml"/><updated>${(list.length ? updated : new Date()).toISOString()}</updated><author><name>Raptor</name></author>${entries}</feed>`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
};
