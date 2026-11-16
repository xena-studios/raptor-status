// The Azure Function: once a minute, at second 0. Timer triggers run on one
// instance at a time, so two runs never write over each other.
import { app, type InvocationContext } from "@azure/functions";
import { runOnce } from "../run.ts";
import { BlobStore } from "../store.ts";

let store: BlobStore | undefined;

app.timer("check", {
  schedule: "0 * * * * *",
  handler: async (_timer, ctx: InvocationContext) => {
    store ??= await BlobStore.fromEnv();
    await runOnce(store, { info: (m) => ctx.log(m), warn: (m) => ctx.warn(m) });
  },
});
