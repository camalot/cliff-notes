import type { Commit, RepoInspectResponse, RepoRange, Tag } from "@cliff-notes/shared";
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

export async function inspectRepo(
  url: string,
  range: RepoRange | undefined,
  maxCommits: number,
  config: AppConfig,
  projectId: string,
): Promise<RepoInspectResponse> {
  const check = checkRepoUrl(url);
  if (!check.ok) throw new RepoLoadError(check.reason ?? "Invalid URL");
  const cloneUrl = check.normalized!;

  return withTempDir("clone", projectId, async (dir) => {
    const depth = Math.min(Math.max(maxCommits, 50), config.maxClonedCommits);
    try {
      await execProcess(config.gitBin, {
        args: [
          "clone",
          "--depth",
          String(depth),
          "--filter=blob:none",
          "--no-checkout",
          "--quiet",
          cloneUrl,
          dir,
        ],
        timeoutMs: config.cloneTimeoutMs,
      });
    } catch (err) {
      if (err instanceof ExecError) {
        throw new RepoLoadError(`Failed to clone repository: ${err.stderr.trim() || err.message}`);
      }
      throw err;
    }

    const tags = await listTags(dir, config);
    const commits = await listCommits(dir, range, depth, config);
    const cliffToml = await readCliffToml(dir, config);
    const defaultBranch = await detectDefaultBranch(dir, config);

    return { tags, commits, cliffToml, defaultBranch };
  });
}

async function listTags(dir: string, config: AppConfig): Promise<Tag[]> {
  const fmt = `%(refname:short)${FIELD_SEP}%(objectname)${FIELD_SEP}%(creatordate:unix)${FIELD_SEP}%(contents:subject)`;
  const result = await execProcess(config.gitBin, {
    args: ["-C", dir, "tag", "--sort=-creatordate", `--format=${fmt}`],
    timeoutMs: config.cloneTimeoutMs,
  });
  return result.stdout
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
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

async function readCliffToml(dir: string, config: AppConfig): Promise<string | undefined> {
  try {
    const result = await execProcess(config.gitBin, {
      args: ["-C", dir, "show", "HEAD:cliff.toml"],
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
