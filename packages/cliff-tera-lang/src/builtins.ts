import builtinsData from "../data/tera-builtins.json" with { type: "json" };

export interface TeraParam {
  name: string;
  /** TS-ish type ("string", "integer", "boolean", "any", ...). */
  type?: string;
  /** Literal default value, already quoted/formatted as it would appear in source (e.g. `"\"…\""`, `"255"`, `"false"`). */
  default?: string;
  /** True if the parameter must be supplied. Defaults to false when `default` is present, true otherwise. */
  required?: boolean;
}

export interface TeraTag {
  name: string;
  signature: string;
  description: string;
  url?: string;
}

export interface TeraFilter {
  name: string;
  description: string;
  params: TeraParam[];
  example?: string;
  /** Pre-computed display signature like `value | truncate(length=255, end="…")`. */
  signature: string;
}

export interface TeraFunction {
  name: string;
  description: string;
  params: TeraParam[];
  /** Pre-computed display signature like `range(start=0, end, step_by=1)`. */
  signature: string;
}

export interface TeraTest {
  name: string;
  description: string;
  params: TeraParam[];
  /** Pre-computed display signature like `x is matching(pattern)`. */
  signature: string;
}

interface RawParam {
  name: string;
  type?: string;
  default?: string;
  required?: boolean;
}

interface RawFilter {
  name: string;
  description: string;
  params: RawParam[];
  example?: string;
}

interface RawFunction {
  name: string;
  description: string;
  params: RawParam[];
}

interface RawTest {
  name: string;
  description: string;
  params: RawParam[];
}

interface BuiltinsData {
  tags: TeraTag[];
  filters: RawFilter[];
  functions: RawFunction[];
  tests: RawTest[];
}

const data = builtinsData as BuiltinsData;

function paramFragment(p: TeraParam): string {
  if (p.default !== undefined) return `${p.name}=${p.default}`;
  return p.name;
}

function filterSignature(f: RawFilter): string {
  const args = f.params.map(paramFragment).join(", ");
  return args ? `value | ${f.name}(${args})` : `value | ${f.name}`;
}

function functionSignature(f: RawFunction): string {
  return `${f.name}(${f.params.map(paramFragment).join(", ")})`;
}

function testSignature(t: RawTest): string {
  const args = t.params.map(paramFragment).join(", ");
  return args ? `x is ${t.name}(${args})` : `x is ${t.name}`;
}

export const teraTags: readonly TeraTag[] = data.tags;
export const teraFilters: readonly TeraFilter[] = data.filters.map((f) => ({
  ...f,
  signature: filterSignature(f),
}));
export const teraFunctions: readonly TeraFunction[] = data.functions.map((f) => ({
  ...f,
  signature: functionSignature(f),
}));
export const teraTests: readonly TeraTest[] = data.tests.map((t) => ({
  ...t,
  signature: testSignature(t),
}));

export function findFilter(name: string): TeraFilter | undefined {
  return teraFilters.find((f) => f.name === name);
}

export function findFunction(name: string): TeraFunction | undefined {
  return teraFunctions.find((f) => f.name === name);
}

export function findTest(name: string): TeraTest | undefined {
  return teraTests.find((t) => t.name === name);
}

export function findTag(name: string): TeraTag | undefined {
  return data.tags.find((t) => t.name === name);
}

/** Render a parameter list as a markdown table (for hover/completion docs). */
export function renderParamsMarkdown(params: readonly TeraParam[]): string {
  if (params.length === 0) return "";
  const lines: string[] = [];
  lines.push("| Param | Type | Default |");
  lines.push("|---|---|---|");
  for (const p of params) {
    const dflt = p.default !== undefined ? `\`${p.default}\`` : p.required === false ? "_optional_" : "**required**";
    lines.push(`| \`${p.name}\` | ${p.type ?? "any"} | ${dflt} |`);
  }
  return lines.join("\n");
}
