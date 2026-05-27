import { describe, expect, it } from "vitest";
import { findMacro, parseMacros } from "./macros.js";

describe("parseMacros", () => {
  it("returns [] for empty input", () => {
    expect(parseMacros("")).toEqual([]);
  });

  it("extracts a macro with no parameters", () => {
    const macros = parseMacros(`body = """{% macro hello() %}hi{% endmacro %}"""`);
    expect(macros).toHaveLength(1);
    expect(macros[0]).toMatchObject({ name: "hello", params: [] });
  });

  it("extracts a macro with required parameters", () => {
    const macros = parseMacros(`{% macro greet(name, salutation) %}…{% endmacro %}`);
    expect(macros[0]?.params).toEqual([
      { name: "name", required: true },
      { name: "salutation", required: true },
    ]);
  });

  it("extracts a macro with default values", () => {
    const macros = parseMacros(`{% macro user_url(name, prefix="@") %}…{% endmacro %}`);
    expect(macros[0]?.params).toEqual([
      { name: "name", required: true },
      { name: "prefix", required: false, default: '"@"' },
    ]);
  });

  it("supports dash-trimmed delimiters", () => {
    const macros = parseMacros(`{%- macro x(a, b=1) -%}…{%- endmacro -%}`);
    expect(macros[0]?.params).toEqual([
      { name: "a", required: true },
      { name: "b", required: false, default: "1" },
    ]);
  });

  it("extracts multiple macros from the same document", () => {
    const text = `{% macro a() %}{% endmacro %}\n{% macro b(x) %}{% endmacro %}\n{% macro c(x=1, y=2) %}{% endmacro %}`;
    const macros = parseMacros(text);
    expect(macros.map((m) => m.name)).toEqual(["a", "b", "c"]);
    expect(macros[2]?.params).toHaveLength(2);
  });

  it("tolerates malformed declarations (skips them)", () => {
    const text = `{% macro 123(x) %}{% endmacro %}\n{% macro ok() %}{% endmacro %}`;
    const macros = parseMacros(text);
    expect(macros.map((m) => m.name)).toEqual(["ok"]);
  });

  it("findMacro returns the matching macro or undefined", () => {
    const macros = parseMacros(`{% macro hi() %}{% endmacro %}`);
    expect(findMacro(macros, "hi")?.name).toBe("hi");
    expect(findMacro(macros, "bye")).toBeUndefined();
  });

  it("handles defaults that contain commas in quotes (regression guard)", () => {
    const macros = parseMacros(`{% macro pair(label, joiner=", ") %}{% endmacro %}`);
    expect(macros[0]?.params).toEqual([
      { name: "label", required: true },
      { name: "joiner", required: false, default: '", "' },
    ]);
  });

  it("records the character offset of each macro definition", () => {
    const text = `prefix\n{% macro first() %}{% endmacro %}\n{% macro second() %}{% endmacro %}`;
    const macros = parseMacros(text);
    expect(macros[0]?.offset).toBe(text.indexOf("{% macro first"));
    expect(macros[1]?.offset).toBe(text.indexOf("{% macro second"));
  });
});
