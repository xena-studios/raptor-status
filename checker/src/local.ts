// Runs the checks from this machine and writes the files to a folder, for
// trying the page locally:
//   pnpm --filter raptor-status-checker once ../site/public/data          one run
//   pnpm --filter raptor-status-checker once ../site/public/data --loop   every minute
import { runOnce } from "./run.ts";
import { FileStore } from "./store.ts";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) ?? "out";
const store = new FileStore(dir);
const log = { info: console.log, warn: console.warn };

await runOnce(store, log);
if (args.includes("--loop")) setInterval(() => void runOnce(store, log), 60_000);
