// Keys — namespaced to avoid collisions with other localStorage users
const GIST_ID_KEY = "cliff-notes:gist-id:v1";
const GIST_PAT_KEY = "cliff-notes:gist-pat:v1";
const SAVE_PAT_KEY = "cliff-notes:gist-save-pat:v1";
// Key for last-used save action (split button memory)
const SAVE_ACTION_KEY = "cliff-notes:save-action:v1";
// Key for the last-used project ID within the gist
const GIST_PROJECT_ID_KEY = "cliff-notes:gist-project-id:v1";

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ── Gist ID ──────────────────────────────────────────────────────────────────

export function getGistId(): string | null {
  return ls()?.getItem(GIST_ID_KEY) ?? null;
}

export function setGistId(id: string): void {
  ls()?.setItem(GIST_ID_KEY, id);
}

export function clearGistId(): void {
  ls()?.removeItem(GIST_ID_KEY);
}

// ── PAT ──────────────────────────────────────────────────────────────────────

/** Returns the stored PAT, or null if not saved or saving was disabled. */
export function getGistPat(): string | null {
  if (!getSavePat()) return null;
  return ls()?.getItem(GIST_PAT_KEY) ?? null;
}

/**
 * Save the PAT to localStorage.
 * Only call this when `savePat` is true (the user has explicitly opted in).
 */
export function setGistPat(pat: string): void {
  ls()?.setItem(GIST_PAT_KEY, pat);
}

export function clearGistPat(): void {
  ls()?.removeItem(GIST_PAT_KEY);
}

// ── Save-PAT toggle ──────────────────────────────────────────────────────────

/** Whether the user has opted into persisting their PAT. Default: false. */
export function getSavePat(): boolean {
  return ls()?.getItem(SAVE_PAT_KEY) === "true";
}

export function setSavePat(save: boolean): void {
  if (save) {
    ls()?.setItem(SAVE_PAT_KEY, "true");
  } else {
    ls()?.removeItem(SAVE_PAT_KEY);
    // Also clear the stored PAT when user opts out
    clearGistPat();
  }
}

// ── Last-used save action (split button) ─────────────────────────────────────

export type SaveAction = "local" | "gist";

export function getLastSaveAction(): SaveAction {
  const stored = ls()?.getItem(SAVE_ACTION_KEY);
  return stored === "gist" ? "gist" : "local";
}

export function setLastSaveAction(action: SaveAction): void {
  ls()?.setItem(SAVE_ACTION_KEY, action);
}

// ── Gist project ID ──────────────────────────────────────────────────────────

/** The last-used project ID within the Gist. */
export function getGistProjectId(): string | null {
  return ls()?.getItem(GIST_PROJECT_ID_KEY) ?? null;
}

export function setGistProjectId(id: string): void {
  ls()?.setItem(GIST_PROJECT_ID_KEY, id);
}

export function clearGistProjectId(): void {
  ls()?.removeItem(GIST_PROJECT_ID_KEY);
}
