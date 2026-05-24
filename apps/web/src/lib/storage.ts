import LZString from "lz-string";

export interface PersistedState {
  cliffToml: string;
  commits: unknown[];
  tags: unknown[];
}

const LS_KEY = "cliff-notes:state:v1";
const URL_PARAM = "state";

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

export function encodeToUrlHash(state: PersistedState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeFromUrlHash(hash: string): PersistedState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const encoded = params.get(URL_PARAM);
  if (!encoded) return null;
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;
    return JSON.parse(decompressed) as PersistedState;
  } catch {
    return null;
  }
}

export function buildShareUrl(state: PersistedState, origin: string, pathname: string): string {
  const encoded = encodeToUrlHash(state);
  return `${origin}${pathname}#${URL_PARAM}=${encoded}`;
}
