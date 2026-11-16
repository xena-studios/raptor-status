// Writes dist/staticwebapp.config.json, Azure Static Web Apps' headers and
// routes, after the build: the CSP has to name where status.json lives
// (PUBLIC_STATUS_BASE) and the hash of any inline script Astro left in.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const base = process.env.PUBLIC_STATUS_BASE ?? "/data";
const dataOrigin = base.startsWith("http") ? new URL(base).origin : "'self'";

// Inline scripts (not JSON data blocks) on any page.
const hashes = new Set<string>();
const walk = (dir: string): void => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) {
      const html = readFileSync(p, "utf8");
      for (const m of html.matchAll(
        /<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g,
      )) {
        if (m[1]?.trim()) hashes.add(`'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
      }
    }
  }
};
walk(dist);

const csp = [
  "default-src 'none'",
  `script-src 'self' ${[...hashes].join(" ")}`.trim(),
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  `connect-src ${dataOrigin}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const config = {
  globalHeaders: {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": "max-age=63072000",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "public, max-age=60, must-revalidate",
  },
  routes: [
    // Hashed build files never change.
    { route: "/assets/*", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  ],
  responseOverrides: { 404: { rewrite: "/404.html" } },
  mimeTypes: { ".xml": "application/atom+xml; charset=utf-8" },
};

writeFileSync(join(dist, "staticwebapp.config.json"), `${JSON.stringify(config, null, 2)}\n`);
console.log(`staticwebapp.config.json: connect-src ${dataOrigin}, ${hashes.size} inline script hash(es)`);
