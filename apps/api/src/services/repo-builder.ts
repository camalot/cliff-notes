import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Author, Release } from "@cliff-notes/shared";
import { execProcess } from "../lib/exec.js";
import type { AppConfig } from "../config.js";

const DEFAULT_AUTHOR: Author = {
  name: "cliff-notes",
  email: "noreply@cliff-notes.local",
  timestamp: 0,
};

export interface BuiltRepo {
  commitCount: number;
  tagCount: number;
}

/**
 * Initializes a throwaway git repo at `dir`, replays the supplied releases as
 * real commits/tags via `git fast-import`, and writes the user's `cliff.toml`
 * to the repo root. git-cliff is then run against this repo so its own commit
 * parsers (group/skip/scope rules) apply to the rendered output — which is
 * what users expect when authoring a cliff.toml.
 *
 * Releases are processed oldest-first; tags are placed after the last commit
 * of each tagged release. Releases with no commits are skipped (a git tag
 * needs a commit to point at).
 */
export async function buildTempRepo(
  dir: string,
  releases: Release[],
  cliffToml: string,
  config: AppConfig,
): Promise<BuiltRepo> {
  await execProcess(config.gitBin, {
    args: ["init", "-q", "--initial-branch=main", dir],
    timeoutMs: config.cloneTimeoutMs,
  });

  await writeFile(join(dir, "cliff.toml"), cliffToml, "utf8");

  const { stream, commitCount, tagCount } = buildFastImportStream(releases);
  if (commitCount > 0) {
    await execProcess(config.gitBin, {
      args: ["-C", dir, "fast-import", "--quiet"],
      stdin: stream,
      timeoutMs: config.cloneTimeoutMs,
    });
  }

  return { commitCount, tagCount };
}

interface FastImportResult {
  stream: string;
  commitCount: number;
  tagCount: number;
}

function buildFastImportStream(releases: Release[]): FastImportResult {
  const lines: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  let mark = 0;
  let prevMark = 0;
  let commitCount = 0;
  let tagCount = 0;

  // A single empty blob shared by every commit. fast-import requires at least
  // one file modification per commit, and an empty blob keeps the tree empty.
  const BLOB_MARK = 1;
  lines.push(`blob`);
  lines.push(`mark :${BLOB_MARK}`);
  lines.push(`data 0`);
  lines.push("");
  mark = BLOB_MARK;

  for (let ri = 0; ri < releases.length; ri++) {
    const release = releases[ri]!;
    for (let ci = 0; ci < release.commits.length; ci++) {
      const c = release.commits[ci]!;
      mark++;
      const fallbackTs = now - (releases.length - ri) * 86_400 - (release.commits.length - ci) * 60;
      const author = sanitizeAuthor(c.author ?? { ...DEFAULT_AUTHOR, timestamp: fallbackTs });
      const committer = sanitizeAuthor(c.committer ?? author);
      const msgBytes = Buffer.byteLength(c.message, "utf8");

      lines.push(`commit refs/heads/main`);
      lines.push(`mark :${mark}`);
      lines.push(
        `author ${author.name} <${author.email}> ${author.timestamp} +0000`,
      );
      lines.push(
        `committer ${committer.name} <${committer.email}> ${committer.timestamp} +0000`,
      );
      lines.push(`data ${msgBytes}`);
      lines.push(c.message);
      if (prevMark) lines.push(`from :${prevMark}`);
      lines.push(`M 100644 :${BLOB_MARK} .keep`);
      lines.push("");
      prevMark = mark;
      commitCount++;
    }

    if (release.version && release.commits.length > 0) {
      const ts = release.timestamp ?? now;
      const tagMsg = release.message ?? `Release ${release.version}`;
      const tagBytes = Buffer.byteLength(tagMsg, "utf8");
      lines.push(`tag ${stripTag(release.version)}`);
      lines.push(`from :${prevMark}`);
      lines.push(
        `tagger cliff-notes <noreply@cliff-notes.local> ${ts} +0000`,
      );
      lines.push(`data ${tagBytes}`);
      // `tag` data block must NOT be followed by a blank line — fast-import
      // accepts at most one trailing LF (the separator between commands).
      // Pushing an empty string here would yield `\n\n`, which fast-import
      // parses as an empty command and aborts with "unsupported command:".
      lines.push(tagMsg);
      tagCount++;
    }
  }

  return { stream: lines.join("\n"), commitCount, tagCount };
}

/**
 * `git fast-import` is unforgiving about newlines/angle brackets inside the
 * `Name <email>` ident line. We strip both rather than trying to escape — the
 * resulting commit metadata is still valid, just sanitized.
 */
function sanitizeAuthor(a: Author): Author {
  return {
    name: a.name.replace(/[<>\r\n]/g, " ").trim() || DEFAULT_AUTHOR.name,
    email: a.email.replace(/[<>\r\n\s]/g, "") || DEFAULT_AUTHOR.email,
    timestamp: Number.isFinite(a.timestamp) ? a.timestamp : 0,
  };
}

/** Tag refs can't contain whitespace or control chars. */
function stripTag(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[\x00-\x1f~^:?*\[\\]/g, "");
}
