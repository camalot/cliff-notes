# Unit 3 — PAT & Gist Config Storage

localStorage helpers for storing the GitHub PAT and the global Gist ID.
This is intentionally a thin module — no React, no state, just storage I/O.

**Depends on:** nothing
**Required by:** Unit 4 (GistExplorer), Unit 5 (Save), Unit 6 (Load)

---

## Phase 1: `gist-config.ts`

Create **`apps/web/src/lib/gist-config.ts`**:

```ts
// Keys — namespaced to avoid collisions with other localStorage users
const GIST_ID_KEY    = "cliff-notes:gist-id:v1";
const GIST_PAT_KEY   = "cliff-notes:gist-pat:v1";
const SAVE_PAT_KEY   = "cliff-notes:gist-save-pat:v1";
// Key for last-used save action (split button memory)
const SAVE_ACTION_KEY = "cliff-notes:save-action:v1";

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
```

### Security note

The PAT is written to `localStorage` only when the user explicitly enables the
"Save token" toggle. The key is namespaced but remains readable by any script on
the same origin. This is an acceptable trade-off given the app is a single-origin
tool — document this in UI copy as "stored in your browser only".

The PAT is **never** included in:
- The `.cliff-notes` file export (`serializePlayground` does not reference it)
- The share URL payload
- Any API request body (it travels as a header only)

---

## Phase 2: Exclude PAT from Serialised State

Confirm that `serializePlayground` in `playground-file.ts` does not serialize
`gistConfig` or any PAT field. Since `PersistedState` only adds `playgroundId`
(a non-sensitive UUID), and the PAT lives exclusively in `gist-config.ts`,
no additional exclusion logic is needed.

Add a defensive check to `saveToLocalStorage` to ensure we never accidentally
persist a PAT via the main state:

```ts
// In storage.ts saveToLocalStorage — already fine because PersistedState
// doesn't include a pat field. No code change needed; note this in a comment.

// IMPORTANT: PersistedState must never include authentication tokens.
// PAT is stored separately via gist-config.ts and excluded from exports.
```

---

## Verification Checklist

- [ ] `getGistPat()` returns `null` when `getSavePat()` is `false`
- [ ] `setSavePat(false)` also clears any stored PAT
- [ ] `setGistId` / `getGistId` round-trip correctly
- [ ] `getLastSaveAction()` defaults to `"local"`
- [ ] None of the gist-config values appear in a serialized `.cliff-notes` file
