import { faker } from "@faker-js/faker";
import type { RemoteKind } from "./cliff-toml-remote.js";

const DEFAULT_BOT_USERNAME = "cliff-notes-bot";
const DEFAULT_AUTHOR_EMAIL = "noreply@cliff-notes.local";

interface FixtureContributor {
  username: string;
  pr_title?: string;
  pr_number?: number;
  pr_labels?: string[];
  is_first_time?: boolean;
}

export interface RemoteMocks {
  defaults: Record<RemoteKind, { owner: string; repo: string }>;
  /** Synthetic co-contributor used to ensure every release has length ≥ 2 in the contributor list. */
  synthetic: FixtureContributor;
  labelsByKind: Record<RemoteKind, string[]>;
}

const REMOTE_KINDS: readonly RemoteKind[] = [
  "github",
  "gitlab",
  "gitea",
  "bitbucket",
  "azure_devops",
];

function fakedLabels(): string[] {
  return Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => faker.word.noun());
}

function fakedOwnerRepo(): { owner: string; repo: string } {
  return {
    owner: faker.internet.username(),
    repo: faker.helpers.slugify(faker.word.words(2)),
  };
}

let cachedMocks: RemoteMocks | null = null;

export function loadRemoteMocks(): RemoteMocks {
  if (cachedMocks) return cachedMocks;

  const defaults = Object.fromEntries(
    REMOTE_KINDS.map((k) => [k, fakedOwnerRepo()]),
  ) as Record<RemoteKind, { owner: string; repo: string }>;

  const labelsByKind = Object.fromEntries(
    REMOTE_KINDS.map((k) => [k, fakedLabels()]),
  ) as Record<RemoteKind, string[]>;

  const synthetic: FixtureContributor = {
    username: faker.internet.username(),
    pr_title: faker.lorem.sentence(),
    pr_number: faker.number.int({ min: 1, max: 9999 }),
    pr_labels: [faker.word.noun()],
  };

  cachedMocks = { defaults, synthetic, labelsByKind };
  return cachedMocks;
}

// ---------- Context decoration --------------------------------------------

interface Commit {
  id?: string;
  message?: string;
  author?: { name?: string; email?: string; timestamp?: number };
  remote?: CommitRemote;
  [k: string]: unknown;
}

interface CommitRemote {
  username?: string;
  pr_title?: string;
  pr_number?: number;
  pr_labels?: string[];
  is_first_time?: boolean;
}

interface KindBlock {
  contributors?: FixtureContributor[];
}

interface Release {
  version?: string | null;
  commits?: Commit[];
  github?: KindBlock;
  gitlab?: KindBlock;
  gitea?: KindBlock;
  bitbucket?: KindBlock;
  azure_devops?: KindBlock;
  [k: string]: unknown;
}

const PRIORITY_ORDER: readonly RemoteKind[] = [
  "github",
  "gitlab",
  "gitea",
  "bitbucket",
  "azure_devops",
];

function pickPrimaryKind(kinds: readonly RemoteKind[]): RemoteKind | null {
  for (const k of PRIORITY_ORDER) {
    if (kinds.includes(k)) return k;
  }
  return null;
}

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function deriveUsername(commit: Commit): string {
  const email = commit.author?.email?.trim() ?? "";
  if (!email || email.toLowerCase() === DEFAULT_AUTHOR_EMAIL) {
    return DEFAULT_BOT_USERNAME;
  }
  const local = email.split("@")[0] ?? email;
  const sanitized = local.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || DEFAULT_BOT_USERNAME;
}

function firstLine(message: string | undefined): string {
  if (!message) return "";
  const idx = message.indexOf("\n");
  return (idx >= 0 ? message.slice(0, idx) : message).trim();
}

/**
 * Decorate the pass-1 `--context` JSON with mocked remote data:
 *   - per-commit `commit.remote` for the primary kind.
 *   - per-release `release.<kind>.contributors` for every detected kind.
 *
 * Mutates and returns the input array. Idempotent w.r.t. pre-populated fields:
 * existing `commit.remote` or `release.<kind>.contributors` are merged into,
 * never overwritten.
 */
