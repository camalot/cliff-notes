import "./lib/env.js"; // Must be first — loads .env / .secrets files before any config reads.
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";
import { sweepOrphanedTempDirs } from "./lib/temp.js";

const config = loadConfig();
const app = await buildServer(config);

// Boot-time sweep: prior crashes can leave cliffnotes-* temp dirs around.
// We block startup briefly to clear them before serving traffic.
try {
  const removed = await sweepOrphanedTempDirs();
  if (removed > 0) app.log.info({ removed }, "swept orphaned temp dirs");
} catch (err) {
  app.log.warn({ err }, "temp dir sweep failed");
}

const close = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
  } finally {
    // Best-effort cleanup of any temp dirs created during this process's
    // lifetime that the per-request `finally` blocks couldn't reach (e.g.
    // hard kill mid-request). The sweep is mtime-gated so it won't touch
    // anything still in active use by another process.
    await sweepOrphanedTempDirs(0).catch(() => undefined);
  }
  process.exit(0);
};
process.on("SIGINT", () => void close("SIGINT"));
process.on("SIGTERM", () => void close("SIGTERM"));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
