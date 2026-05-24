import { execProcess, ExecError } from "../lib/exec.js";
import { withTempDir } from "../lib/temp.js";
import { buildTempRepo } from "./repo-builder.js";
import type { AppConfig } from "../config.js";
import type { Release, RenderOptions } from "@cliff-notes/shared";

export interface RenderInput {
  cliffToml: string;
  releases: Release[];
  options?: RenderOptions;
}

export interface RenderOutput {
  markdown: string;
  warnings: string[];
  nextTag?: string;
  nextTagFallback?: boolean;
}

export class RenderError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
    this.name = "RenderError";
  }
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

function parseSemver(version: string): ParsedSemver | null {
  const m = SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw: version,
  };
}

function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function highestSemverRelease(releases: Release[]): ParsedSemver | null {
  let best: ParsedSemver | null = null;
  for (const r of releases) {
    if (!r.version) continue;
    const parsed = parseSemver(r.version);
    if (!parsed) continue;
    if (!best || compareSemver(parsed, best) > 0) best = parsed;
  }
  return best;
}

function normalizeVersion(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function patchBump(parsed: ParsedSemver): string {
  return `v${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/**
 * Best-effort extraction of `initial_tag` from a `[bump]` table in a cliff.toml
 * string. Honors the value the user configured so the fallback path matches
 * what git-cliff itself would have produced. Regex-based because the API has
 * no TOML parser dependency and the field is a simple quoted string.
 */
function extractBumpInitialTag(toml: string): string | null {
  const lines = toml.split(/\r?\n/);
  let inBump = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const section = /^\[([^\]]+)\]\s*$/.exec(line);
    if (section) {
      inBump = (section[1] ?? "").trim() === "bump";
      continue;
    }
    if (!inBump) continue;
    const m =
      /^initial_tag\s*=\s*"([^"]+)"/.exec(line) ??
      /^initial_tag\s*=\s*'([^']+)'/.exec(line);
    if (m && m[1]) return m[1];
  }
  return null;
}

async function computeBumpedVersion(
  cliffBin: string,
  repoDir: string,
  timeoutMs: number,
  releases: Release[],
  cliffToml: string,
): Promise<{ nextTag: string; fallback: boolean }> {
  const current = highestSemverRelease(releases);
  const hasTags = current !== null;
  const initialTag = extractBumpInitialTag(cliffToml);
  const defaultWithV = normalizeVersion(initialTag ?? "v0.1.0");

  let bumped = "";
  try {
    const result = await execProcess(cliffBin, {
      args: ["--bumped-version", "--offline"],
      cwd: repoDir,
      timeoutMs,
    });
    bumped = result.stdout.trim();
  } catch {
    bumped = "";
  }

  const normalized = bumped ? normalizeVersion(bumped) : "";
  if (normalized && normalized !== "v") {
    return { nextTag: normalized, fallback: false };
  }

  if (hasTags) {
    return { nextTag: patchBump(current), fallback: true };
  }
  return { nextTag: defaultWithV, fallback: true };
}

export async function renderChangelog(
  input: RenderInput,
  config: AppConfig,
): Promise<RenderOutput> {
  const opts = input.options ?? {};

  return withTempDir("cliffnotes-render", async (dir) => {
    await buildTempRepo(dir, input.releases, input.cliffToml, config);

    let nextTag: string | undefined;
    let nextTagFallback: boolean | undefined;
    if (opts.bumpedVersion) {
      const bumped = await computeBumpedVersion(
        config.gitCliffBin,
        dir,
        config.renderTimeoutMs,
        input.releases,
        input.cliffToml,
      );
      nextTag = bumped.nextTag;
      nextTagFallback = bumped.fallback;
    }

    const args: string[] = [];
    if (nextTag) args.push("--tag", nextTag);
    if (opts.unreleased) args.push("--unreleased");

    try {
      const result = await execProcess(config.gitCliffBin, {
        args,
        cwd: dir,
        timeoutMs: config.renderTimeoutMs,
      });
      const warnings = result.stderr
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return {
        markdown: result.stdout,
        warnings,
        ...(nextTag !== undefined ? { nextTag } : {}),
        ...(nextTagFallback !== undefined ? { nextTagFallback } : {}),
      };
    } catch (err) {
      if (err instanceof ExecError) {
        throw new RenderError(
          `git-cliff exited with code ${err.exitCode ?? "null"}.`,
          err.stderr,
        );
      }
      throw err;
    }
  });
}
