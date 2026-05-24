import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEMP_PREFIX = "cliffnotes";

export async function withTempDir<T>(
  purpose: string,
  projectId: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const prefix = `${TEMP_PREFIX}-${purpose}-${projectId}-`;
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      /* swallow cleanup errors */
    });
  }
}

/**
 * Sweep stale `cliffnotes-*` dirs left over from prior crashes. Runs once at
 * boot; live dirs from concurrent processes are still mtime-fresh and skipped.
 */
export async function sweepOrphanedTempDirs(maxAgeMs = 60 * 60 * 1000): Promise<number> {
  const root = tmpdir();
  let removed = 0;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith(`${TEMP_PREFIX}-`))
      .map(async (e) => {
        const path = join(root, e.name);
        try {
          const { stat } = await import("node:fs/promises");
          const s = await stat(path);
          if (s.mtimeMs < cutoff) {
            await rm(path, { recursive: true, force: true });
            removed++;
          }
        } catch {
          /* ignore */
        }
      }),
  );
  return removed;
}
