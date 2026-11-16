// Bundles the Function and the local runner with esbuild, @raptor-status/shared
// included. The Azure SDKs stay external: the deploy package carries them in
// node_modules (scripts/package.ts).
import { build } from "esbuild";

await build({
  entryPoints: { index: "src/index.ts", local: "src/local.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // The Azure SDKs come from node_modules at run time; everything else,
  // @raptor-status/shared's TypeScript included, is bundled.
  external: ["@azure/*"],
  sourcemap: true,
  logLevel: "info",
});
