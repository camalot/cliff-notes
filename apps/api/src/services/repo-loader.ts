import type { Commit, RepoInspectResponse, RepoRange, Tag } from "@cliff-notes/shared";
import { MAX_REPO_COMMITS, MAX_REPO_TAGS } from "@cliff-notes/shared";
import type { AppConfig } from "../config.js";
import { execProcess, ExecError } from "../lib/exec.js";
import { withTempDir } from "../lib/temp.js";
import { checkRepoUrl } from "../lib/url-allowlist.js";

const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

export class RepoLoadError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = "RepoLoadError";
  }
}

export interface InspectRepoOptions {
  url: string;
  range?: RepoRange;
  /** Hard cap; min'd with MAX_REPO_COMMITS. */
  maxCommits: number;
  /** Branch/tag/ref to fetch. Falls back to the remote's default branch when empty. */
  branch?: string;
  /** Repo-relative path to the cliff.toml; defaults to "cliff.toml". */
  cliffTomlPath?: string;
}

export async function inspectRepo(
  opts: InspectRepoOptions,
  config: AppConfig,
  projectId: string,
): Promise<RepoInspectResponse> {
  const check = checkRepoUrl(opts.url);
  if (!check.ok) throw new RepoLoadError(check.reason ?? "Invalid URL");
  const cloneUrl = check.normalized!;
  const cliffTomlPath = sanitizeRelativePath(opts.cliffTomlPath || "cliff.toml");
  const branch = opts.branch?.trim() || undefined;
  const depth = Math.min(Math.max(opts.maxCommits, 1), MAX_REPO_COMMITS);

  return withTempDir("clone", projectId, async (dir) => {
    // Sparse, no-blob, no-tag clone. We only want the cliff.toml blob plus
    // commit metadata — no working tree, no other file content, no tags
    // beyond the ones we'll explicitly fetch later.
    const cloneArgs = [
      "clone",
      "--depth",
      String(depth),
      "--filter=blob:none",
      "--sparse",
      "--no-tags",
      "--single-branch",
      "--quiet",
    ];
    if (branch) cloneArgs.push("--branch", branch);
    cloneArgs.push(cloneUrl, dir);

    try {
      await execProcess(config.gitBin, {
        args: cloneArgs,
        timeoutMs: config.cloneTimeoutMs,
      });
    } catch (err) {
      if (err instanceof ExecError) {
        throw new RepoLoadError(`Failed to clone repository: ${err.stderr.trim() || err.message}`);
      }
      throw err;
    }

    // Restrict the working tree to just the cliff.toml so we don't materialize
    // any other repo content on disk.
    await execProcess(config.gitBin, {
      args: ["-C", dir, "sparse-checkout", "set", "--no-cone", cliffTomlPath],
      timeoutMs: 5_000,
    }).catch(() => undefined);

    // Fetch a bounded number of the most recent tags reachable from the cloned
    // history. Limiting on the server keeps tag-heavy repos from blowing up
    // both the clone time and the response size.
    await fetchRecentTags(dir, MAX_REPO_TAGS, config).catch(() => undefined);

    const tags = await listTags(dir, MAX_REPO_TAGS, config);
    const commits = await listCommits(dir, opts.range, depth, config);
    const cliffToml = await readCliffToml(dir, cliffTomlPath, config);
    const defaultBranch = await detectDefaultBranch(dir, config);

    return { tags, commits, cliffToml, defaultBranch };
  });
}

/** Reject paths that try to escape the repo root or use absolute locations. */
function sanitizeRelativePath(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, "");
  if (!trimmed) return "cliff.toml";
  if (trimmed.split(/[\\/]/).some((seg) => seg === "..")) {
    throw new RepoLoadError("cliff.toml path must not contain '..' segments.");
  }
  return trimmed;
}

