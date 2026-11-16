// status.raptorpanel.net: a static page on Azure Static Web Apps, apart from
// everything else Raptor runs (README.md). Live status comes from the
// checker's status.json in Azure Blob Storage, read by the browser.
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://status.raptorpanel.net",
  // Hashed build files go in /assets, cached for good (scripts/swa-config.mjs).
  build: { inlineStylesheets: "never", assets: "assets" },
  // Fonts are files, not data: URLs, since the CSP's font-src is 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
