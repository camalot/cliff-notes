import builtinsData from "../data/tera-builtins.json" with { type: "json" };

export interface TeraTag {
  name: string;
  signature: string;
  description: string;
  url?: string;
}

export interface TeraFilter {
  name: string;
  signature: string;
  description: string;
  example?: string;
}

export interface TeraFunction {
  name: string;
  signature: string;
  description: string;
}

export interface TeraTest {
  name: string;
  signature: string;
  description: string;
}

interface BuiltinsData {
  tags: TeraTag[];
  filters: TeraFilter[];
  functions: TeraFunction[];
  tests: TeraTest[];
}

const data = builtinsData as BuiltinsData;

export const teraTags: readonly TeraTag[] = data.tags;
export const teraFilters: readonly TeraFilter[] = data.filters;
export const teraFunctions: readonly TeraFunction[] = data.functions;
export const teraTests: readonly TeraTest[] = data.tests;

export function findFilter(name: string): TeraFilter | undefined {
  return data.filters.find((f) => f.name === name);
}

export function findFunction(name: string): TeraFunction | undefined {
  return data.functions.find((f) => f.name === name);
}

export function findTest(name: string): TeraTest | undefined {
  return data.tests.find((t) => t.name === name);
}

export function findTag(name: string): TeraTag | undefined {
  return data.tags.find((t) => t.name === name);
}
