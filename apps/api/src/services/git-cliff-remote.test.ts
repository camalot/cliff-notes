import { describe, it, expect } from "vitest";
import { renderChangelog } from "./git-cliff.js";
import { loadConfig } from "../config.js";

const config = loadConfig({});

const BASE_TEMPLATE_TOML = `
[changelog]
body = """
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group | striptags | trim | upper_first }}
{% for c in commits %}
- {{ c.message }} (@{{ c.remote.username }}, PR #{{ c.remote.pr_number }})
{% endfor %}
{% endfor %}
{% if github.contributors | filter(attribute="is_first_time", value=true) | length > 0 %}
## New Contributors
{% for contributor in github.contributors | filter(attribute="is_first_time", value=true) %}
* @{{ contributor.username }}
{% endfor %}
{% endif %}
"""
[git]
conventional_commits = true
commit_parsers = [
  { message = "^feat", group = "<!-- 0 -->Features" },
  { message = "^fix", group = "<!-- 1 -->Bug Fixes" },
]
`;

const REMOTE_GITHUB_BLOCK = `
[remote.github]
owner = "myowner"
repo = "myrepo"
token = "REALLY_SECRET_TOKEN_DO_NOT_LEAK"
`;

describe("renderChangelog with [remote.github]", () => {
  it("strips token from disk, renders contributors, populates commit.remote.*", async () => {
    const cliffToml = BASE_TEMPLATE_TOML + REMOTE_GITHUB_BLOCK;
    const result = await renderChangelog(
      {
        cliffToml,
        releases: [
          {
            version: "v1.0.0",
            timestamp: 1700000000,
            commits: [
              {
                message: "feat: add a feature",
                author: { name: "Alice", email: "alice@x.com", timestamp: 1700000000 },
              },
              {
                message: "fix: bug",
                author: { name: "Bob", email: "bob@x.com", timestamp: 1700000000 },
              },
            ],
          },
        ],
      },
      config,
      "test-remote-github",
    );

    expect(result.markdown).toContain("Features");
    expect(result.markdown).toContain("Bug Fixes");
    expect(result.markdown).toMatch(/@alice/i);
    expect(result.markdown).toMatch(/@bob/i);
    // PR numbers populated.
    expect(result.markdown).toMatch(/PR #\d+/);
    // New Contributors section renders something.
    expect(result.markdown).toContain("New Contributors");
    // Token leaked nowhere.
    expect(result.markdown).not.toContain("REALLY_SECRET_TOKEN");
    expect(JSON.stringify(result)).not.toContain("REALLY_SECRET_TOKEN");
    // mockedRemotes surfaced.
    expect(result.mockedRemotes).toEqual(["github"]);
    // Token warning issued.
    expect(result.warnings.some((w) => w.includes("token"))).toBe(true);
  }, 30_000);

  it("renders without mock pipeline when no [remote.*] is present", async () => {
    const simpleToml = `
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
  { message = "^feat", group = "<!-- 0 -->Features" },
]
`;
    const result = await renderChangelog(
      {
        cliffToml: simpleToml,
        releases: [
          {
            version: "v1.0.0",
            timestamp: 1700000000,
            commits: [{ message: "feat: thing", author: { name: "a", email: "a@x.com", timestamp: 1700000000 } }],
          },
        ],
      },
      config,
      "test-no-remote",
    );
    expect(result.mockedRemotes).toBeUndefined();
    expect(result.markdown).toContain("Features");
  }, 30_000);

  it("computes bumpedVersion against cleaned toml when [remote.github] is set", async () => {
    const result = await renderChangelog(
      {
        cliffToml: BASE_TEMPLATE_TOML + REMOTE_GITHUB_BLOCK,
        options: { bumpedVersion: true, unreleased: true },
        releases: [
          {
            version: "v1.0.0",
            timestamp: 1700000000,
            commits: [
              {
                message: "feat: thing",
                author: { name: "a", email: "a@x.com", timestamp: 1700000000 },
              },
            ],
          },
          {
            version: null,
            commits: [
              {
                message: "feat: another",
                author: { name: "a", email: "a@x.com", timestamp: 1700000001 },
              },
            ],
          },
        ],
      },
      config,
      "test-bumped",
    );
    expect(result.nextTag).toBeDefined();
    // Token absent everywhere.
    expect(JSON.stringify(result)).not.toContain("REALLY_SECRET_TOKEN");
  }, 30_000);

  it("does not strip [remote.github] mention inside a triple-quoted template body", async () => {
    // The user references the literal string "[remote.github]" inside a
    // template footer. The scanner must not treat that as a header.
    const toml = `
[changelog]
body = """
${"```toml\n[remote.github]\nowner = \"someone\"\n```"}
- {{ commits | length }} commit(s)
"""
[git]
conventional_commits = true
`;
    const result = await renderChangelog(
      {
        cliffToml: toml,
        releases: [
          {
            version: "v1.0.0",
            timestamp: 1700000000,
            commits: [{ message: "feat: x", author: { name: "a", email: "a@x.com", timestamp: 1700000000 } }],
          },
        ],
      },
      config,
      "test-triplequote",
    );
    expect(result.mockedRemotes).toBeUndefined();
    expect(result.markdown).toContain("[remote.github]");
  }, 30_000);
});