async function fetchRecentTags(dir: string, limit: number, config: AppConfig): Promise<void> {
  // List remote tags newest-first by chasing the lightweight `for-each-ref`
  // form on the remote. ls-remote doesn't sort by date, so we instead fetch
  // tags shallowly and let the local sort handle the rest.
  await execProcess(config.gitBin, {
    args: [
      "-C",
      dir,
      "fetch",
      "--depth",
      "1",
      "--no-recurse-submodules",
      "--filter=blob:none",
      "origin",
      "+refs/tags/*:refs/tags/*",
    ],
    timeoutMs: config.cloneTimeoutMs,
  }).catch(() => undefined);

  // Prune any tags beyond the limit to keep subsequent operations cheap. We
  // sort by creator date desc; anything past `limit` gets deleted locally so
  // listTags doesn't have to re-sort huge result sets.
  const all = await execProcess(config.gitBin, {
    args: [
      "-C",
      dir,
      "for-each-ref",
      "--sort=-creatordate",
      "--format=%(refname:short)",
      "refs/tags",
    ],
    timeoutMs: 5_000,
  }).catch(() => undefined);
  if (!all) return;
  const names = all.stdout.split(/\r?\n/).filter(Boolean);
  const extras = names.slice(limit);
  for (const name of extras) {
    await execProcess(config.gitBin, {
      args: ["-C", dir, "tag", "-d", name],
      timeoutMs: 2_000,
    }).catch(() => undefined);
  }
}

async function listTags(dir: string, limit: number, config: AppConfig): Promise<Tag[]> {
  const fmt = `%(refname:short)${FIELD_SEP}%(objectname)${FIELD_SEP}%(creatordate:unix)${FIELD_SEP}%(contents:subject)`;
  const result = await execProcess(config.gitBin, {
    args: ["-C", dir, "tag", "--sort=-creatordate", `--format=${fmt}`],
    timeoutMs: config.cloneTimeoutMs,
  });
  return result.stdout
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .slice(0, limit)
    .map((line): Tag => {
      const [name = "", commitId = "", ts = "", message = ""] = line.split(FIELD_SEP);
      const timestamp = ts ? Number(ts) : undefined;
      return {
        name,
        commitId: commitId || undefined,
        timestamp: Number.isFinite(timestamp) ? timestamp : undefined,
        message: message || undefined,
      };
    });
}

async function listCommits(
  dir: string,
  range: RepoRange | undefined,
  maxCount: number,
  config: AppConfig,
): Promise<Commit[]> {
  const fmt = [
    "%H",
    "%an",
    "%ae",
    "%at",
    "%cn",
    "%ce",
    "%ct",
    "%s",
    "%b",
  ].join(FIELD_SEP) + RECORD_SEP;

  const rangeArg = formatRange(range);
  const args = [
    "-C",
    dir,
    "log",
    "--no-merges",
    `--max-count=${maxCount}`,
    `--format=${fmt}`,
  ];
  if (rangeArg) args.push(rangeArg);

  const result = await execProcess(config.gitBin, { args, timeoutMs: config.cloneTimeoutMs });
  return result.stdout
    .split(RECORD_SEP)
    .map((chunk) => chunk.replace(/^\r?\n/, ""))
    .filter((chunk) => chunk.length > 0)
    .map((chunk): Commit => {
      const fields = chunk.split(FIELD_SEP);
      const [id, an, ae, at, cn, ce, ct, subject, ...rest] = fields;
      const body = rest.join(FIELD_SEP).replace(/\r?\n$/, "");
      const message = body ? `${subject}\n\n${body}` : (subject ?? "");
      return {
        id: id || undefined,
        message,
        body: body || undefined,
        author: an && ae && at ? { name: an, email: ae, timestamp: Number(at) } : undefined,
        committer: cn && ce && ct ? { name: cn, email: ce, timestamp: Number(ct) } : undefined,
      };
    });
}

function formatRange(range: RepoRange | undefined): string | undefined {
  if (!range) return undefined;
  if (range.from && range.to) return `${range.from}..${range.to}`;
  if (range.from) return `${range.from}..HEAD`;
  if (range.to) return range.to;
  return undefined;
}

async function readCliffToml(
  dir: string,
  path: string,
  config: AppConfig,
): Promise<string | undefined> {
  try {
    const result = await execProcess(config.gitBin, {
      args: ["-C", dir, "show", `HEAD:${path}`],
      timeoutMs: 5000,
    });
    return result.stdout;
  } catch {
    return undefined;
  }
}

async function detectDefaultBranch(dir: string, config: AppConfig): Promise<string | undefined> {
  try {
    const result = await execProcess(config.gitBin, {
      args: ["-C", dir, "symbolic-ref", "--short", "HEAD"],
      timeoutMs: 5000,
    });
    return result.stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
