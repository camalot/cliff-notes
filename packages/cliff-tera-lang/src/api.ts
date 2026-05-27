// High-level facade: given document text + cursor position, return completion
// items and hover info as plain data (editor-agnostic). The Monaco / VSCode
// adapters translate these into their respective response types.

import { detectProfiles, type ProfileId } from "./profile-detect.js";
import { cursorContext, type Binding, type CompletionIntent, type CursorContext } from "./scope.js";
import { buildRegistry, SchemaRegistry, type PropertyInfo, type TypeInfo } from "./schema-resolve.js";
import {
  teraFilters,
  teraFunctions,
  teraTags,
  teraTests,
  renderParamsMarkdown,
  type TeraParam,
} from "./builtins.js";
import { findMacro, parseMacros, type UserMacro } from "./macros.js";

import snippetsData from "../snippets/tera.snippets.json" with { type: "json" };

export type CompletionItemKind =
  | "variable"
  | "property"
  | "function"
  | "filter"
  | "test"
  | "keyword"
  | "snippet";

export interface CompletionItem {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
  /** Source profile annotation, e.g. "github". Editors may render as " (github)". */
  source?: string;
  /** For snippets, the snippet body (already in `$1`-style placeholder syntax). */
  insertText?: string;
  /** True if `insertText` uses snippet placeholder syntax. */
  insertTextIsSnippet?: boolean;
}

export interface HoverInfo {
  /** Markdown body. */
  markdown: string;
}

export interface SnippetDefinition {
  prefix: string;
  description: string;
  body: string[];
}

interface SnippetsFile {
  snippets: SnippetDefinition[];
}

const snippets = (snippetsData as SnippetsFile).snippets;

/**
 * Top-level completion API. Pass the full cliff.toml text and cursor offset.
 * Returns the completion items the editor should display, or an empty array
 * when no completion is appropriate at the cursor.
 */
export function completionsAt(text: string, cursor: number): CompletionItem[] {
  const profiles = detectProfiles(text);
  const registry = buildRegistry(profiles);
  const ctx = cursorContext(text, cursor);
  const macros = parseMacros(text);
  return completionsForContext(ctx, registry, macros);
}

export function hoverAt(text: string, cursor: number): HoverInfo | undefined {
  const profiles = detectProfiles(text);
  const registry = buildRegistry(profiles);
  const ctx = cursorContext(text, cursor);
  const macros = parseMacros(text);
  return hoverForContext(ctx, registry, macros, text, cursor);
}

export function completionsForContext(
  ctx: CursorContext,
  registry: SchemaRegistry,
  macros: readonly UserMacro[] = [],
): CompletionItem[] {
  switch (ctx.intent) {
    case "none":
      return [];
    case "filter":
      return filterCompletions();
    case "test":
      return testCompletions();
    case "tag_keyword":
      return tagCompletions();
    case "member":
      return memberCompletions(ctx, registry);
    case "for_iterable":
      return iterableCompletions(ctx, registry);
    case "tera_expression":
      return expressionCompletions(ctx, registry, macros);
  }
}

function filterCompletions(): CompletionItem[] {
  return teraFilters.map((f) => ({
    label: f.name,
    kind: "filter",
    detail: f.signature,
    documentation: composeCallableDoc(f.description, f.params, f.example),
  }));
}

function testCompletions(): CompletionItem[] {
  return teraTests.map((t) => ({
    label: t.name,
    kind: "test",
    detail: t.signature,
    documentation: composeCallableDoc(t.description, t.params),
  }));
}

function tagCompletions(): CompletionItem[] {
  return teraTags.map((t) => ({
    label: t.name,
    kind: "keyword",
    detail: t.signature,
    documentation: t.description,
  }));
}

function composeCallableDoc(
  description: string,
  params: readonly TeraParam[],
  example?: string,
): string {
  const parts: string[] = [description];
  const table = renderParamsMarkdown(params);
  if (table) parts.push("", table);
  if (example) parts.push("", `Example: \`${example}\``);
  return parts.join("\n");
}

function memberCompletions(ctx: CursorContext, registry: SchemaRegistry): CompletionItem[] {
  if (!ctx.path || ctx.path.length === 0) return [];
  const [head, ...rest] = ctx.path as [string, ...string[]];
  const headType = resolveHeadType(head, ctx.bindings, registry);
  if (!headType) return [];
  const target = registry.walkPath(headType, rest);
  if (!target) return [];
  return [...target.properties.values()].map(propertyToItem);
}

