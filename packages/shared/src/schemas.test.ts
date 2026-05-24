import { describe, it, expect } from "vitest";
import {
  authorSchema,
  commitSchema,
  randomCommitRequestSchema,
  renderRequestSchema,
  repoInspectRequestSchema,
} from "./schemas.js";

describe("authorSchema", () => {
  it("accepts a complete author", () => {
    expect(
      authorSchema.parse({ name: "A", email: "a@b.co", timestamp: 1700000000 }),
    ).toEqual({ name: "A", email: "a@b.co", timestamp: 1700000000 });
  });
  it("rejects a negative timestamp", () => {
    expect(() =>
      authorSchema.parse({ name: "A", email: "a@b.co", timestamp: -1 }),
    ).toThrow();
  });
  it("rejects a malformed email", () => {
    expect(() =>
      authorSchema.parse({ name: "A", email: "not-an-email", timestamp: 1 }),
    ).toThrow();
  });
});

describe("commitSchema", () => {
  it("accepts a minimal commit", () => {
    expect(commitSchema.parse({ message: "feat: x" })).toEqual({
      message: "feat: x",
    });
  });
  it("rejects an empty message", () => {
    expect(() => commitSchema.parse({ message: "" })).toThrow();
  });
  it("rejects a non-hex id", () => {
    expect(() => commitSchema.parse({ message: "x", id: "zzz" })).toThrow();
  });
});

describe("renderRequestSchema", () => {
  it("requires at least one release", () => {
    expect(() =>
      renderRequestSchema.parse({ cliffToml: "[git]", releases: [] }),
    ).toThrow();
  });
  it("accepts the minimal happy path with a single unreleased group", () => {
    const v = renderRequestSchema.parse({
      cliffToml: "[git]\nconventional_commits = true",
      releases: [{ commits: [{ message: "feat: hi" }] }],
    });
    expect(v.releases).toHaveLength(1);
    expect(v.releases[0]!.commits).toHaveLength(1);
  });
  it("accepts a tagged release", () => {
    const v = renderRequestSchema.parse({
      cliffToml: "[git]",
      releases: [
        { version: "v1.0.0", timestamp: 1700000000, commits: [{ message: "feat: x" }] },
      ],
    });
    expect(v.releases[0]!.version).toBe("v1.0.0");
  });
});

describe("repoInspectRequestSchema", () => {
  it("rejects a non-URL", () => {
    expect(() => repoInspectRequestSchema.parse({ url: "not a url" })).toThrow();
  });
  it("accepts an https URL", () => {
    const v = repoInspectRequestSchema.parse({ url: "https://github.com/orhun/git-cliff" });
    expect(v.url).toMatch(/^https:/);
  });
});

describe("randomCommitRequestSchema", () => {
  it("defaults count to 1 and breaking to false", () => {
    const v = randomCommitRequestSchema.parse({ type: "feat" });
    expect(v.count).toBe(1);
    expect(v.breaking).toBe(false);
  });
  it("rejects an unknown type", () => {
    expect(() => randomCommitRequestSchema.parse({ type: "nope" })).toThrow();
  });
  it("caps count at 50", () => {
    expect(() => randomCommitRequestSchema.parse({ type: "fix", count: 51 })).toThrow();
  });
});
