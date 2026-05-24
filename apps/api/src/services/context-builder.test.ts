import { describe, it, expect } from "vitest";
import { buildContext, synthesizeCommitId } from "./context-builder.js";

describe("synthesizeCommitId", () => {
  it("returns a 40-hex string", () => {
    expect(synthesizeCommitId("hello")).toMatch(/^[a-f0-9]{40}$/);
  });
  it("is deterministic", () => {
    expect(synthesizeCommitId("a")).toBe(synthesizeCommitId("a"));
    expect(synthesizeCommitId("a")).not.toBe(synthesizeCommitId("b"));
  });
});

describe("buildContext", () => {
  it("wraps each release into a context object", () => {
    const ctx = buildContext([
      { commits: [{ message: "feat: x" }] },
      { version: "v1.0.0", timestamp: 1700000000, commits: [{ message: "fix: y" }] },
    ]) as Array<{ version: string | null; commits: unknown[]; timestamp: number }>;
    expect(ctx).toHaveLength(2);
    expect(ctx[0]!.version).toBeNull();
    expect(ctx[1]!.version).toBe("v1.0.0");
    expect(ctx[1]!.timestamp).toBe(1700000000);
  });
  it("synthesizes ids for commits without them", () => {
    const ctx = buildContext([
      { commits: [{ message: "feat: x" }, { message: "fix: y" }] },
    ]) as Array<{ commits: Array<{ id: string }> }>;
    const ids = ctx[0]!.commits.map((c) => c.id);
    expect(ids[0]).toMatch(/^[a-f0-9]{40}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
  it("preserves caller-supplied commit ids", () => {
    const ctx = buildContext([
      {
        commits: [{ message: "feat: x", id: "abcdef1234567890abcdef1234567890abcdef12" }],
      },
    ]) as Array<{ commits: Array<{ id: string }> }>;
    expect(ctx[0]!.commits[0]!.id).toBe("abcdef1234567890abcdef1234567890abcdef12");
  });
  it("falls back to a default author when none supplied", () => {
    const ctx = buildContext([
      { commits: [{ message: "feat: x" }] },
    ]) as Array<{ commits: Array<{ author: { name: string; email: string } }> }>;
    expect(ctx[0]!.commits[0]!.author.email).toMatch(/cliff-notes/);
  });
});