export function decorateContext(
  releases: Release[],
  detectedKinds: readonly RemoteKind[],
  mocks: RemoteMocks,
): Release[] {
  if (detectedKinds.length === 0 || releases.length === 0) return releases;
  const primary = pickPrimaryKind(detectedKinds);
  if (!primary) return releases;

  // First pass: tag each commit with a mocked `commit.remote`.
  // pr_number is a monotonic counter per release, seeded by hash(version).
  for (const release of releases) {
    const versionSeed = fnv1a32(release.version ?? "unreleased");
    const baseCounter = (versionSeed % 9000) + 1; // 1..9000, leaving room for synthetic 999/9999.
    const commits = release.commits ?? [];
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]!;
      const existing = commit.remote ?? {};
      const username = existing.username ?? deriveUsername(commit);
      const merged: CommitRemote = {
        username,
        pr_title: existing.pr_title ?? firstLine(commit.message),
        pr_number: existing.pr_number ?? baseCounter + i,
        pr_labels: existing.pr_labels ?? [],
        is_first_time: existing.is_first_time ?? false,
      };
      commit.remote = merged;
    }
  }

  // Second pass: compute global first-time-ness across releases.
  // Releases come oldest-first per cliff-notes contract; if they don't, this
  // still produces a stable, deterministic answer (per-username the earliest
  // index wins).
  const firstSeen = new Map<string, number>();
  releases.forEach((release, ri) => {
    for (const commit of release.commits ?? []) {
      const u = commit.remote?.username;
      if (!u) continue;
      const existing = firstSeen.get(u);
      if (existing === undefined || ri < existing) firstSeen.set(u, ri);
    }
  });

  // Third pass: build per-release contributor lists per detected kind.
  releases.forEach((release, ri) => {
    const seenInRelease = new Map<string, FixtureContributor>();
    for (const commit of release.commits ?? []) {
      const r = commit.remote;
      if (!r?.username) continue;
      if (seenInRelease.has(r.username)) continue;
      seenInRelease.set(r.username, {
        username: r.username,
        pr_title: r.pr_title ?? "",
        pr_number: r.pr_number ?? 0,
        pr_labels: r.pr_labels ?? [],
        is_first_time: firstSeen.get(r.username) === ri,
      });
    }

    // Boolean discipline: also flip is_first_time on the per-commit object.
    for (const commit of release.commits ?? []) {
      if (commit.remote?.username) {
        commit.remote.is_first_time =
          firstSeen.get(commit.remote.username) === ri;
      }
    }

    // Always append the synthetic co-contributor — unless its username already
    // appears organically (very unlikely but possible).
    if (!seenInRelease.has(mocks.synthetic.username)) {
      // Deterministically randomize the synthetic's `is_first_time` per release
      // so multi-release renders show a realistic mix of true/false rather than
      // the previous "true in release[0], false everywhere else" pattern.
      const syntheticSeed = fnv1a32(
        `${mocks.synthetic.username}:is_first_time:${release.version ?? "unreleased"}`,
      );
      seenInRelease.set(mocks.synthetic.username, {
        username: mocks.synthetic.username,
        pr_title: mocks.synthetic.pr_title ?? "",
        pr_number: mocks.synthetic.pr_number ?? 999,
        pr_labels: mocks.synthetic.pr_labels ?? [],
        is_first_time: (syntheticSeed & 1) === 1,
      });
    }

    const contributors = Array.from(seenInRelease.values());

    for (const kind of detectedKinds) {
      // Always boolean; copy labels per-kind so different kinds can have
      // different label vocabularies.
      const kindLabels = mocks.labelsByKind[kind];
      const decorated = contributors.map((c) => ({
        ...c,
        pr_labels: c.pr_labels && c.pr_labels.length > 0 ? c.pr_labels : kindLabels,
        is_first_time: c.is_first_time === true,
      }));
      const existing = release[kind] as KindBlock | undefined;
      if (existing && Array.isArray(existing.contributors) && existing.contributors.length > 0) {
        // Don't clobber: merge by username, prefer existing fields.
        const byName = new Map(existing.contributors.map((c) => [c.username, c]));
        for (const c of decorated) {
          if (!byName.has(c.username)) byName.set(c.username, c);
        }
        release[kind] = { ...existing, contributors: Array.from(byName.values()) };
      } else {
        release[kind] = { ...(existing ?? {}), contributors: decorated };
      }
    }

    // Likewise the primary kind also writes commit.remote.pr_labels from the
    // primary kind's label vocabulary if we left them empty.
    for (const commit of release.commits ?? []) {
      if (commit.remote && (!commit.remote.pr_labels || commit.remote.pr_labels.length === 0)) {
        commit.remote.pr_labels = mocks.labelsByKind[primary];
      }
    }
  });

  return releases;
}
