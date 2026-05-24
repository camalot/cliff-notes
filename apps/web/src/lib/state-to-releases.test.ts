import { describe, it, expect } from "vitest";
import { stateToReleases } from "./state-to-releases";

const commits = [
  { message: "feat: a" },
  { message: "fix: b" },
  { message: "feat: c" },
  { message: "chore: d" },
];

describe("stateToReleases", () => {
  it("with no tags, returns a single unreleased group", () => {
    const r = stateToReleases(commits, []);
    expect(r).toHaveLength(1);
    expect(r[0]!.version).toBeNull();
    expect(r[0]!.commits).toHaveLength(4);
  });

  it("partitions commits at each tag boundary inclusively", () => {
    const r = stateToReleases(commits, [{ name: "v1.0.0", afterIndex: 1 }]);
    expect(r).toHaveLength(2);
    expect(r[0]!.version).toBe("v1.0.0");
    expect(r[0]!.commits.map((c) => c.message)).toEqual(["feat: a", "fix: b"]);
    expect(r[1]!.version).toBeNull();
    expect(r[1]!.commits.map((c) => c.message)).toEqual(["feat: c", "chore: d"]);
  });

  it("supports multiple tags", () => {
    const r = stateToReleases(commits, [
      { name: "v1.0.0", afterIndex: 1 },
      { name: "v1.1.0", afterIndex: 2 },
    ]);
    expect(r.map((x) => x.version)).toEqual(["v1.0.0", "v1.1.0", null]);
    expect(r[0]!.commits).toHaveLength(2);
    expect(r[1]!.commits).toHaveLength(1);
    expect(r[2]!.commits).toHaveLength(1);
  });

  it("sorts tags by afterIndex regardless of input order", () => {
    const r = stateToReleases(commits, [
      { name: "v1.1.0", afterIndex: 2 },
      { name: "v1.0.0", afterIndex: 1 },
    ]);
    expect(r.map((x) => x.version)).toEqual(["v1.0.0", "v1.1.0", null]);
  });

  it("emits dangling tags as empty release groups", () => {
    const r = stateToReleases(commits, [{ name: "v0.0.1", afterIndex: -1 }]);
    expect(r[0]!.version).toBe("v0.0.1");
    expect(r[0]!.commits).toHaveLength(0);
    expect(r.at(-1)!.commits).toHaveLength(4);
  });

  it("always emits a trailing unreleased group, even when empty", () => {
    const r = stateToReleases(commits, [{ name: "v1.0.0", afterIndex: 3 }]);
    expect(r.at(-1)!.version).toBeNull();
    expect(r.at(-1)!.commits).toHaveLength(0);
  });

  it("drops ignored commits from each release group", () => {
    const mixed = [
      { message: "feat: a" },
      { message: "fix: b", ignored: true },
      { message: "feat: c" },
      { message: "chore: d", ignored: true },
    ];
    const r = stateToReleases(mixed, [{ name: "v1.0.0", afterIndex: 1 }]);
    expect(r[0]!.commits.map((c) => c.message)).toEqual(["feat: a"]);
    expect(r[1]!.commits.map((c) => c.message)).toEqual(["feat: c"]);
  });

  it("ignored commits don't shift tag boundaries", () => {
    const mixed = [
      { message: "feat: a", ignored: true },
      { message: "fix: b" },
      { message: "feat: c" },
    ];
    // Tag still closes commits 0-1 (a + b), even though a is ignored.
    const r = stateToReleases(mixed, [{ name: "v1.0.0", afterIndex: 1 }]);
    expect(r[0]!.commits.map((c) => c.message)).toEqual(["fix: b"]);
    expect(r[1]!.commits.map((c) => c.message)).toEqual(["feat: c"]);
  });
});
