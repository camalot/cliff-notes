// Parse user-defined macro signatures out of a cliff.toml document.
//
// We only need declaration headers — `{% macro name(arg1, arg2=default) %}`.
// Each call site provides signature help (parameters + defaults) without
// rendering the macro body.
//
// The parser is tolerant: it ignores malformed declarations rather than
// throwing, since the user is mid-edit while completion is active.

import type { TeraParam } from "./builtins.js";

export interface UserMacro {
  name: string;
  params: TeraParam[];
  /** Character offset where the `{% macro` keyword begins. */
  offset: number;
}

const MACRO_DECL = /\{%-?\s*macro\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;

export function parseMacros(text: string): UserMacro[] {
  if (!text) return [];
  const out: UserMacro[] = [];
  let m: RegExpExecArray | null;
  MACRO_DECL.lastIndex = 0;
  while ((m = MACRO_DECL.exec(text)) !== null) {
    const name = m[1]!;
    const argsRaw = m[2] ?? "";
    out.push({
      name,
      params: parseParamList(argsRaw),
      offset: m.index,
    });
  }
  return out;
}

function parseParamList(args: string): TeraParam[] {
  const trimmed = args.trim();
  if (!trimmed) return [];
  // Naive split on commas at depth zero. Macro defaults are simple literals
  // in practice; commas inside quotes within defaults are unusual.
  const parts = splitTopLevel(trimmed, ",");
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map<TeraParam | null>((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) return null;
        return { name: part, required: true };
      }
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
      return { name, default: value, required: false };
    })
    .filter((p): p is TeraParam => p !== null);
}

/**
 * Split a string on `sep`, but only at depth zero — ignore separators inside
 * `()`, `[]`, `{}`, or string literals.
 */
function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr: '"' | "'" | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

export function findMacro(macros: readonly UserMacro[], name: string): UserMacro | undefined {
  return macros.find((m) => m.name === name);
}
