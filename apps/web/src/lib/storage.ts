import LZString from "lz-string";
import {
  INTEGRITY_VERIFIERS,
  IntegrityError,
  computeIntegrityHash,
} from "./integrity";

export interface PersistedState {
  cliffToml: string;
  commits: unknown[];
  tags: unknown[];
  options?: unknown;
  name?: string;
  untrusted?: boolean;
}

const LS_KEY = "cliff-notes:state:v1";
const SCHEMA_VERSION = "1";

// ── local storage ─────────────────────────────────────────────────────────────

export function loadFromLocalStorage(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

export function saveToLocalStorage(state: PersistedState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // quota exceeded or storage disabled; swallow.
  }
}

export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

// ── URL hash encoding ─────────────────────────────────────────────────────────

export function encodeStateToPayload(state: PersistedState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodePayloadToState(payload: string): PersistedState | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(payload);
    if (!json) return null;
    return JSON.parse(json) as PersistedState;
  } catch {
    return null;
  }
}

export interface DecodedUrlHash {
  payload: string;
  hash: string;
  version: string;
  state: PersistedState;
}

/**
 * Parses the URL hash fragment. Returns a raw decoded object (hash NOT verified)
 * or null if the fragment is absent / not the new format.
 * Throws IntegrityError("legacy-format") if the old `#state=` key is detected.
 */
export function decodeFromUrlHash(hash: string): DecodedUrlHash | null {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) return null;

  const params = new URLSearchParams(fragment);

  // Reject legacy format
  if (params.has("state")) {
    throw new IntegrityError("legacy-format");
  }

  const s = params.get("s");
  const h = params.get("h");
  const v = params.get("v");

  if (!s || !h || !v) return null;

  const state = decodePayloadToState(s);
  if (!state) return null;

  return { payload: s, hash: h, version: v, state };
}

/**
 * Fully decodes and verifies the URL hash. Throws IntegrityError on any failure.
 * Returns the verified PersistedState on success.
 */
export async function decodeAndVerify(hash: string): Promise<PersistedState> {
  const decoded = decodeFromUrlHash(hash);
  if (!decoded) throw new IntegrityError("missing-field");

  const { payload, hash: claimedHash, version, state } = decoded;

  const verifier = INTEGRITY_VERIFIERS[version];
  if (!verifier) throw new IntegrityError("unsupported-version", { version });

  const valid = await verifier.verify(payload, claimedHash);
  if (!valid) {
    const expected = await verifier.compute(payload);
    console.warn("[integrity] URL hash mismatch", { expected, actual: claimedHash, version });
    throw new IntegrityError("hash-mismatch", { expected, actual: claimedHash });
  }

  return state;
}

export async function buildShareUrl(
  state: PersistedState,
  origin: string,
  pathname: string,
): Promise<string> {
  const payload = encodeStateToPayload(state);
  const hash = await computeIntegrityHash(SCHEMA_VERSION, payload);
  // LZ-string output contains '+' characters. Percent-encode so URLSearchParams
  // doesn't silently convert them to spaces on the receiving end.
  return `${origin}${pathname}#s=${encodeURIComponent(payload)}&h=${hash}&v=${SCHEMA_VERSION}`;
}
