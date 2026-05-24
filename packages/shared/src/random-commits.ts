import type { Commit, ConventionalType } from "./schemas.js";

interface Templates {
  scopes: string[];
  subjects: string[];
}

const CO_AUTHOR_POOL = [
  { name: "Alex Chen", email: "alex.chen@example.com" },
  { name: "Sam Rivera", email: "s.rivera@devteam.io" },
  { name: "Jordan Lee", email: "jordan@example.org" },
  { name: "Taylor Kimura", email: "t.kimura@contrib.dev" },
  { name: "Morgan Bailey", email: "mbailey@example.net" },
  { name: "Casey Park", email: "casey.park@devco.com" },
  { name: "Blake Whitmore", email: "blake.w@example.io" },
  { name: "Avery Hassan", email: "ahassan@example.com" },
  { name: "Drew Okonkwo", email: "drew.ok@devs.net" },
  { name: "Robin Vance", email: "rvance@opendev.org" },
];

const TEMPLATES: Record<ConventionalType, Templates> = {
  feat: {
    scopes: ["api", "ui", "auth", "parser", "config", "cli", "render", "search"],
    subjects: [
      "add dark mode toggle",
      "support multi-tenant workspaces",
      "introduce keyboard shortcuts for the editor",
      "expose retry policy via configuration",
      "add experimental streaming response",
      "allow custom theme tokens",
      "implement bulk import",
      "preview rendered markdown in real time",
      "let users pin commonly used tags",
      "show diff against previous release",
    ],
  },
  fix: {
    scopes: ["api", "ui", "auth", "parser", "config", "cli", "render"],
    subjects: [
      "handle empty commit list without crashing",
      "correct timezone offset in release timestamps",
      "preserve quotes inside body templates",
      "stop swallowing parse errors silently",
      "avoid race when reloading configuration",
      "tolerate trailing whitespace in tag names",
      "guard against null author on synthesized commits",
      "respect filter_unconventional when grouping",
      "fall back to default branch when ref is missing",
    ],
  },
  docs: {
    scopes: ["readme", "api", "examples", "config"],
    subjects: [
      "document the --from-context flag",
      "clarify allowed host policy",
      "add example for nested scopes",
      "update screenshots for the editor",
      "explain how breaking changes propagate",
    ],
  },
  style: {
    scopes: ["ui", "css", "lint"],
    subjects: [
      "reformat with prettier",
      "align preview pane padding",
      "use semantic color tokens",
      "remove trailing whitespace in templates",
    ],
  },
  refactor: {
    scopes: ["api", "ui", "parser", "store"],
    subjects: [
      "extract context builder into its own module",
      "collapse two near-duplicate validators",
      "replace ad-hoc fetch wrapper with typed client",
      "simplify reducer state shape",
      "move temp-dir helpers next to their callers",
    ],
  },
  perf: {
    scopes: ["render", "parser", "ui"],
    subjects: [
      "cache compiled tera templates",
      "stream large changelogs to stdout",
      "avoid re-parsing cliff.toml on every keystroke",
      "memoize derived commit groupings",
    ],
  },
  tests: {
    scopes: ["api", "ui", "shared"],
    subjects: [
      "cover the empty-tag-list edge case",
      "add a smoke test for the render endpoint",
      "snapshot the default rendered output",
      "exercise SSRF guard with synthetic urls",
    ],
  },
  security: {
    scopes: ["api", "auth", "deps", "parser"],
    subjects: [
      "patch SSRF bypass in repo inspector",
      "tighten allowlist for outbound git fetches",
      "rotate signing key after disclosure",
      "sanitize tera template input",
      "bump dependency with known CVE",
    ],
  },
  build: {
    scopes: ["deps", "docker", "vite"],
    subjects: [
      "pin Node to 20 in the production image",
      "bump zod to 3.24",
      "drop unused tailwind plugin",
      "split web and api images",
    ],
  },
  ci: {
    scopes: ["actions", "release"],
    subjects: [
      "publish junit reports as artifacts",
      "cache pnpm store between runs",
      "fail the build when coverage drops",
      "run e2e against the production bundle",
    ],
  },
  chore: {
    scopes: ["deps", "release", "lint"],
    subjects: [
      "update third-party licenses",
      "remove the deprecated --legacy flag",
      "tidy up unused exports",
      "rotate signing key",
    ],
  },
  revert: {
    scopes: [],
    subjects: [
      'revert "feat(api): introduce experimental streaming"',
      'revert "refactor(parser): simplify state shape"',
      'revert "chore(deps): bump zod"',
    ],
  },
};

let rngSeed = 0;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  if (arr.length === 0) throw new Error("pick(): empty array");
  return arr[Math.floor(rng() * arr.length)]!;
}

