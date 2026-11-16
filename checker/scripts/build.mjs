// Bundles the Function and the local runner with esbuild. The Azure SDKs
// stay external: the deploy package carries them in node_modules.
import { build } from "esbuild";

await build({
  entryPoints: { index: "src/index.ts", local: "src/local.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
