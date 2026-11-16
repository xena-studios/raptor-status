---
title: Slow sign-ins and server lists
impact: minor
affects: [api, app]
started: 2026-11-12T14:02:00Z
updates:
  - at: 2026-11-12T14:40:00Z
    status: resolved
    text: Pages load at their usual speed again. A database maintenance task ran during the day instead of at night; it's been moved back.
  - at: 2026-11-12T14:21:00Z
    status: identified
    text: A database task is slowing the Panel down. We've stopped it and pages are getting faster.
  - at: 2026-11-12T14:05:00Z
    status: investigating
    text: Signing in and loading server lists is taking several seconds. Game servers aren't affected.
---

## What happened

The nightly database backup ran at 14:00 UTC instead of 04:15, after a configuration change, and competed with the Panel for the server's CPU for about forty minutes.

## What we changed

- The backup's schedule is checked by a test.
- The backup runs at a lower priority, so it can't slow the Panel down even when it runs during the day.
