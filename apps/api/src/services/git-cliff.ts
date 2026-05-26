import { execProcess, ExecError } from "../lib/exec.js";
import { withTempDir } from "../lib/temp.js";
import { buildTempRepo } from "./repo-builder.js";
import {
  parseAndStripRemote,
  injectMockedRemoteBlocks,
  InlineRemoteTableError,
  type RemoteKind,
} from "./cliff-toml-remote.js";
import { decorateContext, loadRemoteMocks } from "./remote-mock.js";
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
  mockedRemotes?: RemoteKind[];
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

function splitStderrLines(stderr: string): string[] {
  return stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export async function renderChangelog(
  input: RenderInput,
  config: AppConfig,
  projectId: string,
): Promise<RenderOutput> {
  const opts = input.options ?? {};

  // Strip BEFORE writing to disk so the user's token never lands in /tmp.
  let stripResult;
  try {
    stripResult = parseAndStripRemote(input.cliffToml);
  } catch (err) {
    if (err instanceof InlineRemoteTableError) {
      throw new RenderError(err.message, err.message);
    }
    throw err;
  }

  const { detectedKinds, carriedOver, referencedToken } = stripResult;
  const mocks = detectedKinds.length > 0 ? loadRemoteMocks(config.remoteMocksDir) : null;
  const tomlForDisk = mocks
    ? injectMockedRemoteBlocks(
        stripResult.cleanedToml,
        detectedKinds,
        carriedOver,
        mocks.defaults,
      )
    : stripResult.cleanedToml;

  return withTempDir("render", projectId, async (dir) => {
    await buildTempRepo(dir, input.releases, tomlForDisk, config);

    let nextTag: string | undefined;
    let nextTagFallback: boolean | undefined;
    if (opts.bumpedVersion) {
      const bumped = await computeBumpedVersion(
        config.gitCliffBin,
        dir,
        config.renderTimeoutMs,
        input.releases,
        tomlForDisk,
      );
      nextTag = bumped.nextTag;
      nextTagFallback = bumped.fallback;
    }

    const baseArgs: string[] = [];
    if (nextTag) baseArgs.push("--tag", nextTag);
    if (opts.unreleased) baseArgs.push("--unreleased");

    if (detectedKinds.length === 0 || !mocks) {
      // Single-pass: existing flow.
      try {
        const result = await execProcess(config.gitCliffBin, {
          args: baseArgs,
          cwd: dir,
          timeoutMs: config.renderTimeoutMs,
        });
        return {
          markdown: result.stdout,
          warnings: splitStderrLines(result.stderr),
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
    }

    // Two-pass flow: capture --context, decorate, then render from context.
    let pass1: { stdout: string; stderr: string };
    try {
      pass1 = await execProcess(config.gitCliffBin, {
        args: [...baseArgs, "--context", "--offline"],
        cwd: dir,
        timeoutMs: config.renderTimeoutMs,
      });
    } catch (err) {
      if (err instanceof ExecError) {
        throw new RenderError(
          `git-cliff exited with code ${err.exitCode ?? "null"}.`,
          err.stderr,
        );
      }
      throw err;
    }

    let parsedContext: unknown;
    try {
      parsedContext = JSON.parse(pass1.stdout);
    } catch (err) {
      throw new RenderError(
        "git-cliff --context did not produce valid JSON.",
        err instanceof Error ? err.message : String(err),
      );
    }
    if (!Array.isArray(parsedContext)) {
      throw new RenderError(
        "git-cliff --context output was not a JSON array.",
        "",
      );
    }
    const decorated = decorateContext(
      parsedContext as never[],
      detectedKinds,
      mocks,
    );

    let pass2;
    try {
      pass2 = await execProcess(config.gitCliffBin, {
        args: [...baseArgs, "--from-context", "-", "--offline"],
        cwd: dir,
        timeoutMs: config.renderTimeoutMs,
        stdin: JSON.stringify(decorated),
      });
    } catch (err) {
      if (err instanceof ExecError) {
        throw new RenderError(
          `git-cliff exited with code ${err.exitCode ?? "null"}.`,
          err.stderr,
        );
      }
      throw err;
    }

    const warnings = splitStderrLines(pass1.stderr);
    if (referencedToken) {
      const kindLabel = detectedKinds.join(", ");
      warnings.push(
        `remote.${kindLabel}.token was set in your cliff.toml. cliff-notes mocks ` +
          `this to an empty string; templates that reference {{ remote.<kind>.token }} ` +
          `will render empty here, even though they wouldn't in real git-cliff.`,
      );
    }

    return {
      markdown: pass2.stdout,
      warnings,
      mockedRemotes: detectedKinds,
      ...(nextTag !== undefined ? { nextTag } : {}),
      ...(nextTagFallback !== undefined ? { nextTagFallback } : {}),
    };
  });
}
