// Incidents and maintenance: one Markdown file each in ../incidents
// (incidents/README.md says how to write one).
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import config from "../../components.json";

const ids = new Set(config.components.map((c) => c.id));
const base = process.env.PREVIEW ? `./preview/${process.env.PREVIEW}` : "../incidents";

const incidents = defineCollection({
  loader: glob({ base, pattern: ["*.md", "!README.md", "!_*.md"] }),
  schema: z.object({
    title: z.string(),
    impact: z.enum(["minor", "major", "maintenance"]),
    affects: z.array(z.string()).refine((list) => list.every((id) => ids.has(id)), {
      message: `affects must name components from components.json: ${[...ids].join(", ")}`,
    }),
    /** When it began, or when maintenance is planned to start. */
    started: z.coerce.date(),
    /** Maintenance only: when it's planned to end. */
    ends: z.coerce.date().optional(),
    /** Newest first. The first one's status is the incident's. */
    updates: z
      .array(
        z.object({
          at: z.coerce.date(),
          status: z.enum([
            "investigating",
            "identified",
            "monitoring",
            "resolved",
            "scheduled",
            "in-progress",
            "completed",
          ]),
          text: z.string(),
        }),
      )
      .min(1),
  }),
});

export const collections = { incidents };
