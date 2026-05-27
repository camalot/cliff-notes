import LZString from "lz-string";
import slugify from "slugify";
import {
  INTEGRITY_VERIFIERS,
  IntegrityError,
  computeIntegrityHash,
} from "./integrity";
import { type PersistedState } from "./storage";
import { getProjectId } from "./project-id";

const SCHEMA_VERSION = "1";
const DEFAULT_PROJECT_NAME = "Untitled Project";
const DEFAULT_PROJECT_SLUG = "untitled-project";

function escapeYamlSingleQuoted(s: string): string {
  return s.replace(/'/g, "''");
}

export function slugifyProjectName(name: string): string {
  const preprocessed = name.replace(/_/g, " ");
  const slug = slugify(preprocessed, { lower: true, strict: true });
  const collapsed = slug.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed || DEFAULT_PROJECT_SLUG;
}

// ── metadata parser ───────────────────────────────────────────────────────────

interface FileMetadata {
  version: string;
  name: string;
  id: string;
  source: string;
  hash: string;
}

function parseMetadata(content: string): FileMetadata {
  const versionMatch = content.match(/^version:\s*['"]?(\S+?)['"]?\s*$/m);
  const kindMatch = content.match(/^kind:\s*CliffNotesProject\s*$/m);
  const nameMatch = content.match(/^\s+"cliff-notes\.dev\/name":\s*'((?:[^']|'')*)'/m);
  const idMatch = content.match(/^\s+"cliff-notes\.dev\/id":\s*'((?:[^']|'')*)'/m);
  const sourceMatch = content.match(/^\s+"cliff-notes\.dev\/source":\s*'((?:[^']|'')*)'/m);
  const hashMatch = content.match(/^\s+"cliff-notes\.dev\/hash":\s*'([^']+)'/m);

  if (!kindMatch) throw new IntegrityError("missing-field");

  const missing: string[] = [];
  if (!versionMatch) missing.push("version");
  if (!hashMatch) missing.push("cliff-notes.dev/hash");
  if (!sourceMatch) missing.push("cliff-notes.dev/source");
  if (missing.length > 0) {
    console.warn("[integrity] Missing fields in .cliff-notes file:", missing);
    throw new IntegrityError("missing-field");
  }

  return {
    version: versionMatch![1]!,
    name: nameMatch ? nameMatch[1]!.replace(/''/g, "'") : "",
    id: idMatch ? idMatch[1]! : "",
    source: sourceMatch![1]!.replace(/''/g, "'"),
    hash: hashMatch![1]!,
  };
}

// ── serialize ─────────────────────────────────────────────────────────────────

export async function serializePlayground(state: PersistedState): Promise<string> {
  const id = getProjectId();
  const name = (state.name && state.name.trim()) || DEFAULT_PROJECT_NAME;
  const source = typeof window !== "undefined" ? window.location.origin : "https://cliff-notes.dev";
  const payload = LZString.compressToEncodedURIComponent(JSON.stringify(state));
  const hash = await computeIntegrityHash(SCHEMA_VERSION, payload);

  return [
    "---",
    `version: '${SCHEMA_VERSION}'`,
    "kind: CliffNotesProject",
    "metadata:",
    `  "cliff-notes.dev/name": '${escapeYamlSingleQuoted(name)}'`,
    `  "cliff-notes.dev/id": '${id}'`,
    `  "cliff-notes.dev/source": '${escapeYamlSingleQuoted(source)}'`,
    `  "cliff-notes.dev/hash": '${hash}'`,
    "data: |",
    `  ${payload}`,
    "",
  ].join("\n");
}

// ── parse ─────────────────────────────────────────────────────────────────────

export async function parsePlayground(content: string): Promise<PersistedState> {
  const meta = parseMetadata(content);

  const verifier = INTEGRITY_VERIFIERS[meta.version];
  if (!verifier) throw new IntegrityError("unsupported-version", { version: meta.version });

  const dataMatch = content.match(/^data:\s*\|\s*\n((?:[ \t]+[^\n]*\n?)*)/m);
  if (!dataMatch?.[1]) throw new IntegrityError("missing-field");
  const payload = dataMatch[1].trim();
  if (!payload) throw new IntegrityError("missing-field");

  const valid = await verifier.verify(payload, meta.hash);
  if (!valid) {
    const expected = await verifier.compute(payload);
    console.warn("[integrity] File hash mismatch", { expected, actual: meta.hash });
    throw new IntegrityError("hash-mismatch", { expected, actual: meta.hash });
  }

  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (!json) throw new IntegrityError("missing-field");
  return JSON.parse(json) as PersistedState;
}

// ── best-effort recovery (for "Load anyway") ──────────────────────────────────

export function tryRecoverFromFile(content: string): PersistedState | null {
  try {
    const dataMatch = content.match(/^data:\s*\|\s*\n((?:[ \t]+[^\n]*\n?)*)/m);
    if (!dataMatch?.[1]) return null;
    const payload = dataMatch[1].trim();
    const json = LZString.decompressFromEncodedURIComponent(payload);
    if (!json) return null;
    return JSON.parse(json) as PersistedState;
  } catch {
    return null;
  }
}

// ── tryDecodeInput (URL/hash paste) ───────────────────────────────────────────

/**
 * Parses a pasted URL or hash fragment for the new `#s=&h=&v=` format.
 * Returns { payload, hash, version } or null if the input is not the new format.
 * Throws IntegrityError("legacy-format") if old `#state=` is detected.
 */
export function tryDecodeUrlInput(input: string): { payload: string; hash: string; version: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let fragment = "";
  try {
    const url = new URL(trimmed);
    fragment = url.hash;
  } catch {
    fragment = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }

  const frag = fragment.replace(/^#/, "");
  if (!frag) return null;

  const params = new URLSearchParams(frag);

  if (params.has("state")) {
    throw new IntegrityError("legacy-format");
  }

  const s = params.get("s");
  const h = params.get("h");
  const v = params.get("v");
  if (!s || !h || !v) return null;

  return { payload: s, hash: h, version: v };
}

export async function decodeAndVerifyUrlInput(input: string): Promise<PersistedState> {
  const decoded = tryDecodeUrlInput(input);
  if (!decoded) throw new IntegrityError("missing-field");

  const { payload, hash, version } = decoded;
  const verifier = INTEGRITY_VERIFIERS[version];
  if (!verifier) throw new IntegrityError("unsupported-version", { version });

  const valid = await verifier.verify(payload, hash);
  if (!valid) {
    const expected = await verifier.compute(payload);
    console.warn("[integrity] URL hash mismatch", { expected, actual: hash, version });
    throw new IntegrityError("hash-mismatch", { expected, actual: hash });
  }

  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (!json) throw new IntegrityError("missing-field");
  return JSON.parse(json) as PersistedState;
}

export function tryRecoverFromUrlInput(input: string): PersistedState | null {
  try {
    const decoded = tryDecodeUrlInput(input);
    if (!decoded) return null;
    const json = LZString.decompressFromEncodedURIComponent(decoded.payload);
    if (!json) return null;
    return JSON.parse(json) as PersistedState;
  } catch {
    return null;
  }
}

// ── download ──────────────────────────────────────────────────────────────────

export async function downloadPlayground(state: PersistedState): Promise<void> {
  const content = await serializePlayground(state);
  const blob = new Blob([content], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseName = (state.name && state.name.trim()) || DEFAULT_PROJECT_NAME;
  a.download = `${slugifyProjectName(baseName)}.cliff-notes`;
  a.click();
  URL.revokeObjectURL(url);
}