function synthesizeId(message: string, index: number): string {
  let h = 0x811c9dc5;
  const seed = `${index}:${message}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const part = (h >>> 0).toString(16).padStart(8, "0");
  return (part + part + part + part + part).slice(0, 40);
}

export interface RandomCommitOptions {
  type: ConventionalType;
  breaking?: boolean;
  scope?: string;
  count?: number;
  /** Optional seed for deterministic generation, used by tests. */
  seed?: number;
  /** Squash multiple commits into a single multi-line commit. Only valid when count >= 2. */
  squash?: boolean;
  /** Number of random co-authors to include in footer (0-5). Only meaningful when squash=true. */
  coAuthors?: number;
}

function buildSquashedCommit(
  commits: Commit[],
  opts: RandomCommitOptions,
  rng: () => number,
  baseTimestamp: number
): Commit {
  const squashHeader = commits[0]!.message.split('\n')[0]!;
  const parts: string[] = [squashHeader, ""];

  // Add each sub-commit as a bullet point
  for (const commit of commits) {
    const commitFirstLine = commit.message.split('\n')[0]!;
    parts.push(`* ${commitFirstLine}`);

    // ~50% chance to add detail lines for this sub-commit
    if (rng() < 0.5 && commits.length > 1) {
      const detailLines = Math.floor(rng() * 3) + 1; // 1-3 detail lines
      for (let i = 0; i < detailLines; i++) {
        const detailType = rng() < 0.6 ? "  -" : "  ";
        const detailOptions = [
          "implements new feature",
          "fixes critical bug",
          "improves performance",
          "refactors legacy code",
          "adds test coverage",
          "updates documentation",
          "enhances user experience",
          "resolves issue",
        ];
        const detail = pick(detailOptions, rng);
        parts.push(`${detailType} ${detail}`);
      }
    }
  }

  parts.push("");

  // ~40% chance to add a footer paragraph
  if (rng() < 0.4) {
    const footerOptions = [
      "Resolves long-standing user feedback.",
      "Improves overall system stability.",
      "Addresses technical debt.",
      "Implements requested feature.",
      "Ensures backwards compatibility.",
    ];
    parts.push(pick(footerOptions, rng));
    parts.push("");
  }

  // Add co-authors if requested
  const numCoAuthors = (opts.coAuthors ?? 0) > 0 ? Math.min(opts.coAuthors!, 5) : 0;
  if (numCoAuthors > 0) {
    parts.push("--------");
    parts.push("");

    // Pick random co-authors without replacement
    const coAuthorsToAdd: typeof CO_AUTHOR_POOL = [];
    const poolCopy = [...CO_AUTHOR_POOL];
    for (let i = 0; i < Math.min(numCoAuthors, poolCopy.length); i++) {
      const idx = Math.floor(rng() * poolCopy.length);
      coAuthorsToAdd.push(...poolCopy.splice(idx, 1));
    }

    for (const author of coAuthorsToAdd) {
      parts.push(`co-authored-by: ${author.name} <${author.email}>`);
    }
  }

  const message = parts.join("\n");

  return {
    id: synthesizeId(message, 0),
    message,
    author: {
      name: "cliff-notes",
      email: "noreply@cliff-notes.local",
      timestamp: baseTimestamp,
    },
    committer: {
      name: "cliff-notes",
      email: "noreply@cliff-notes.local",
      timestamp: baseTimestamp,
    },
  };
}

export function generateRandomCommits(opts: RandomCommitOptions): Commit[] {
  const count = opts.count ?? 1;
  const breaking = opts.breaking ?? false;
  const seed = opts.seed ?? ((Date.now() ^ (rngSeed++ * 0x9e3779b1)) >>> 0);
  const rng = mulberry32(seed);
  const template = TEMPLATES[opts.type];
  const baseTimestamp = Math.floor(Date.now() / 1000);

  // Handle squash mode: generate individual commits first, then squash them
  if (opts.squash && count >= 2) {
    const individualCommits: Commit[] = [];
    for (let i = 0; i < count; i++) {
      const subject = pick(template.subjects, rng);
      const scope =
        opts.scope ??
        (template.scopes.length > 0 && rng() < 0.6 ? pick(template.scopes, rng) : undefined);

      const header =
        scope !== undefined
          ? `${opts.type}(${scope})${breaking ? "!" : ""}: ${subject}`
          : `${opts.type}${breaking ? "!" : ""}: ${subject}`;

      const body = breaking
        ? "BREAKING CHANGE: behavior intentionally changed; see release notes."
        : undefined;

      const message = body ? `${header}\n\n${body}` : header;

      individualCommits.push({
        id: synthesizeId(message, i),
        message,
        body,
        author: {
          name: "cliff-notes",
          email: "noreply@cliff-notes.local",
          timestamp: baseTimestamp - (count - i) * 60,
        },
        committer: {
          name: "cliff-notes",
          email: "noreply@cliff-notes.local",
          timestamp: baseTimestamp - (count - i) * 60,
        },
      });
    }

    return [buildSquashedCommit(individualCommits, opts, rng, baseTimestamp)];
  }

  // Normal mode: generate individual commits
  const commits: Commit[] = [];
  for (let i = 0; i < count; i++) {
    const subject = pick(template.subjects, rng);
    const scope =
      opts.scope ??
      (template.scopes.length > 0 && rng() < 0.6 ? pick(template.scopes, rng) : undefined);

    const header =
      scope !== undefined
        ? `${opts.type}(${scope})${breaking ? "!" : ""}: ${subject}`
        : `${opts.type}${breaking ? "!" : ""}: ${subject}`;

    const body = breaking
      ? "BREAKING CHANGE: behavior intentionally changed; see release notes."
      : undefined;

    const message = body ? `${header}\n\n${body}` : header;

    commits.push({
      id: synthesizeId(message, i),
      message,
      body,
      author: {
        name: "cliff-notes",
        email: "noreply@cliff-notes.local",
        timestamp: baseTimestamp - (count - i) * 60,
      },
      committer: {
        name: "cliff-notes",
        email: "noreply@cliff-notes.local",
        timestamp: baseTimestamp - (count - i) * 60,
      },
    });
  }
  return commits;
}
