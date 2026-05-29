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
  hasDisabledReplaceCommands?: boolean;
  /** Pretty-printed JSON context that was fed to the template renderer. */
  context?: string;
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

/**
 * Remove every `replace_command = <quoted-value>` key from commit_preprocessors
 * (and postprocessors) inline tables in a cliff.toml string.
 *
 * Returns the cleaned TOML and a flag indicating whether any stripping occurred.
 * Handles both single-quoted and double-quoted TOML string values.
 */
export function stripReplaceCommands(toml: string): {
  cleanedToml: string;
  hadReplaceCommands: boolean;
} {
  // Regex removes `, replace_command = <value>` (comma before)
  // or `replace_command = <value>,` (comma after)
  // or `replace_command = <value>` (standalone, no adjacent comma).
  // Handles single-quoted TOML literal strings and double-quoted basic strings.
  const VALUE_PAT = `(?:'[^']*'|"(?:[^"\\\\]|\\\\.)*")`;
  const patterns = [
    // comma before, optional trailing whitespace up to closing } or another ,
    new RegExp(`,\\s*replace_command\\s*=\\s*${VALUE_PAT}`, "g"),
    // comma after
    new RegExp(`replace_command\\s*=\\s*${VALUE_PAT}\\s*,\\s*`, "g"),
    // standalone (no adjacent commas)
    new RegExp(`replace_command\\s*=\\s*${VALUE_PAT}`, "g"),
  ];

  let hadReplaceCommands = false;
  const lines = toml.split(/\r?\n/);
  const cleaned = lines.map((line) => {
    // Skip comment lines.
    if (/^\s*#/.test(line)) return line;
    let result = line;
    for (const re of patterns) {
      const next = result.replace(re, (match) => {
        // Only count/remove if not inside a comment segment.
        if (/#.*replace_command/.test(line)) return match;
        hadReplaceCommands = true;
        return "";
      });
      if (next !== result) {
        result = next;
        break;
      }
    }
    return result;
  });

  return { cleanedToml: cleaned.join("\n"), hadReplaceCommands };
}

export async function renderChangelog(
  input: RenderInput,
  config: AppConfig,
  projectId: string,
): Promise<RenderOutput> {
  const opts = input.options ?? {};

  // Strip replace_command from commit_preprocessors/postprocessors — those
  // external commands cannot run in the sandbox.
  const { cleanedToml: tomlAfterCommandStrip, hadReplaceCommands } =
    stripReplaceCommands(input.cliffToml);
  const effectiveToml = tomlAfterCommandStrip;

  // Strip BEFORE writing to disk so the user's token never lands in /tmp.
  let stripResult;
  try {
    stripResult = parseAndStripRemote(effectiveToml);
  } catch (err) {
    if (err instanceof InlineRemoteTableError) {
      throw new RenderError(err.message, err.message);
    }
    throw err;
  }

  const { detectedKinds, carriedOver, referencedToken } = stripResult;
  const mocks = detectedKinds.length > 0 ? loadRemoteMocks() : null;
  const disabledReplaceCommands = hadReplaceCommands ? true : undefined;
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
      let result: { stdout: string; stderr: string };
      try {
        result = await execProcess(config.gitCliffBin, {
          args: baseArgs,
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

      // Best-effort context capture for the context viewer.
      let contextJson: string | undefined;
      try {
        const ctxResult = await execProcess(config.gitCliffBin, {
          args: [...baseArgs, "--context", "--offline"],
          cwd: dir,
          timeoutMs: config.renderTimeoutMs,
        });
        const parsed = JSON.parse(ctxResult.stdout);
        contextJson = JSON.stringify(parsed, null, 2);
      } catch {
        // Context is non-critical; ignore failures.
      }

      return {
        markdown: result.stdout,
        warnings: splitStderrLines(result.stderr),
        ...(nextTag !== undefined ? { nextTag } : {}),
        ...(nextTagFallback !== undefined ? { nextTagFallback } : {}),
        ...(disabledReplaceCommands ? { hasDisabledReplaceCommands: true } : {}),
        ...(contextJson !== undefined ? { context: contextJson } : {}),
      };
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
      context: JSON.stringify(decorated, null, 2),
      ...(nextTag !== undefined ? { nextTag } : {}),
      ...(nextTagFallback !== undefined ? { nextTagFallback } : {}),
      ...(disabledReplaceCommands ? { hasDisabledReplaceCommands: true } : {}),
    };
  });
}
