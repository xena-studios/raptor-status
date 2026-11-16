# Raptor status

**[status.raptorpanel.net](https://status.raptorpanel.net)**: whether Raptor's Panel, web app, and services are up, and what's been wrong lately.

It's checked every minute from Microsoft Azure, apart from everything Raptor itself runs on (Oracle Cloud, AWS, Cloudflare), so it stays up when they don't. Game servers run on their owners' machines and keep running whatever this page says.

## Posting an incident

Add a Markdown file to [`incidents/`](incidents/) on `main`, from github.com if need be. The page updates in about a minute. [incidents/README.md](incidents/README.md) has the templates.

## What's here

| | |
| --- | --- |
| [`site/`](site/) | The page: static Astro, in [Raptor's design system](https://github.com/xena-studios/raptor/blob/main/docs/DESIGN.md) |
| [`checker/`](checker/) | The Azure Function that checks everything once a minute |
| [`incidents/`](incidents/) | Incidents and planned maintenance, one Markdown file each |
| [`components.json`](components.json) | What the page shows and how each part is checked |
| [`shared/`](shared/) | The file formats and rules the page and the checker share |

- [How it works](docs/HOW-IT-WORKS.md): what's checked, how it decides, who hears about it, and what it costs
- [Setting it up](docs/SETUP.md): what runs in Azure, and how to build it again

## Developing

A pnpm workspace (`site`, `checker`, `shared`), in TypeScript throughout, linted and formatted with Biome, as Raptor is. Node 24 for the page, Node 22 for the checker (what Azure runs).

```sh
pnpm install
pnpm --filter raptor-status-checker once ../site/public/data   # real checks from this machine
pnpm --filter raptor-status-site dev                            # http://localhost:4321
pnpm lint && pnpm typecheck && pnpm test                         # what CI runs
```

`PREVIEW=outage pnpm build` in `site/` builds the page with the made-up incidents in `site/preview/`. The page's colours and fonts are copies of Raptor's (`site/src/styles/site.css` there): keep them in step.

## Licence

[AGPL-3.0](LICENSE), as Raptor.