function iterableCompletions(ctx: CursorContext, registry: SchemaRegistry): CompletionItem[] {
  // After `for X in `, suggest iterable values in scope (arrays/maps from the root type plus bindings).
  const out: CompletionItem[] = [];
  for (const [name, prop] of registry.rootType().properties) {
    if (prop.type.primitive === "array" || prop.type.valueType) {
      out.push({
        label: name,
        kind: "variable",
        detail: typeLabel(prop.type),
        documentation: prop.description,
        source: prop.source,
      });
    }
  }
  for (const b of ctx.bindings) {
    const t = resolveBinding(b, registry);
    if (t && (t.primitive === "array" || t.valueType)) {
      out.push({ label: b.name, kind: "variable", detail: typeLabel(t) });
    }
  }
  return out;
}

function expressionCompletions(
  ctx: CursorContext,
  registry: SchemaRegistry,
  macros: readonly UserMacro[],
): CompletionItem[] {
  const out: CompletionItem[] = [];
  // Variables from the root type.
  for (const [name, prop] of registry.rootType().properties) {
    out.push({
      label: name,
      kind: "variable",
      detail: typeLabel(prop.type),
      documentation: prop.description,
      source: prop.source,
    });
  }
  // Locally-bound variables.
  for (const b of ctx.bindings) {
    const t = resolveBinding(b, registry);
    out.push({
      label: b.name,
      kind: "variable",
      detail: t ? typeLabel(t) : "any",
    });
  }
  // Functions (range, now, throw, get_random, get_env).
  for (const f of teraFunctions) {
    out.push({
      label: f.name,
      kind: "function",
      detail: f.signature,
      documentation: composeCallableDoc(f.description, f.params),
    });
  }
  // User-defined macros — call as `self::name(...)`.
  for (const m of macros) {
    const sig = macroSignature(m);
    out.push({
      label: m.name,
      kind: "function",
      detail: sig,
      documentation: composeCallableDoc(`User-defined macro \`${m.name}\`.`, m.params),
      insertText: `self::${m.name}()`,
    });
  }
  // Snippets.
  for (const s of snippets) {
    out.push({
      label: s.prefix,
      kind: "snippet",
      detail: "snippet",
      documentation: s.description,
      insertText: s.body.join("\n"),
      insertTextIsSnippet: true,
    });
  }
  return out;
}

function macroSignature(m: UserMacro): string {
  const args = m.params
    .map((p) => (p.default !== undefined ? `${p.name}=${p.default}` : p.name))
    .join(", ");
  return `${m.name}(${args})`;
}

function resolveHeadType(
  name: string,
  bindings: readonly Binding[],
  registry: SchemaRegistry,
): TypeInfo | undefined {
  for (const b of bindings) {
    if (b.name === name) return resolveBinding(b, registry);
  }
  const rootProp = registry.rootType().properties.get(name);
  return rootProp?.type;
}

function resolveBinding(b: Binding, registry: SchemaRegistry): TypeInfo | undefined {
  return registry.resolveTypeRef(b.typeRef);
}

function propertyToItem(prop: PropertyInfo): CompletionItem {
  return {
    label: prop.name,
    kind: "property",
    detail: typeLabel(prop.type),
    documentation: prop.description,
    source: prop.source,
  };
}

function typeLabel(t: TypeInfo): string {
  if (t.name) {
    if (t.primitive === "array" && t.itemType?.name) return `${t.itemType.name}[]`;
    return t.name;
  }
  if (t.primitive === "array") {
    return t.itemType ? `${typeLabel(t.itemType)}[]` : "array";
  }
  return t.primitive ?? "any";
}

// ---------- Hover ---------------------------------------------------------

function hoverForContext(
  ctx: CursorContext,
  registry: SchemaRegistry,
  macros: readonly UserMacro[],
  text: string,
  cursor: number,
): HoverInfo | undefined {
  if (ctx.intent === "none") return undefined;
  const word = wordAt(text, cursor);
  if (!word) return undefined;

  // Member-path hover: walk the full path including the word at cursor.
  const fullPath = pathAt(text, cursor);
  if (fullPath && fullPath.length > 0) {
    const [head, ...rest] = fullPath as [string, ...string[]];
    const headType = resolveHeadType(head, ctx.bindings, registry);
    if (headType) {
      const final = registry.walkPath(headType, rest);
      if (final) return { markdown: renderTypeMarkdown(fullPath.join("."), final) };
    }
  }

  // Filter / function / test / tag / macro hover.
  const filter = teraFilters.find((f) => f.name === word);
  if (filter) {
    return {
      markdown: renderCallableMarkdown(filter.signature, "filter", filter.description, filter.params, filter.example),
    };
  }
  const fn = teraFunctions.find((f) => f.name === word);
  if (fn) {
    return { markdown: renderCallableMarkdown(fn.signature, "function", fn.description, fn.params) };
  }
  const test = teraTests.find((t) => t.name === word);
  if (test) {
    return { markdown: renderCallableMarkdown(test.signature, "test", test.description, test.params) };
  }
  const tag = teraTags.find((t) => t.name === word);
  if (tag) {
    return { markdown: `**${tag.signature}** _(tag)_\n\n${tag.description}` };
  }
  const macro = findMacro(macros, word);
  if (macro) {
    return {
      markdown: renderCallableMarkdown(
        macroSignature(macro),
        "macro",
        `User-defined macro \`${macro.name}\`.`,
        macro.params,
      ),
    };
  }

  return undefined;
}

