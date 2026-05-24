import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTempRepo } from "./repo-builder.js";
import { renderChangelog } from "./git-cliff.js";
import { loadConfig } from "../config.js";
import { execProcess } from "../lib/exec.js";

const config = loadConfig({});

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "repo-builder-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

describe("buildTempRepo", () => {
  it("replays commits and tags into a real git repo", async () => {
    await withTmp(async (dir) => {
      const out = await buildTempRepo(
        dir,
        [
          {
            version: "v1.0.0",
            timestamp: 1700000000,
            commits: [
              { message: "feat: add a feature" },
              { message: "fix: a bug" },
            ],
          },
          { version: null, commits: [{ message: "docs: typo" }] },
        ],
        "[git]\nconventional_commits = true\n",
        config,
      );
      expect(out.commitCount).toBe(3);
      expect(out.tagCount).toBe(1);

      const log = await execProcess(config.gitBin, {
        args: ["-C", dir, "log", "--all", "--oneline"],
      });
      expect(log.stdout).toContain("feat: add a feature");
      expect(log.stdout).toContain("fix: a bug");
      expect(log.stdout).toContain("docs: typo");

      const tags = await execProcess(config.gitBin, {
        args: ["-C", dir, "tag", "-l"],
      });
      expect(tags.stdout.trim()).toBe("v1.0.0");
    });
  }, 15_000);
});

describe("renderChangelog end-to-end", () => {
  it("applies commit_parsers groups from cliff.toml", async () => {
    const cliffToml = `
[changelog]
body = """
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group | striptags | trim | upper_first }}
{% for c in commits %}
- {{ c.message }}
{% endfor %}
{% endfor %}
"""
[git]
conventional_commits = true
commit_parsers = [
  { message = "^feat", group = "<!-- 0 -->🚀 Features" },
  { message = "^fix", group = "<!-- 1 -->🐛 Bug Fixes" },
]
`;
    const result = await renderChangelog(
      {
        cliffToml,
        releases: [
          {
            version: "v1.0.0",
            timestamp: 1700000000,
            commits: [
              { message: "feat: add a feature" },
              { message: "fix: a bug" },
            ],
          },
        ],
      },
      config,
    );
    expect(result.markdown).toContain("🚀 Features");
    expect(result.markdown).toContain("🐛 Bug Fixes");
    expect(result.markdown).not.toMatch(/^### Feat$/m);
  }, 15_000);
});
