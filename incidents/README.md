# Incidents

One Markdown file per incident or planned maintenance. A push to `main` rebuilds the page, live in about a minute. Edit on github.com, from a phone if need be: open the file, the pencil, **Commit changes**.

Name files `YYYY-MM-DD-what-happened.md`. The name is the incident's address (`/incidents/2026-11-20-panel-unreachable/`), so don't rename one once it's published.

## An incident

```yaml
---
title: Panel unreachable
impact: major            # major: down; minor: slow or partly down
affects: [api, app]      # ids from components.json
started: 2026-11-20T14:02:00Z
updates:                 # newest first; the first one's status is the incident's
  - at: 2026-11-20T14:05:00Z
    status: investigating
    text: The web app and API aren't answering. Game servers aren't affected. We're looking into it.
---
```

To update it, add an entry at the top of `updates`: `identified`, then `monitoring`, then `resolved`. Times are UTC (the `Z`); the page shows each reader their own time.

Below the second `---`, Markdown is shown under the timeline as the write-up: what happened, and what changed so it doesn't happen again. Add it once things are calm.

## Maintenance

```yaml
---
title: Database upgrade
impact: maintenance
affects: [api, app]
started: 2026-11-19T05:00:00Z   # when it's planned to start
ends: 2026-11-19T05:15:00Z      # and end
updates:
  - at: 2026-11-15T18:00:00Z
    status: scheduled
    text: The web app will be unavailable for up to 15 minutes. Game servers, schedules, and backups keep running on your nodes.
---
```

The page shows it as scheduled until `started`, then in progress. Add a `completed` update when it's done.

## Writing them

- Say what people can't do, not what broke inside: "Signing in fails" over "Postgres connection pool exhausted".
- Say that game servers keep running whenever the Panel is down. It's the first thing people worry about.
- Post within 10 minutes, even if all you know is that you're looking. Update at least every 30 minutes while it's ongoing.
- Files starting with `_` are ignored, for drafts.
