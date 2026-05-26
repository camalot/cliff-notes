import { describe, expect, it } from "vitest";
import { cursorContext } from "./scope.js";

/**
 * Helper: place a `|` somewhere in the text to mark the cursor, returns the
 * cursor offset and the text with the marker removed.
 */
function at(textWithMarker: string): { text: string; cursor: number } {
  const cursor = textWithMarker.indexOf("│");
  if (cursor === -1) throw new Error("missing cursor marker (use │)");
  return { text: textWithMarker.replace("│", ""), cursor };
}

describe("cursorContext", () => {
  it("returns intent=none outside any triple-string", () => {
    const { text, cursor } = at(`header = "hello│"\n`);
    expect(cursorContext(text, cursor).intent).toBe("none");
  });

  it("returns intent=none in plain triple-string text outside Tera blocks", () => {
    const { text, cursor } = at(`body = """\nhello │world\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("none");
  });

  it("recognizes a bare expression cursor", () => {
    const { text, cursor } = at(`body = """\n{{ │ }}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("tera_expression");
  });

  it("recognizes a bare statement cursor as tag_keyword", () => {
    const { text, cursor } = at(`body = """\n{% │ %}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("tag_keyword");
  });

  it("ignores comments", () => {
    const { text, cursor } = at(`body = """\n{# │comment #}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("none");
  });

  it("detects member access after a dot", () => {
    const { text, cursor } = at(`body = """\n{{ commit.│ }}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.intent).toBe("member");
    expect(ctx.path).toEqual(["commit"]);
  });

  it("detects a multi-segment member path", () => {
    const { text, cursor } = at(`body = """\n{{ commit.author.│ }}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.intent).toBe("member");
    expect(ctx.path).toEqual(["commit", "author"]);
  });

  it("detects filter completion after a pipe", () => {
    const { text, cursor } = at(`body = """\n{{ commit.message | │ }}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("filter");
  });

  it("detects filter completion with an in-progress filter name", () => {
    const { text, cursor } = at(`body = """\n{{ commit.message | upp│ }}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("filter");
  });

  it("detects test completion after `is`", () => {
    const { text, cursor } = at(`body = """\n{% if commit.body is │ %}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("test");
  });

  it("detects test completion after `is not`", () => {
    const { text, cursor } = at(`body = """\n{% if x is not │ %}\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("test");
  });

  it("detects for_iterable position", () => {
    const { text, cursor } = at(`body = """\n{% for commit in │ %}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.intent).toBe("for_iterable");
    expect(ctx.loopVar).toBe("commit");
  });

  it("binds a loop variable as element_of the iterable for the loop body", () => {
    const { text, cursor } = at(`body = """\n{% for commit in commits %}{{ commit.│ }}{% endfor %}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.intent).toBe("member");
    expect(ctx.path).toEqual(["commit"]);
    expect(ctx.bindings.find((b) => b.name === "commit")).toEqual({
      name: "commit",
      typeRef: { kind: "element_of", varName: "commits" },
    });
  });

  it("releases loop bindings after endfor", () => {
    const { text, cursor } = at(`body = """\n{% for commit in commits %}{% endfor %}{{ │ }}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.bindings.find((b) => b.name === "commit")).toBeUndefined();
  });

  it("supports `for k, v in mapping` two-variable form", () => {
    const { text, cursor } = at(`body = """\n{% for k, v in submodule_commits %}{{ k│ }}{% endfor %}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.bindings.find((b) => b.name === "k")?.typeRef).toEqual({ kind: "named", name: "string" });
    expect(ctx.bindings.find((b) => b.name === "v")?.typeRef).toEqual({
      kind: "element_of",
      varName: "submodule_commits",
    });
  });

  it("captures set bindings", () => {
    const { text, cursor } = at(`body = """\n{% set total = commits | length %}{{ total│ }}\n"""\n`);
    const ctx = cursorContext(text, cursor);
    expect(ctx.bindings.find((b) => b.name === "total")).toBeDefined();
  });

  it("inside a string is treated as plain TOML text (no completion) when there is no Tera block", () => {
    const { text, cursor } = at(`body = """\nplain │text\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("none");
  });

  it("inside a string after a Tera block has closed is plain text again", () => {
    const { text, cursor } = at(`body = """\n{{ commit.message }} and │after\n"""\n`);
    expect(cursorContext(text, cursor).intent).toBe("none");
  });
});
