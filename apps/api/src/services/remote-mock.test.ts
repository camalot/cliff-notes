import { describe, it, expect } from "vitest";
import { decorateContext, loadRemoteMocks } from "./remote-mock.js";

const mocks = loadRemoteMocks();

function release(version: string | null, commits: Array<{ email: string; message: string }>) {
  return {
    version,
    commits: commits.map((c) => ({
      message: c.message,
      author: { name: c.email, email: c.email, timestamp: 0 },
    })),
  };
}

describe("decorateContext", () => {
  it("returns input untouched when no kinds were detected", () => {
    const releases = [release("v1", [{ email: "a@b.com", message: "x" }])];
    const out = decorateContext(releases as never[], [], mocks);
    expect(out).toBe(releases);
    expect((releases[0]!.commits[0] as { remote?: unknown }).remote).toBeUndefined();
  });

  it("populates commit.remote.username (sanitized email local-part) and pr_title", () => {
    const releases = [
      release("v1", [{ email: "Foo.Bar@x.com", message: "feat: thing\nbody" }]),
    ];
    decorateContext(releases as never[], ["github"], mocks);
    const r = releases[0]!.commits[0] as { remote?: { username: string; pr_title: string; pr_number: number } };
    expect(r.remote?.username).toBe("Foo-Bar");
    expect(r.remote?.pr_title).toBe("feat: thing");
    expect(typeof r.remote?.pr_number).toBe("number");
  });

  it("maps the DEFAULT_AUTHOR email to cliff-notes-bot", () => {
    const releases = [
      release("v1", [{ email: "noreply@cliff-notes.local", message: "fix: x" }]),
    ];
    decorateContext(releases as never[], ["github"], mocks);
    const r = releases[0]!.commits[0] as { remote: { username: string } };
    expect(r.remote.username).toBe("cliff-notes-bot");
  });

  it("uses a monotonic counter for pr_number within a release (no collisions)", () => {
    const releases = [
      release(
        "v1",
        new Array(50).fill(0).map((_, i) => ({ email: `u${i}@x.com`, message: `m${i}` })),
      ),
    ];
    decorateContext(releases as never[], ["github"], mocks);
    const nums = releases[0]!.commits.map((c) => (c as { remote: { pr_number: number } }).remote.pr_number);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("computes is_first_time globally across releases (oldest wins)", () => {
    const releases = [
      release("v1", [{ email: "alice@x.com", message: "first" }]),
      release("v2", [{ email: "alice@x.com", message: "second" }]),
    ];
    decorateContext(releases as never[], ["github"], mocks);
    const r1Alice = (releases[0]!.commits[0] as { remote: { is_first_time: boolean } }).remote.is_first_time;
    const r2Alice = (releases[1]!.commits[0] as { remote: { is_first_time: boolean } }).remote.is_first_time;
    expect(r1Alice).toBe(true);
    expect(r2Alice).toBe(false);
  });

  it("appends a synthetic co-contributor to every release", () => {
    const releases = [release("v1", [{ email: "alice@x.com", message: "x" }])];
    decorateContext(releases as never[], ["github"], mocks);
    const contributors = (releases[0] as { github: { contributors: { username: string }[] } }).github.contributors;
    expect(contributors.length).toBeGreaterThanOrEqual(2);
    expect(contributors.find((c) => c.username === mocks.synthetic.username)).toBeDefined();
  });

  it("writes per-kind contributor blocks for every detected kind", () => {
    const releases = [release("v1", [{ email: "alice@x.com", message: "x" }])];
    decorateContext(releases as never[], ["github", "gitlab"], mocks);
    const r = releases[0] as { github?: unknown; gitlab?: unknown };
    expect(r.github).toBeDefined();
    expect(r.gitlab).toBeDefined();
  });

  it("does not clobber pre-populated commit.remote fields", () => {
    const releases: unknown = [
      {
        version: "v1",
        commits: [
          {
            message: "x",
            author: { name: "a", email: "a@b.com", timestamp: 0 },
            remote: { username: "preset", pr_title: "preset title", pr_number: 42 },
          },
        ],
      },
    ];
    decorateContext(releases as never[], ["github"], mocks);
    const r = (releases as { commits: { remote: { username: string; pr_title: string; pr_number: number } }[] }[])[0]!.commits[0]!.remote;
    expect(r.username).toBe("preset");
    expect(r.pr_title).toBe("preset title");
    expect(r.pr_number).toBe(42);
  });

  it("ensures is_first_time is always a strict boolean", () => {
    const releases = [release("v1", [{ email: "alice@x.com", message: "x" }])];
    decorateContext(releases as never[], ["github"], mocks);
    const r = releases[0]! as { github: { contributors: { is_first_time: unknown }[] } };
    for (const c of r.github.contributors) {
      expect(typeof c.is_first_time).toBe("boolean");
    }
  });
});
