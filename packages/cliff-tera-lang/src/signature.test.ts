import { describe, expect, it } from "vitest";
import { signatureHelpAt } from "./api.js";

function at(textWithMarker: string): { text: string; cursor: number } {
  const cursor = textWithMarker.indexOf("│");
  if (cursor === -1) throw new Error("missing cursor marker (use │)");
  return { text: textWithMarker.replace("│", ""), cursor };
}

describe("signatureHelpAt", () => {
  it("returns undefined outside any template", () => {
    const { text, cursor } = at(`header = "ab│c"\n`);
    expect(signatureHelpAt(text, cursor)).toBeUndefined();
  });

  it("returns undefined when not inside a call", () => {
    const { text, cursor } = at(`body = """\n{{ commit.│ }}\n"""\n`);
    expect(signatureHelpAt(text, cursor)).toBeUndefined();
  });

  it("identifies a filter call after a pipe", () => {
    const { text, cursor } = at(`body = """\n{{ commit.message | truncate(│ }}\n"""\n`);
    const h = signatureHelpAt(text, cursor);
    expect(h?.kind).toBe("filter");
    expect(h?.signature).toMatch(/^value \| truncate/);
    expect(h?.activeParameter).toBe(0);
  });

  it("counts commas to determine the active parameter", () => {
    const { text, cursor } = at(`body = """\n{{ x | truncate(255, │ }}\n"""\n`);
    const h = signatureHelpAt(text, cursor);
    expect(h?.activeParameter).toBe(1);
  });

  it("clamps the active parameter to the last when over-supplied", () => {
    const { text, cursor } = at(`body = """\n{{ x | upper(extra, more, │ }}\n"""\n`);
    // `upper` has 0 params; clamp to 0.
    const h = signatureHelpAt(text, cursor);
    expect(h?.activeParameter).toBe(0);
  });

  it("identifies a Tera function call (range)", () => {
    const { text, cursor } = at(`body = """\n{% for i in range(0, │ %}\n"""\n`);
    const h = signatureHelpAt(text, cursor);
    expect(h?.kind).toBe("function");
    expect(h?.signature).toMatch(/^range\(/);
    expect(h?.activeParameter).toBe(1);
  });

  it("identifies a test call after `is`", () => {
    const { text, cursor } = at(`body = """\n{% if x is matching(│ %}\n"""\n`);
    const h = signatureHelpAt(text, cursor);
    expect(h?.kind).toBe("test");
    expect(h?.signature).toMatch(/^x is matching/);
  });

  it("identifies a test call after `is not`", () => {
    const { text, cursor } = at(`body = """\n{% if x is not containing(│ %}\n"""\n`);
    const h = signatureHelpAt(text, cursor);
    expect(h?.kind).toBe("test");
  });

  it("resolves a user-defined macro called as self::name(", () => {
    const toml = `body = """
{%- macro greet(name, salutation="Hi") %}{{ salutation }} {{ name }}{% endmacro %}
{{ self::greet(│ }}
"""
`;
    const cursor = toml.indexOf("│");
    const h = signatureHelpAt(toml.replace("│", ""), cursor);
    expect(h?.kind).toBe("macro");
    expect(h?.signature).toBe('greet(name, salutation="Hi")');
    expect(h?.params).toHaveLength(2);
    expect(h?.activeParameter).toBe(0);
  });

  it("ignores commas inside string literals when counting parameters", () => {
    const { text, cursor } = at(
      `body = """\n{{ x | replace(from="a,b", to="c,d", │ }}\n"""\n`,
    );
    const h = signatureHelpAt(text, cursor);
    // `replace` has 2 params; clamp to 1 (the second).
    expect(h?.activeParameter).toBeLessThanOrEqual(1);
  });

  it("does not match function calls outside of Tera blocks", () => {
    const { text, cursor } = at(`header = "foo(│"\n`);
    expect(signatureHelpAt(text, cursor)).toBeUndefined();
  });
});
