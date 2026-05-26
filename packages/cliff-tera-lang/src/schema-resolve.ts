import baseSchema from "../schemas/context.base.schema.json" with { type: "json" };
import conventionalSchema from "../schemas/context.conventional.schema.json" with { type: "json" };
import githubSchema from "../schemas/context.github.schema.json" with { type: "json" };
import gitlabSchema from "../schemas/context.gitlab.schema.json" with { type: "json" };
import giteaSchema from "../schemas/context.gitea.schema.json" with { type: "json" };
import bitbucketSchema from "../schemas/context.bitbucket.schema.json" with { type: "json" };
import azureSchema from "../schemas/context.azure_devops.schema.json" with { type: "json" };
import submoduleSchema from "../schemas/context.submodule.schema.json" with { type: "json" };

import type { ProfileId } from "./profile-detect.js";
import type { TypeRef } from "./scope.js";

type RawSchema = Record<string, unknown>;

const PROFILE_SCHEMAS: Record<ProfileId, RawSchema> = {
  base: baseSchema as RawSchema,
  conventional: conventionalSchema as RawSchema,
  github: githubSchema as RawSchema,
  gitlab: gitlabSchema as RawSchema,
  gitea: giteaSchema as RawSchema,
  bitbucket: bitbucketSchema as RawSchema,
  azure_devops: azureSchema as RawSchema,
  submodule: submoduleSchema as RawSchema,
};

export interface PropertyInfo {
  name: string;
  type: TypeInfo;
  description?: string;
  example?: string;
  source?: string;
}

export interface TypeInfo {
  /** Named-type key when this TypeInfo is registered by name. */
  name?: string;
  /** TOML/JSON primitive ("string", "integer", etc.) or "object"/"array" for composites. */
  primitive?: string;
  /** Properties of an object type, keyed by property name. */
  properties: Map<string, PropertyInfo>;
  /** Element type for an array type. */
  itemType?: TypeInfo;
  /** Value type for a map (object with `additionalProperties`). */
  valueType?: TypeInfo;
  description?: string;
  example?: string;
  source?: string;
}

const ROOT_TYPE_NAME = "Release";

export class SchemaRegistry {
  private types = new Map<string, TypeInfo>();
  /** Anonymous (inline) types resolved on demand — not added to the type map. */
  private rootName: string = ROOT_TYPE_NAME;

  constructor(profiles: Iterable<ProfileId>) {
    // Order matters: base + conventional first so they establish canonical
    // property descriptions; remote profiles overlay onto them.
    const ordered = orderProfiles(profiles);
    for (const profile of ordered) {
      this.applyProfile(PROFILE_SCHEMAS[profile]);
    }
  }

  rootType(): TypeInfo {
    return this.getOrCreate(this.rootName);
  }

  typeByName(name: string): TypeInfo | undefined {
    return this.types.get(name);
  }

  /**
   * Resolve a TypeRef coming from scope.ts.
   * `named` → look up by name in the registry.
   * `element_of` → parse the varName expression, walk root → ... → array, return its itemType.
   */
  resolveTypeRef(ref: TypeRef): TypeInfo | undefined {
    if (ref.kind === "named") {
      return this.types.get(ref.name);
    }
    // element_of an expression — walk only simple dotted paths.
    const head = extractExpressionHead(ref.varName);
    if (!head) return undefined;
    const start = this.rootType();
    const found = this.walkPath(start, head);
    if (!found) return undefined;
    if (found.itemType) return found.itemType;
    if (found.valueType) return found.valueType;
    return undefined;
  }

  /**
   * Walk a property path from a starting type. Returns the final TypeInfo, or
   * undefined if any segment is unresolvable.
   */
  walkPath(start: TypeInfo, path: readonly string[]): TypeInfo | undefined {
    let current: TypeInfo | undefined = start;
    for (const seg of path) {
      if (!current) return undefined;
      const prop = current.properties.get(seg);
      if (prop) {
        current = prop.type;
        continue;
      }
      return undefined;
    }
    return current;
  }

