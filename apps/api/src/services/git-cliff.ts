import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execProcess, ExecError } from "../lib/exec.js";
import { withTempDir } from "../lib/temp.js";
import { buildContext } from "./context-builder.js";
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

async function computeBumpedVersion(
  cliffBin: string,
  configPath: string,
  contextJson: string,
  cwd: string,
  timeoutMs: number,
  releases: Release[],
  defaultVersion: string,
): Promise<{ nextTag: string; fallback: boolean }> {
  const current = highestSemverRelease(releases);
  const hasTags = current !== null;
  const defaultWithV = normalizeVersion(defaultVersion || "v0.1.0");

  let bumped = "";
  try {
    const result = await execProcess(cliffBin, {
      args: [
        "--config",
        configPath,
        "--from-context",
        "-",
        "--bumped-version",
        "--offline",
      ],
      stdin: contextJson,
      cwd,
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
  const context = buildContext(input.releases);
  const json = JSON.stringify(context);
  const opts = input.options ?? {};

  return withTempDir("cliffnotes-render", async (dir) => {
    const configPath = join(dir, "cliff.toml");
    await writeFile(configPath, input.cliffToml, "utf8");

    let nextTag: string | undefined;
    let nextTagFallback: boolean | undefined;
    if (opts.bumpedVersion) {
      const bumped = await computeBumpedVersion(
        config.gitCliffBin,
        configPath,
        json,
        dir,
        config.renderTimeoutMs,
        input.releases,
        opts.defaultVersion ?? "v0.1.0",
      );
      nextTag = bumped.nextTag;
      nextTagFallback = bumped.fallback;
    }

    const args = ["--config", configPath, "--from-context", "-"];
    if (nextTag) args.push("--tag", nextTag);
    if (opts.unreleased) args.push("--unreleased");

    try {
      const result = await execProcess(config.gitCliffBin, {
        args,
        stdin: json,
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
