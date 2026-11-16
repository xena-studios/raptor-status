# How it works

```
 every minute                  public, cached 15 s              static, rebuilt on push
 Azure Function  ── writes ──▶  Blob Storage: status.json  ◀── reads ──  Static Web App
 (checker/)                     history.json                             (site/ + incidents/)
     │
     └── checks api., app., get., docs., raptorpanel.net, and raptornodes.net's nameservers
```

- **The checker** ([`checker/`](../checker/)) checks every component in [`components.json`](../components.json) at once, every minute, and writes `status.json` (the current state and today's tally) to Blob Storage. It folds the tallies into `history.json` every hour and when a UTC day ends.
- **The page** ([`site/`](../site/)) is static. The browser reads `status.json` every 30 seconds and `history.json` once. Incidents are part of the build: a push to `main` rebuilds it, and so does a daily run so "the last 30 days" moves on.
- **The rules** both sides share are in [`shared/status.ts`](../shared/status.ts).

## How it decides

- A component is **down** after 2 failed checks in a row, and **degraded** after 2 slow answers in a row (`slowMs` in `components.json`). One bad check changes nothing.
- An open incident raises what its components show: `major` shows them down, `minor` degraded, and maintenance shows "Maintenance" during its window.
- Each day's bar is up if the component was never down, partly down for under 30 minutes down, and down from 30 minutes. Incidents colour their days too. Uptime counts minutes down; slow minutes count as up, and it's rounded down, so a day with any downtime never reads 100%.
- If `status.json` is more than 5 minutes old, the page says the checks are delayed instead of guessing.
- `raptornodes.net` is checked by asking each of its own nameservers (Route 53) for the zone's SOA record directly: some not answering is degraded, none is down.

## Who hears about it

- **`#alerts`** on Discord (staff only): the checker posts when a component goes down and when it comes back.
- **healthchecks.io** emails and posts to `#alerts` if the checker itself stops pinging.
- **The public** gets the page and its Atom feed (`/feed.xml`).

## Costs

Pay-as-you-go list prices, November 2026: the Static Web App is free (100 GB a month, and it stops serving past that rather than billing). The Function stays inside Flex Consumption's monthly free grant (about 43,000 runs against 250,000). Blob Storage is about $0.30 a month, almost all of it write operations. Expect **$0.30 to $0.60 a month**, under the $5 budget alert.