function renderCallableMarkdown(
  signature: string,
  kind: string,
  description: string,
  params: readonly TeraParam[],
  example?: string,
): string {
  const lines: string[] = [`**${signature}** _(${kind})_`, "", description];
  const table = renderParamsMarkdown(params);
  if (table) lines.push("", table);
  if (example) lines.push("", `Example: \`${example}\``);
  return lines.join("\n");
}

function renderTypeMarkdown(path: string, t: TypeInfo): string {
  const lines: string[] = [];
  lines.push(`**${path}** : \`${typeLabel(t)}\``);
  if (t.source) lines.push(`*from profile: \`${t.source}\`*`);
  if (t.description) lines.push("", t.description);
  if (t.example) lines.push("", `Example: \`${t.example}\``);
  return lines.join("\n");
}

const IDENT_CHAR = /[A-Za-z0-9_]/;

function wordAt(text: string, cursor: number): string | undefined {
  let start = cursor;
  while (start > 0 && IDENT_CHAR.test(text[start - 1]!)) start--;
  let end = cursor;
  while (end < text.length && IDENT_CHAR.test(text[end]!)) end++;
  if (start === end) return undefined;
  return text.slice(start, end);
}

function pathAt(text: string, cursor: number): string[] | undefined {
  // Walk backward through `<ident>(.<ident>)*` and forward through the trailing ident.
  let end = cursor;
  while (end < text.length && IDENT_CHAR.test(text[end]!)) end++;
  let start = end;
  while (start > 0) {
    const ch = text[start - 1]!;
    if (IDENT_CHAR.test(ch) || ch === ".") {
      start--;
      continue;
    }
    break;
  }
  if (start === end) return undefined;
  const segs = text.slice(start, end).split(".");
  if (segs.some((s) => s.length === 0)) return undefined;
  return segs;
}

// ---------- Signature help -----------------------------------------------

export type SignatureCallableKind = "filter" | "function" | "test" | "macro";

export interface SignatureHelpInfo {
  /** Display signature, e.g. `truncate(length=255, end="…")`. */
  signature: string;
  /** What kind of callable this is. */
  kind: SignatureCallableKind;
  description: string;
  params: TeraParam[];
  /** 0-based index of the parameter the cursor is currently positioned in. */
  activeParameter: number;
}

export function signatureHelpAt(text: string, cursor: number): SignatureHelpInfo | undefined {
  const ctx = cursorContext(text, cursor);
  if (ctx.intent === "none") return undefined;
  const call = locateEnclosingCall(text, cursor);
  if (!call) return undefined;
  const macros = parseMacros(text);
  return resolveCallable(call, macros);
}

interface CallSite {
  /** Identifier of the callee (e.g. `truncate`, `self::user_url`). */
  name: string;
  /** "self::" prefix for user macros. */
  prefix: "self" | "namespaced" | null;
  /** Character immediately preceding the identifier (e.g. `|` for filter, ` ` for function). */
  precedingContext: "pipe" | "is" | "is_not" | "self_macro" | "function" | "namespaced" | "unknown";
  activeParameter: number;
}

const IDENT = /[A-Za-z0-9_]/;

