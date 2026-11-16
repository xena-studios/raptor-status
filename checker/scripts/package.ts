// Makes out/checker.zip for Azure: dist/, host.json, package.json, and the
// production dependencies (pnpm deploy, so dev tools stay out), laid out flat
// because Azure's zip deploy doesn't keep symlinks. Run `pnpm build` first.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync("out", { recursive: true, force: true });
execFileSync(
  "pnpm",
  ["--filter", "raptor-status-checker", "deploy", "--prod", "--config.node-linker=hoisted", "checker/out/app"],
  { cwd: "..", stdio: "inherit" },
);
// .bin holds only symlinks to CLIs the Function never runs.
rmSync("out/app/node_modules/.bin", { recursive: true, force: true });
execFileSync("zip", ["-qr", "../checker.zip", "."], { cwd: "out/app", stdio: "inherit" });
console.log("out/checker.zip");