  private applyProfile(schema: RawSchema): void {
    const rootName = schema["x-tera-root"];
    if (typeof rootName === "string") this.rootName = rootName;
    const contributes = schema["x-tera-contributes"] as Record<string, Record<string, RawSchema>> | undefined;
    if (!contributes) return;

    for (const [typeName, props] of Object.entries(contributes)) {
      const typeInfo = this.getOrCreate(typeName);
      for (const [propName, propSchema] of Object.entries(props)) {
        const resolved = this.resolveSchema(propSchema, schema);
        const propInfo: PropertyInfo = {
          name: propName,
          type: resolved,
          description: resolved.description,
          example: resolved.example,
          source: resolved.source,
        };
        // Last-wins for description/source. For object types, merge nested properties.
        const existing = typeInfo.properties.get(propName);
        if (existing && existing.type.primitive === "object" && resolved.primitive === "object") {
          mergeObjectInto(existing.type, resolved);
          if (resolved.description) existing.description = resolved.description;
          if (resolved.source) existing.source = resolved.source;
        } else {
          typeInfo.properties.set(propName, propInfo);
        }
      }
    }
  }

  private getOrCreate(name: string): TypeInfo {
    let t = this.types.get(name);
    if (!t) {
      t = { name, primitive: "object", properties: new Map() };
      this.types.set(name, t);
    }
    return t;
  }

  private resolveSchema(schema: RawSchema, container: RawSchema): TypeInfo {
    // Resolve local $ref into the container's namespace.
    const ref = schema["$ref"];
    if (typeof ref === "string") {
      const resolved = followRef(ref, container);
      if (resolved) return this.resolveSchema(resolved, container);
    }

    // Named-type cross-reference (used inside `items` to point at registered types).
    const xType = schema["x-tera-type"];
    if (typeof xType === "string") return this.getOrCreate(xType);

    const info: TypeInfo = {
      properties: new Map(),
      description: typeof schema["description"] === "string" ? (schema["description"] as string) : undefined,
      example: typeof schema["x-tera-example"] === "string" ? (schema["x-tera-example"] as string) : undefined,
      source: typeof schema["x-tera-source"] === "string" ? (schema["x-tera-source"] as string) : undefined,
    };

    const type = schema["type"];
    if (Array.isArray(type)) {
      info.primitive = type.filter((t): t is string => typeof t === "string" && t !== "null").join("|") || "any";
    } else if (typeof type === "string") {
      info.primitive = type;
    } else {
      info.primitive = "any";
    }

    if (info.primitive === "object") {
      const props = schema["properties"] as Record<string, RawSchema> | undefined;
      if (props) {
        for (const [k, v] of Object.entries(props)) {
          const propType = this.resolveSchema(v, container);
          info.properties.set(k, {
            name: k,
            type: propType,
            description: propType.description,
            example: propType.example,
            source: propType.source,
          });
        }
      }
      const addl = schema["additionalProperties"];
      if (addl && typeof addl === "object" && !Array.isArray(addl)) {
        info.valueType = this.resolveSchema(addl as RawSchema, container);
      }
    }

    if (info.primitive === "array") {
      const items = schema["items"];
      if (items && typeof items === "object" && !Array.isArray(items)) {
        info.itemType = this.resolveSchema(items as RawSchema, container);
      }
    }

    return info;
  }
}

function mergeObjectInto(target: TypeInfo, source: TypeInfo): void {
  for (const [k, v] of source.properties) {
    if (!target.properties.has(k)) {
      target.properties.set(k, v);
    }
  }
}

function followRef(ref: string, container: RawSchema): RawSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/").map(decodeURIComponent);
  let cur: unknown = container;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur as RawSchema;
}

/**
 * Extract the simple dotted identifier path at the head of a Tera expression.
 * Stops at the first non-identifier-non-dot character (whitespace, `|`, `(`, etc.).
 * Returns null if the head isn't a plain identifier path.
 */
function extractExpressionHead(expr: string): string[] | null {
  const trimmed = expr.trim();
  const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)/);
  if (!m) return null;
  return m[1]!.split(".");
}

const PROFILE_ORDER: ProfileId[] = [
  "base",
  "conventional",
  "submodule",
  "github",
  "gitlab",
  "gitea",
  "bitbucket",
  "azure_devops",
];

function orderProfiles(profiles: Iterable<ProfileId>): ProfileId[] {
  const set = new Set(profiles);
  return PROFILE_ORDER.filter((p) => set.has(p));
}

export function buildRegistry(profiles: Iterable<ProfileId>): SchemaRegistry {
  return new SchemaRegistry(profiles);
}
