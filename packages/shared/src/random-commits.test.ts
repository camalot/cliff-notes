import { describe, it, expect } from "vitest";
import { generateRandomCommits } from "./random-commits.js";

describe("generateRandomCommits", () => {
  it("produces the requested number of commits", () => {
    const result = generateRandomCommits({ type: "feat", count: 5, seed: 1 });
    expect(result).toHaveLength(5);
  });

  it("emits a conventional header for the chosen type", () => {
    const [c] = generateRandomCommits({ type: "fix", seed: 42 });
    expect(c!.message).toMatch(/^fix(\([^)]+\))?: /);
  });

  it("includes a breaking marker and BREAKING CHANGE footer when breaking is true", () => {
    const [c] = generateRandomCommits({ type: "feat", breaking: true, seed: 7 });
    expect(c!.message).toMatch(/^feat(\([^)]+\))?!: /);
    expect(c!.message).toContain("BREAKING CHANGE");
  });

  it("respects an explicit scope", () => {
    const [c] = generateRandomCommits({ type: "docs", scope: "readme", seed: 1 });
    expect(c!.message).toMatch(/^docs\(readme\): /);
  });

  it("is deterministic for a given seed", () => {
    const a = generateRandomCommits({ type: "perf", count: 3, seed: 12345 });
    const b = generateRandomCommits({ type: "perf", count: 3, seed: 12345 });
    expect(a.map((c) => c.message)).toEqual(b.map((c) => c.message));
  });

  it("synthesizes a 40-char hex id for each commit", () => {
    const result = generateRandomCommits({ type: "chore", count: 3, seed: 9 });
    for (const c of result) {
      expect(c.id).toMatch(/^[a-f0-9]{40}$/);
    }
  });

  it("supports a scopeless type (revert)", () => {
    const [c] = generateRandomCommits({ type: "revert", seed: 3 });
    expect(c!.message.startsWith("revert")).toBe(true);
  });
});