function locateEnclosingCall(text: string, cursor: number): CallSite | undefined {
  // Walk backward from cursor, looking for an open `(` that isn't yet closed.
  let depth = 0;
  let inStr: '"' | "'" | null = null;
  let i = cursor - 1;
  let activeParameter = 0;
  while (i >= 0) {
    const ch = text[i]!;
    if (inStr) {
      // We're walking backward so detect the OPEN quote.
      if (ch === inStr && text[i - 1] !== "\\") inStr = null;
      i--;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      i--;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth++;
      i--;
      continue;
    }
    if (ch === "[" || ch === "{") {
      if (depth === 0) return undefined;
      depth--;
      i--;
      continue;
    }
    if (ch === "(") {
      if (depth === 0) {
        // Found the enclosing open paren.
        const callee = readCalleeBefore(text, i);
        if (!callee) return undefined;
        return { ...callee, activeParameter };
      }
      depth--;
      i--;
      continue;
    }
    if (ch === "," && depth === 0) {
      activeParameter++;
    }
    // Stop walking if we've left the Tera block.
    if (ch === "{" || ch === "}" || ch === "%" || ch === "#") {
      // Approximate: if the surrounding 2-char sequence is a Tera delimiter, abandon.
      const pair = text.slice(Math.max(0, i - 1), i + 1);
      if (pair === "{{" || pair === "{%" || pair === "{#" || pair === "}}" || pair === "%}" || pair === "#}") {
        return undefined;
      }
    }
    i--;
  }
  return undefined;
}

function readCalleeBefore(
  text: string,
  parenIdx: number,
): { name: string; prefix: CallSite["prefix"]; precedingContext: CallSite["precedingContext"] } | undefined {
  // Skip any whitespace immediately before the `(`.
  let i = parenIdx - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;
  const end = i + 1;
  if (i < 0 || !IDENT.test(text[i]!)) return undefined;
  while (i >= 0 && IDENT.test(text[i]!)) i--;
  const name = text.slice(i + 1, end);

  // Check what precedes the identifier.
  let j = i;
  // Detect `self::` prefix.
  if (j >= 1 && text[j] === ":" && text[j - 1] === ":") {
    // backtrack over `::self`
    let k = j - 2;
    while (k >= 0 && IDENT.test(text[k]!)) k--;
    const prefixName = text.slice(k + 1, j - 1);
    if (prefixName === "self") {
      return { name, prefix: "self", precedingContext: "self_macro" };
    }
    return { name, prefix: "namespaced", precedingContext: "namespaced" };
  }
  // Detect dotted namespace prefix `ns.macro(`.
  if (j >= 0 && text[j] === ".") {
    return { name, prefix: "namespaced", precedingContext: "namespaced" };
  }
  // Skip whitespace and look for `|` or `is`.
  while (j >= 0 && /\s/.test(text[j]!)) j--;
  if (j >= 0 && text[j] === "|") {
    return { name, prefix: null, precedingContext: "pipe" };
  }
  // Detect `is` / `is not`.
  if (j >= 1) {
    const tail = text.slice(0, j + 1);
    const isMatch = tail.match(/\bis(\s+not)?\s*$/);
    if (isMatch) {
      return { name, prefix: null, precedingContext: isMatch[1] ? "is_not" : "is" };
    }
  }
  return { name, prefix: null, precedingContext: "function" };
}

function resolveCallable(call: CallSite, macros: readonly UserMacro[]): SignatureHelpInfo | undefined {
  if (call.precedingContext === "pipe") {
    const f = teraFilters.find((x) => x.name === call.name);
    if (!f) return undefined;
    return {
      signature: f.signature,
      kind: "filter",
      description: f.description,
      params: f.params,
      activeParameter: clampParam(call.activeParameter, f.params),
    };
  }
  if (call.precedingContext === "is" || call.precedingContext === "is_not") {
    const t = teraTests.find((x) => x.name === call.name);
    if (!t) return undefined;
    return {
      signature: t.signature,
      kind: "test",
      description: t.description,
      params: t.params,
      activeParameter: clampParam(call.activeParameter, t.params),
    };
  }
  if (call.precedingContext === "self_macro" || call.precedingContext === "namespaced") {
    const m = findMacro(macros, call.name);
    if (!m) return undefined;
    return {
      signature: macroSignature(m),
      kind: "macro",
      description: `User-defined macro \`${m.name}\`.`,
      params: m.params,
      activeParameter: clampParam(call.activeParameter, m.params),
    };
  }
  // Bare function call: could be a Tera built-in function or a bare macro reference.
  const fn = teraFunctions.find((x) => x.name === call.name);
  if (fn) {
    return {
      signature: fn.signature,
      kind: "function",
      description: fn.description,
      params: fn.params,
      activeParameter: clampParam(call.activeParameter, fn.params),
    };
  }
  const m = findMacro(macros, call.name);
  if (m) {
    return {
      signature: macroSignature(m),
      kind: "macro",
      description: `User-defined macro \`${m.name}\`.`,
      params: m.params,
      activeParameter: clampParam(call.activeParameter, m.params),
    };
  }
  return undefined;
}

function clampParam(idx: number, params: readonly TeraParam[]): number {
  if (params.length === 0) return 0;
  return Math.max(0, Math.min(idx, params.length - 1));
}

export type { ProfileId, CompletionIntent };
