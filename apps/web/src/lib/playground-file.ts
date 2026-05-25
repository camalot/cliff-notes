import LZString from "lz-string";
import { decodeFromUrlHash, type PersistedState } from "./storage";
import { getProjectId } from "./project-id";

function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

function decodeBase64(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function serializePlayground(state: PersistedState): string {
  const id = getProjectId();
  const base64 = encodeBase64(JSON.stringify(state));
  return [
    "---",
    "version: '1'",
    "kind: CliffNotesProject",
    "metadata:",
    `  "cliff-notes.dev/name": '${id}'`,
    `  "cliff-notes.dev/id": '${id}'`,
    "data: |",
    `  ${base64}`,
    "",
  ].join("\n");
}

export function parsePlayground(content: string): PersistedState {
  if (!/^kind:\s*CliffNotesProject\s*$/m.test(content)) {
    throw new Error("Not a valid cliff-notes file");
  }
  const dataMatch = content.match(/^data:\s*\|\s*\n((?:[ \t]+[^\n]*\n?)*)/m);
  if (!dataMatch?.[1]) {
    throw new Error("Missing or empty data field");
  }
  const base64 = dataMatch[1].trim();
  if (!base64) throw new Error("Empty data field");
  try {
    const json = decodeBase64(base64);
    return JSON.parse(json) as PersistedState;
  } catch {
    throw new Error("Failed to parse playground data");
  }
}

/** Try to decode a playground state from a URL, hash fragment, or raw LZ-encoded string. */
export function tryDecodeInput(input: string): PersistedState | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try as a full URL (extract hash fragment first)
  try {
    const url = new URL(trimmed);
    const result = decodeFromUrlHash(url.hash);
    if (result) return result;
  } catch {
    /* not a URL */
  }

  // Try as hash fragment (with or without leading #)
  const fromHash = decodeFromUrlHash(trimmed);
  if (fromHash) return fromHash;

  // Try as a raw LZ-encoded value
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(trimmed);
    if (decompressed) {
      const parsed = JSON.parse(decompressed) as unknown;
      if (parsed && typeof parsed === "object") return parsed as PersistedState;
    }
  } catch {
    /* ignore */
  }

  return null;
}

export function downloadPlayground(state: PersistedState): void {
  const content = serializePlayground(state);
  const blob = new Blob([content], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cliff-notes-project.cliff-notes";
  a.click();
  URL.revokeObjectURL(url);
}
