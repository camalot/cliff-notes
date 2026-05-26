import { describe, expect, it } from "vitest";
import { completionsAt, hoverAt } from "./api.js";

function at(textWithMarker: string): { text: string; cursor: number } {
  const cursor = textWithMarker.indexOf("│");
  if (cursor === -1) throw new Error("missing cursor marker (use │)");
  return { text: textWithMarker.replace("│", ""), cursor };
}

describe("completionsAt", () => {
  it("returns nothing outside any template", () => {
    const { text, cursor } = at(`header = "abc"\n│\n`);
    expect(completionsAt(text, cursor)).toEqual([]);
  });

  it("offers Release-level variables in a bare expression", () => {
    const { text, cursor } = at(`body = """\n{{ │ }}\n"""\n`);
    const items = completionsAt(text, cursor);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("commits");
    expect(labels).toContain("version");
    expect(labels).toContain("timestamp");
  });

  it("does NOT offer github-specific variables when no [remote.github] is configured", () => {
    const { text, cursor } = at(`body = """\n{{ │ }}\n"""\n`);
    const labels = completionsAt(text, cursor).map((i) => i.label);
    expect(labels).not.toContain("github");
  });

  it("offers github-specific variables when [remote.github] is configured", () => {
    const { text, cursor } = at(
      `[remote.github]\nowner = "a"\nrepo = "b"\n[changelog]\nbody = """\n{{ │ }}\n"""\n`,
    );
    const labels = completionsAt(text, cursor).map((i) => i.label);
    expect(labels).toContain("github");
  });

  it("offers Commit properties after `commit.`", () => {
    const { text, cursor } = at(
      `body = """\n{% for commit in commits %}{{ commit.│ }}{% endfor %}\n"""\n`,
    );
    const labels = completionsAt(text, cursor).map((i) => i.label);
    expect(labels).toContain("id");
    expect(labels).toContain("group");
    expect(labels).toContain("message");
    expect(labels).toContain("author");
    expect(labels).not.toContain("commits"); // not a Commit property
  });

  it("offers github commit fields after `commit.github.` only when github is active", () => {
    const githubActive = at(
      `[remote.github]\nowner="a"\n[changelog]\nbody = """\n{% for commit in commits %}{{ commit.github.│ }}{% endfor %}\n"""\n`,
    );
    const githubLabels = completionsAt(githubActive.text, githubActive.cursor).map((i) => i.label);
    expect(githubLabels).toContain("pr_number");
    expect(githubLabels).toContain("pr_labels");

    const baseOnly = at(
      `[changelog]\nbody = """\n{% for commit in commits %}{{ commit.github.│ }}{% endfor %}\n"""\n`,
    );
    expect(completionsAt(baseOnly.text, baseOnly.cursor)).toEqual([]);
  });

  it("offers filter names after `|`", () => {
    const { text, cursor } = at(`body = """\n{{ commit.message | │ }}\n"""\n`);
    const items = completionsAt(text, cursor);
    expect(items.every((i) => i.kind === "filter")).toBe(true);
    expect(items.map((i) => i.label)).toContain("upper");
    expect(items.map((i) => i.label)).toContain("group_by");
  });

  it("offers tests after `is`", () => {
    const { text, cursor } = at(`body = """\n{% if commit.body is │ %}\n"""\n`);
    const items = completionsAt(text, cursor);
    expect(items.every((i) => i.kind === "test")).toBe(true);
    expect(items.map((i) => i.label)).toContain("defined");
    expect(items.map((i) => i.label)).toContain("matching");
  });

  it("offers tag names in an empty {% %} statement", () => {
    const { text, cursor } = at(`body = """\n{% │ %}\n"""\n`);
    const items = completionsAt(text, cursor);
    expect(items.every((i) => i.kind === "keyword")).toBe(true);
    expect(items.map((i) => i.label)).toContain("for");
    expect(items.map((i) => i.label)).toContain("if");
  });

  it("offers iterables (arrays/maps) after `for x in `", () => {
    const { text, cursor } = at(`body = """\n{% for c in │ %}\n"""\n`);
    const items = completionsAt(text, cursor);
    expect(items.map((i) => i.label)).toContain("commits");
    expect(items.map((i) => i.label)).not.toContain("version"); // string, not iterable
  });

  it("offers snippets in a bare expression", () => {
    const { text, cursor } = at(`body = """\n{{ │ }}\n"""\n`);
    const items = completionsAt(text, cursor);
    expect(items.some((i) => i.kind === "snippet" && i.label === "for-commits")).toBe(true);
  });
});

describe("hoverAt", () => {
  it("hovers a base property with its description", () => {
    const { text, cursor } = at(`body = """\n{{ ver│sion }}\n"""\n`);
    const hover = hoverAt(text, cursor);
    expect(hover?.markdown).toMatch(/version/);
    expect(hover?.markdown).toMatch(/release tag/i);
  });

  it("hovers a member path", () => {
    const { text, cursor } = at(
      `body = """\n{% for commit in commits %}{{ commit.au│thor.email }}{% endfor %}\n"""\n`,
    );
    const hover = hoverAt(text, cursor);
    expect(hover?.markdown).toMatch(/commit\.author/);
  });

  it("hovers a filter name", () => {
    const { text, cursor } = at(`body = """\n{{ x | upp│er_first }}\n"""\n`);
    const hover = hoverAt(text, cursor);
    expect(hover?.markdown).toMatch(/filter/);
    expect(hover?.markdown).toMatch(/Uppercase the first character/);
  });

  it("returns undefined outside any template", () => {
    const { text, cursor } = at(`header = "ab│c"\n`);
    expect(hoverAt(text, cursor)).toBeUndefined();
  });
});
