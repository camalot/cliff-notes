// High-level facade: given document text + cursor position, return completion
// items and hover info as plain data (editor-agnostic). The Monaco / VSCode
// adapters translate these into their respective response types.

import { detectProfiles, type ProfileId } from "./profile-detect.js";
import { cursorContext, type Binding, type CompletionIntent, type CursorContext } from "./scope.js";
import { buildRegistry, SchemaRegistry, type PropertyInfo, type TypeInfo } from "./schema-resolve.js";
import { teraFilters, teraFunctions, teraTags, teraTests } from "./builtins.js";

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
  return completionsForContext(ctx, registry);
}

export function hoverAt(text: string, cursor: number): HoverInfo | undefined {
  const profiles = detectProfiles(text);
  const registry = buildRegistry(profiles);
  const ctx = cursorContext(text, cursor);
  return hoverForContext(ctx, registry, text, cursor);
}

export function completionsForContext(ctx: CursorContext, registry: SchemaRegistry): CompletionItem[] {
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
      return expressionCompletions(ctx, registry);
  }
}

function filterCompletions(): CompletionItem[] {
  return teraFilters.map((f) => ({
    label: f.name,
    kind: "filter",
    detail: f.signature,
    documentation: f.example ? `${f.description}\n\nExample: \`${f.example}\`` : f.description,
  }));
}

function testCompletions(): CompletionItem[] {
  return teraTests.map((t) => ({
    label: t.name,
    kind: "test",
    detail: t.signature,
    documentation: t.description,
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

function expressionCompletions(ctx: CursorContext, registry: SchemaRegistry): CompletionItem[] {
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
      documentation: f.description,
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

  // Filter / function / test / tag hover.
  const filter = teraFilters.find((f) => f.name === word);
  if (filter) {
    return {
      markdown: [
        `**${filter.signature}** _(filter)_`,
        "",
        filter.description,
        filter.example ? `\nExample: \`${filter.example}\`` : "",
      ].join("\n"),
    };
  }
  const fn = teraFunctions.find((f) => f.name === word);
  if (fn) {
    return { markdown: `**${fn.signature}** _(function)_\n\n${fn.description}` };
  }
  const test = teraTests.find((t) => t.name === word);
  if (test) {
    return { markdown: `**${test.signature}** _(test)_\n\n${test.description}` };
  }
  const tag = teraTags.find((t) => t.name === word);
  if (tag) {
    return { markdown: `**${tag.signature}** _(tag)_\n\n${tag.description}` };
  }

  return undefined;
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

export type { ProfileId, CompletionIntent };
