import type { Commit, Release } from "@cliff-notes/shared";

const DEFAULT_AUTHOR = Object.freeze({
  name: "cliff-notes",
  email: "noreply@cliff-notes.local",
});

/**
 * Deterministic 40-hex synthesized commit id from a string. Used when the
 * caller doesn't supply an id (e.g. manual-entry mode).
 */
export function synthesizeCommitId(seed: string): string {
  // FNV-1a 32-bit, repeated to fill 40 hex chars.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const chunk = (h >>> 0).toString(16).padStart(8, "0");
  return (chunk + chunk + chunk + chunk + chunk).slice(0, 40);
}

function normalizeCommit(c: Commit, releaseIndex: number, commitIndex: number, nowSeconds: number) {
  const id = c.id ?? synthesizeCommitId(`${releaseIndex}:${commitIndex}:${c.message}`);
  const author = c.author ?? {
    ...DEFAULT_AUTHOR,
    timestamp: nowSeconds - (1000 - commitIndex) * 60,
  };
  const committer = c.committer ?? author;
  return {
    id,
    message: c.message,
    raw_message: c.message,
    body: c.body ?? null,
    footers: [],
    author,
    committer,
    conventional: null,
    merge_commit: false,
    links: [],
  };
}

/**
 * Build the JSON payload for `git-cliff --from-context -`. Releases are sent
 * oldest-first; git-cliff will reverse internally based on its sort_commits
 * configuration.
 */
export function buildContext(releases: Release[]): unknown[] {
  const now = Math.floor(Date.now() / 1000);
  return releases.map((r, i) => {
    const commits = r.commits.map((c, j) => normalizeCommit(c, i, j, now));
    const timestamp =
      r.timestamp ?? commits.at(-1)?.committer.timestamp ?? now;
    const headCommitId = commits.at(-1)?.id ?? null;
    return {
      version: r.version ?? null,
      message: r.message ?? null,
      commits,
      commit_id: headCommitId,
      timestamp,
      previous: null,
    };
  });
}
