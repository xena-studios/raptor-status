// Makes out/checker.zip for Azure: dist/, host.json, package.json, and the
// production dependencies, installed fresh so dev tools stay out.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("out", { recursive: true, force: true });
mkdirSync("out/app", { recursive: true });
for (const f of ["dist", "host.json", "package.json", "package-lock.json"]) cpSync(f, `out/app/${f}`, { recursive: true });
execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: "out/app", stdio: "inherit" });
execFileSync("zip", ["-qr", "../checker.zip", "."], { cwd: "out/app", stdio: "inherit" });
console.log("out/checker.zip");
