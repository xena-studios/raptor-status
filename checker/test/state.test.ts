import assert from "node:assert/strict";
import { test } from "node:test";
import type { Result } from "../src/probe.ts";
import { apply, merge } from "../src/state.ts";

const ok: Result = { ok: true, slow: false, latencyMs: 100 };
const slow: Result = { ok: true, slow: true, latencyMs: 4000 };
const fail: Result = { ok: false, slow: false, latencyMs: null, detail: "HTTP 503" };
const at = (iso: string) => new Date(iso);

test("first run: operational, counted, no changes reported", () => {
  const n = apply(null, { api: ok }, at("2026-11-16T10:00:00Z"), "test");
  assert.equal(n.status.components.api.status, "operational");
  assert.deepEqual(n.status.today, { day: "2026-11-16", counts: { api: { n: 1, down: 0, slow: 0 } } });
  assert.deepEqual(n.changes, []);
  assert.equal(n.rolled, undefined);
});

test("one failure isn't an outage; the second is, and is reported", () => {
  let n = apply(null, { api: ok }, at("2026-11-16T10:00:00Z"), "t");
  n = apply(n.status, { api: fail }, at("2026-11-16T10:01:00Z"), "t");
  assert.equal(n.status.components.api.status, "operational");
  assert.equal(n.status.components.api.detail, "HTTP 503");
  assert.deepEqual(n.changes, []);
  n = apply(n.status, { api: fail }, at("2026-11-16T10:02:00Z"), "t");
  assert.equal(n.status.components.api.status, "down");
  assert.equal(n.status.components.api.since, "2026-11-16T10:02:00.000Z");
  assert.equal(n.changes[0].to, "down");
  assert.deepEqual(n.status.today.counts.api, { n: 3, down: 1, slow: 0 });
});

test("recovery is reported with how long it was down", () => {
  let n = apply(null, { api: fail }, at("2026-11-16T10:00:00Z"), "t");
  n = apply(n.status, { api: fail }, at("2026-11-16T10:01:00Z"), "t");
  n = apply(n.status, { api: ok }, at("2026-11-16T10:13:00Z"), "t");
  assert.equal(n.status.components.api.status, "operational");
  assert.equal(n.changes[0].from, "down");
  assert.equal(n.changes[0].lastedMs, 12 * 60_000);
});

test("degraded only after two slow answers in a row, and stays until a fast one", () => {
  let n = apply(null, { api: ok }, at("2026-11-16T10:00:00Z"), "t");
  n = apply(n.status, { api: slow }, at("2026-11-16T10:01:00Z"), "t");
  assert.equal(n.status.components.api.status, "operational");
  n = apply(n.status, { api: slow }, at("2026-11-16T10:02:00Z"), "t");
  assert.equal(n.status.components.api.status, "degraded");
  assert.equal(n.status.today.counts.api.slow, 1);
  n = apply(n.status, { api: ok }, at("2026-11-16T10:03:00Z"), "t");
  assert.equal(n.status.components.api.status, "operational");
});

test("a new UTC day hands back yesterday's tally and starts over", () => {
  let n = apply(null, { api: ok }, at("2026-11-16T23:59:00Z"), "t");
  n = apply(n.status, { api: ok }, at("2026-11-17T00:00:00Z"), "t");
  assert.deepEqual(n.rolled, { day: "2026-11-16", counts: { api: { n: 1, down: 0, slow: 0 } } });
  assert.deepEqual(n.status.today, { day: "2026-11-17", counts: { api: { n: 1, down: 0, slow: 0 } } });
});

test("merge writes tallies and drops days past 90", () => {
  const h = merge(
    {
      version: 1,
      updated: "",
      days: { api: { "2026-08-01": { n: 1, down: 0, slow: 0 }, "2026-11-10": { n: 5, down: 1, slow: 0 } } },
    },
    [{ day: "2026-11-16", counts: { api: { n: 2, down: 0, slow: 0 }, app: { n: 2, down: 2, slow: 0 } } }],
    at("2026-11-16T12:00:00Z"),
  );
  assert.deepEqual(Object.keys(h.days.api).sort(), ["2026-11-10", "2026-11-16"]);
  assert.deepEqual(h.days.app["2026-11-16"], { n: 2, down: 2, slow: 0 });
});
