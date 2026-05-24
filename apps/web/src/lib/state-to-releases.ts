import type { Release } from "@cliff-notes/shared";
import type { UiCommit, UiTag } from "../types";

/**
 * Partition the flat commits/tags lists into the shape git-cliff expects.
 *
 * Tags are sorted by their `afterIndex` (oldest tagged release first). Each
 * tag closes the commits from the previous boundary up to and including its
 * own `afterIndex`. Commits after the last tag form a final unreleased group.
 * Dangling tags (afterIndex < 0) are emitted as empty release groups so the
 * template can still show them.
 *
 * Commits marked `ignored` are dropped from each release group AFTER tag
 * boundaries are resolved, so tag `afterIndex` values can keep referring to
 * the unfiltered UI commit list.
 */
export function stateToReleases(commits: UiCommit[], tags: UiTag[]): Release[] {
  const keep = (c: UiCommit) => !c.ignored;

  const dangling = tags
    .filter((t) => t.afterIndex < 0 || t.afterIndex >= commits.length)
    .map<Release>((t) => ({
      version: t.name,
      message: t.message,
      timestamp: t.timestamp,
      commits: [],
    }));

  const placed = [...tags]
    .filter((t) => t.afterIndex >= 0 && t.afterIndex < commits.length)
    .sort((a, b) => a.afterIndex - b.afterIndex);

  const releases: Release[] = [...dangling];
  let cursor = 0;
  for (const t of placed) {
    const slice = commits.slice(cursor, t.afterIndex + 1).filter(keep);
    releases.push({
      version: t.name,
      message: t.message,
      timestamp: t.timestamp,
      commits: slice,
    });
    cursor = t.afterIndex + 1;
  }

  // Trailing unreleased group: always emit it, even if empty, so the user
  // sees `## [unreleased]` immediately on the first render.
  const remaining = commits.slice(cursor).filter(keep);
  releases.push({ version: null, commits: remaining });

  return releases;
}
