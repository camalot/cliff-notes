# Playground integrity hash & unified payload format

Adds a tamper-detection checksum to the CliffNotesProject file format and to
shareable URLs, and aligns both on a single payload encoding. Introduces an
integrity error modal when the recomputed hash doesn't match.

## Goals

1. Detect accidental modification of the encoded `data` payload in either a
   `.cliff-notes` file or a shared URL.
2. Carry the schema version through the hash so the v1 hash cannot accidentally
   validate a future v2 payload (and vice versa).
3. Use the same payload encoding in the file and in the URL so they round-trip
   identically.
4. Surface a clear, blocking-by-default error modal when integrity fails, with
   an explicit "Load anyway (untrusted)" escape hatch.
5. Add informational metadata (`cliff-notes.dev/source`) recording which
   instance authored the file. **This is descriptive only — it is not part of
   the integrity contract** (see "Open items resolved" below, item 12). The
   plan deliberately does not claim provenance as a goal.

## Non-goals

- **This is integrity / checksum, not cryptographic tamper-resistance.** The
  seed is read from `package.json` at build time and ships in the client
  bundle, where any motivated user can read it from DevTools and recompute a
  valid hash. The hash defends against accidental edits, broken base64, and
  version drift — not against an attacker. The plan documents this explicitly
  so future contributors don't mistake it for a security boundary.
- No server-side signing or HMAC.
- No support for the existing `#state=…` URL format. Old links are rejected
  with the same integrity-error modal ("Legacy URL format no longer
  supported"). The site is in early use; the cost of a hard cutover is
  acceptable.

## File format (v1, new schema)

```yaml
---
version: '1'
kind: CliffNotesProject
metadata:
  "cliff-notes.dev/name": 'Cliff-Notes Remote'
  "cliff-notes.dev/id": '444c20a6-81a8-43b6-aae6-0e23937a1534'
  "cliff-notes.dev/source": 'https://cliff-notes.dev'
  "cliff-notes.dev/hash": 'Iv9Vk4qP…'
data: |
  N4IgxgpgBAhgRgFwhgRgQ…
```

**Changes from current v1:**

- `data:` is now `LZString.compressToEncodedURIComponent(JSON.stringify(state))`
  (was: base64 of raw JSON). Smaller files, identical to the URL `s=` value.
- New required metadata field: `"cliff-notes.dev/source"`.
- New required metadata field: `"cliff-notes.dev/hash"`.
- `version` stays `'1'`. We are taking the liberty of changing the v1 schema
  before any users depend on it; everything that lands in this plan is the new
  v1.

## URL format (v1, new)

```text
https://cliff-notes.dev/#s=<lz>&h=<hash>&v=1
```

- `s` — same string that goes into the file's `data:` block.
- `h` — same hash that goes into `"cliff-notes.dev/hash"`.
- `v` — schema version, parallel to the file's top-level `version:`.

The query-string ordering is not significant; we'll always emit `s`, `h`, `v`
in that order but the decoder reads by key.

## Hash

**Input:**

```text
${HASH_SEED}|${version}|${payload}
```

- `HASH_SEED` — string, read from root `package.json` `cliffNotes.hashSeed` at
  build time, baked into the bundle via Vite `define`.
- `version` — schema version as written (e.g. `1`). Used as a string so a
  future `'1a'` or similar is comparable.
- `payload` — the LZ-string-encoded `s` / `data` value as a single line, no
  trailing whitespace.

**Algorithm:** SHA-256 via `crypto.subtle.digest`. Output encoded as base64url
without padding (43 chars). Hex (64 chars) would also work; base64url is chosen
to keep URLs shorter, since the URL already contains the LZ payload.

**Metadata is intentionally *not* part of the hash.** Renaming a project
(`cliff-notes.dev/name`) does not invalidate previously-shared files. The id,
name, and source are descriptive, not part of the integrity contract.

## Seed configuration

Root `/workspace/package.json` gets:

```jsonc
{
  "cliffNotes": {
    "hashSeed": "cliff-notes-v1-<random-32-chars>"
  }
}
```

The seed is read by a small module that imports the root `package.json`
directly — **not** via Vite's `define` substitution. This avoids two real
pitfalls flagged in the rubber-duck review:

- `define` does **not** inherit into `vitest.config.ts`, so tests would see
  the identifier as undefined and throw a `ReferenceError` before
  `vi.stubGlobal` could rescue it.
- `define` substitutes `JSON.stringify(undefined)` as the literal text
  `undefined` if the JSON path is missing, and SHA-256 would silently hash
  the string `"undefined"`.

New file `apps/web/src/lib/build-config.ts`:

```ts
import rootPkg from "../../../../package.json";

const cn = (rootPkg as { cliffNotes?: { hashSeed?: string } }).cliffNotes;

if (!cn?.hashSeed || typeof cn.hashSeed !== "string") {
  throw new Error(
    "package.json `cliffNotes.hashSeed` is missing or not a string. " +
    "Add it before building — the integrity hash depends on it.",
  );
}

export const HASH_SEED: string = cn.hashSeed;
```

`apps/web/tsconfig.json` likely already has `resolveJsonModule: true`; if
not, the plan adds it.

The throw at module-load is the build-time assertion. Vite, vitest, and
production all evaluate this module on first import, so an empty seed fails
fast everywhere.

**`cliff-notes.dev/source` is populated at runtime** from
`window.location.origin` — the browser always knows the protocol and domain
it is running on. This means no configuration is required and the field
accurately reflects the actual instance that produced the file (production,
staging, or a local dev server). The serializer in `playground-file.ts`
reads `window.location.origin` directly when building the metadata block.

## Versioning strategy

The hash input begins with `version`, so a v2 payload hashed against the v2
recipe will produce a hash a v1 verifier cannot reconstruct, and vice versa.
The verifier is dispatched on the on-disk `version:` (or URL `v=`):

```ts
const verifier = INTEGRITY_VERIFIERS[version];
if (!verifier) throw new IntegrityError("unsupported-version", { version });
const ok = await verifier.verify({ seed, payload, hash });
```

`INTEGRITY_VERIFIERS` is a record keyed by version string. v2 would add a new
entry without touching v1.

## Modal UX

A new component `IntegrityErrorModal` is shown when:

- A file is uploaded and its hash does not recompute, OR
- A file is uploaded with missing/unknown required metadata, OR
- A URL contains `#s=…&h=…&v=…` and the hash does not recompute, OR
- A URL contains legacy `#state=…`, OR
- A URL declares a `v` we don't have a verifier for.

The modal shows:

- A title — "Integrity check failed" or "Legacy format" depending on cause.
- A short explanation of which input was invalid.
- The expected hash (recomputed) and the actual hash (from the input), each in
  a copyable monospace block. Skipped for the legacy-URL case.
- A "Close" button (default).
- A "Load anyway (untrusted)" secondary button. Clicking it applies the state
  and emits a persistent yellow banner under the toolbar that reads "Loaded
  without integrity check. Save the playground to refresh the hash."

The banner is dismissable and resets the moment the user saves or the URL hash
state would otherwise persist a fresh value.

## Implementation steps

### 1. New utility: `apps/web/src/lib/integrity.ts`

- Export `computeIntegrityHash(version, payload): Promise<string>` —
  base64url-encoded SHA-256 of `${__HASH_SEED__}|${version}|${payload}`.
- Export `verifyIntegrity(version, payload, hash): Promise<boolean>` — recompute
  and compare in constant time (not strictly necessary for a checksum but
  cheap).
- Export `IntegrityError` (subclass of `Error`) with a discriminated `cause`:
  `"hash-mismatch"`, `"unsupported-version"`, `"missing-field"`,
  `"legacy-format"`. Carries `expected` / `actual` / `version` as appropriate.
- Export `INTEGRITY_VERIFIERS: Record<string, Verifier>` with a v1 entry. The
  Verifier interface is small (`{ verify, compute }`) so v2 plugs in without
  touching call sites.

### 2. `apps/web/src/lib/storage.ts`

- Replace `encodeToUrlHash` / `decodeFromUrlHash` with versions that emit and
  parse `#s=…&h=…&v=…`.
- `decodeFromUrlHash` now returns a richer shape:
  `{ state, payload, hash, version }` (or `null`). The hash is *not* verified
  here — verification is the caller's job because it's async.
- A new `decodeAndVerify(hash): Promise<PersistedState>` does the full flow:
  decode → look up verifier → verify → return state, throwing `IntegrityError`
  on failure. Used by App startup.
- `buildShareUrl` becomes async: computes the hash for the current state, then
  returns the URL. (Alternative: take a precomputed hash, but the call site in
  `Toolbar.tsx` already has the state in hand, so async is fine.)
- `PersistedState` type unchanged.
- Legacy detection: if `decodeFromUrlHash` sees `state=` (the old key), throw
  `IntegrityError({ cause: "legacy-format" })`.

### 3. `apps/web/src/lib/playground-file.ts`

- Replace base64 encoding/decoding with LZ-string encoding/decoding for the
  `data:` field. Drop `encodeBase64` / `decodeBase64`.
- `serializePlayground` becomes async: computes hash, emits the new metadata
  (`source`, `hash`), writes the new payload format. YAML single-quote escape
  the source value too.
- `parsePlayground` becomes async: reads metadata + data, looks up the
  verifier, verifies, returns `PersistedState` — or throws `IntegrityError`.
- Add a strict regex/parser for the metadata block so missing fields are
  caught and surfaced as `IntegrityError({ cause: "missing-field" })`. We
  shouldn't roll a full YAML parser; the current line-by-line regex approach
  is fine but should validate the four required keys exist.
- `downloadPlayground` becomes async (awaits the new serializer).
- `tryDecodeInput` — used by the paste-a-link textarea in
  `LoadPlaygroundModal` — becomes async. The legacy raw-LZ-blob branch is
  removed; users must paste a full new-format URL or fragment.

### 4. New component: `apps/web/src/components/IntegrityErrorModal.tsx`

- Standalone modal with the layout described in **Modal UX** above.
- Two callbacks: `onClose()` and `onLoadAnyway(state)`. The host decides what
  to do with each. The modal doesn't know about the store.
- The modal takes the `IntegrityError` plus a `recoveredState?: PersistedState`
  (best-effort decoded state from the bad input). For `hash-mismatch` we can
  still decode the LZ payload and offer "Load anyway"; for `legacy-format` we
  can attempt the old `LZString.decompressFromEncodedURIComponent` path on the
  legacy `state=` value and pass that as `recoveredState`.

### 5. New component: `apps/web/src/components/UntrustedBanner.tsx`

- Yellow banner pinned below the toolbar; shows when the app is currently
  running with a hash-bypassed state. Driven by a new boolean
  `untrusted: boolean` in the store. Cleared by the next successful
  `setName` / `setCliffToml` / save — anything that produces a fresh hash.

### 6. Store changes — `apps/web/src/store.ts`

- Add `untrusted: boolean` to `AppState` (default `false`). Persist it in
  localStorage alongside the rest of `PersistedState` so the banner survives
  a page reload (issue #5 from review).
- Add `setUntrusted(v: boolean)` action.
- Add a single `applyPersistedState(state: PersistedState)` action that does
  the work currently split between `replaceAll`, `setOptions`, and (for the
  new flow) `setName`. Both the file-load path and the URL-startup path call
  this one action — that closes the gap from issue #2.
- **`untrusted` state machine — final rules:**
  1. Set to `true` exactly when the user clicks "Load anyway (untrusted)" on
     the integrity modal.
  2. Cleared to `false` on **every** mutating user action — `setCliffToml`,
     `setName`, `setOptions`, `addCommit`, `updateCommit`, `removeCommit`,
     `moveCommit`, `clearCommits`, `addTag`, `updateTag`, `removeTag`,
     `clearTags`, `insertRandomCommits`. Implemented inside each setter (not
     via a subscriber, so the clear is in the same update as the change).
  3. **Never** cleared by share-URL generation or file save. This explicitly
     prevents the "laundering" attack flagged in issue #3: clicking "Load
     anyway" then immediately clicking "Share" produces a URL containing the
     bypassed payload, and the recipient *still* sees the integrity modal
     because the hash on that URL was just freshly computed against the
     bypassed payload — wait, no — the new share URL would carry a valid
     hash. So the relevant defense is the *banner*: the local user keeps
     seeing it until they actually edit. We accept that a determined user
     can re-share bypassed content by editing one character. The system
     stops being silent about it, which is the achievable goal.
  4. `applyPersistedState` does **not** touch `untrusted`. The caller (App
     or LoadPlaygroundModal) sets the flag explicitly based on whether the
     state came from a verified or bypassed input.
- The localStorage subscriber writes `{ …state, untrusted }`. The
  `loadFromLocalStorage` reader treats a missing `untrusted` key as `false`
  (existing entries from before this change are treated as trusted — see
  the localStorage-migration note below).

### 7. App wiring — `apps/web/src/App.tsx`

- Remove the synchronous URL-hash branch from `initialState` (in `store.ts`),
  since verification is async.
- **Startup gate (issue #1):** if `window.location.hash` is non-empty on
  first mount, render a minimal full-screen loading state (the existing
  `ToastContainer` plus a centered `<Icon name="..." />` and the text
  "Loading shared playground…") *instead of* the main layout. The store has
  not yet been mutated, so localStorage state is still in memory but not
  visible. When the async decode finishes:
  - **Success:** call `applyPersistedState(state)`, `setUntrusted(false)`,
    strip the URL hash, then render the main layout.
  - **Failure:** show `IntegrityErrorModal` over the loading state (no
    layout flicker). On "Close" → fall back to localStorage state, show
    main layout. On "Load anyway" → call
    `applyPersistedState(recoveredState)`, `setUntrusted(true)`, strip the
    URL hash, show main layout.
- The URL-hash strip must look for **both** the new keys (`s=`, `h=`,
  `v=`) and the legacy `state=`, replacing the current substring check at
  `App.tsx:16` (issue #14). Simplest: any non-empty hash gets stripped after
  the integrity flow resolves one way or the other.
- `IntegrityErrorModal` is **owned by App only**. Other components surface
  errors by calling a `showIntegrityError(error, recoveredState?)` callback
  passed down to them, which writes to App-local state (issue #8).
  `LoadPlaygroundModal` closes itself before App opens the integrity modal
  — there is never modal stacking.

### 8. `LoadPlaygroundModal.tsx`

- `processFile` / `handleHashChange` paths become async.
- On `IntegrityError`, the modal closes itself (`onClose()`) and calls the
  App-level `showIntegrityError(error, recoveredState?)` callback. There is
  no nested modal — issue #8.
- **Textarea race (issue #7):** `handleHashChange` keeps an
  `inFlightSeq` ref. Each keystroke increments the seq and captures the
  current value; the async `tryDecodeInput` promise checks `seq === current`
  before writing `parsedState` or `fileError`. Late-arriving decodes are
  discarded. No debounce — the seq guard is enough.
- Successful parse paths unchanged.

### 9. `Toolbar.tsx` and `ShareModal.tsx`

- **Decision (issue #6):** move share-url construction into `ShareModal`.
  `Toolbar.tsx` stops computing `shareUrl` inline; it just passes the raw
  inputs (`cliffToml`, `commits`, `tags`, `options`, `name`) to
  `ShareModal`.
- `ShareModal` builds the URL in an effect on first render. While the URL is
  being computed, the existing share input shows a brief skeleton/spinner.
  Once resolved, behavior is identical to today. No nullable threading
  back through Toolbar.
- `downloadPlayground` is now async; `handleSave` becomes `async`.
- **Neither share nor save touches `untrusted`** (per the state-machine
  rules in §6). The banner persists until the user makes a real edit.

### 10. Tests

New + updated:

- `lib/integrity.test.ts` (new):
  - Hash is stable across runs for the same input.
  - Different version → different hash.
  - Different seed → different hash (mocked via `vi.stubGlobal`).
  - `verifyIntegrity` returns true for valid, false for any single-bit flip in
    payload, version, or hash.
- `lib/playground-file.test.ts` (new):
  - Round-trip: serialize → parse → state equality.
  - Tampering the `data:` line throws `IntegrityError("hash-mismatch")`.
  - Tampering the `cliff-notes.dev/hash` line throws likewise.
  - Renaming `cliff-notes.dev/name` does **not** affect integrity (still
    loads).
  - Missing `cliff-notes.dev/hash` → `IntegrityError("missing-field")`.
  - Unknown `version: '99'` → `IntegrityError("unsupported-version")`.
- `lib/storage.test.ts` — rewrite the URL-hash tests for the new
  `#s=…&h=…&v=…` format, with one explicit case asserting that
  `#state=…` (legacy) throws `IntegrityError("legacy-format")`.

Unit tests run under jsdom; `crypto.subtle` is available in modern Node test
environments. If `vitest` complains, polyfill via `node:crypto`'s
`webcrypto` in `test-setup.ts`.

### 11. Documentation

A short note in `README.md` (or wherever the file format is currently
documented) describing the new metadata fields and the integrity contract,
explicitly flagging "this is a checksum, not a security boundary."

## localStorage policy

localStorage is treated as **trusted local user state** and is **never**
integrity-checked. Justification:

- The hash defends against external inputs the user did not personally
  produce (a URL someone sent them, a file they downloaded). localStorage
  was written by the same browser session.
- Migrating existing localStorage entries (which have no `hash` field) would
  pop the integrity modal on every returning user's first load, for no
  security benefit.
- The `untrusted` flag *is* persisted in localStorage so the banner survives
  reloads (issue #5), but the underlying state is never re-verified against
  a hash on read.

This is documented as the "what this checksum does not catch" list in the
README, alongside the data-swap caveat from issue #13.

## Logging on integrity failures

No telemetry pipeline exists for this client-only playground. The plan does
**not** add one. On each `IntegrityError`, the verifier calls `console.warn`
with the `cause` and (when available) `expected`/`actual` hashes, so a
developer triaging a bug report has something to grep for in
browser-console screenshots. This is intentionally minimal (issue #15
declined).

## Future considerations

- **Gzip + base64 payload.** Once LZ-string limits become a real cost (very
  large playgrounds, e.g. loaded from real repos), switch the payload encoding
  to `base64url(gzip(JSON))` via `pako` or the browser's
  `CompressionStream("gzip")`. Because the version is part of the hash input,
  a future schema can change the encoding without breaking v1: bump to v2,
  add a v2 verifier, leave v1 alone.
- **Server-signed shares.** If anti-tampering becomes a real requirement
  (e.g. a "verified" badge on shared playgrounds), `apps/api` can sign the
  payload with an HMAC whose secret never leaves the server, and the client
  verifies signatures from a server-published public key. Out of scope here.
- **Multiple seeds.** A list of accepted seeds (current + previous) would let
  us rotate the seed without breaking previously-shared links. Not needed for
  this iteration.

## Rubber-duck review — decision log

A general-purpose critic agent reviewed the first draft of this plan. Its
output is summarised below with my accept/decline decision and rationale.
Severity is the critic's. Where I declined, the rationale matters more than
the decision — please challenge it on its merits if you disagree.

1. **[High] Startup flash from sync `initialState` + async URL verify.**
   **Accepted.** Plan now gates the main layout on a "Loading shared
   playground…" screen whenever the URL hash is non-empty on first mount
   (§7). The store is never seeded from the URL hash; only
   `applyPersistedState` mutates it after verification.

2. **[High] `replaceAll` doesn't carry `name`, `options`, can't trigger
   `untrusted` rules.** **Accepted.** Introduced
   `applyPersistedState(state)` as the single entry point used by both
   URL-startup and file-load paths (§6, §7). `replaceAll` stays for
   internal/test use but the new public path is unambiguous.

3. **[High] Share/Save launders bypassed state.** **Accepted in modified
   form.** The original "clear on share/save" rule is removed. New rules
   (§6): `untrusted` is set by "Load anyway" and cleared by *any* mutating
   user action. The critic's stricter framing — that share-on-bypass mints
   a "valid" URL — is true and acknowledged in §6.3: the practical defense
   is the persistent banner. A determined user can still re-share by
   editing one character; the system stops being silent.

4. **[High] localStorage migration unspecified.** **Accepted.** New
   "localStorage policy" section makes the decision explicit: local state
   is trusted, never hashed.

5. **[High] `untrusted` should survive reload.** **Accepted.** `untrusted`
   joins `PersistedState` and the localStorage subscriber (§6).

6. **[Medium] `Toolbar.tsx` async `shareUrl` is awkward.** **Accepted.**
   §9 now commits to Option A: share-URL construction moves into
   `ShareModal`. Removed the dual-option ambiguity.

7. **[Medium] Textarea decode race.** **Accepted.** §8 specifies a
   monotonic `seq` ref with last-write-wins guard. No debounce.

8. **[Medium] Modal stacking ambiguity.** **Accepted.** §7 places the
   `IntegrityErrorModal` under App alone; LoadPlaygroundModal closes
   itself and calls a `showIntegrityError` callback upward.

9. **[Medium] Vite `define` with missing seed silently breaks.**
   **Accepted.** §"Seed configuration" now throws at module-load if the
   seed is missing or non-string. The throw is in
   `apps/web/src/lib/build-config.ts`, evaluated by both vite and vitest.

10. **[Medium] `define` doesn't propagate to vitest.** **Accepted.** Same
    fix as #9: replace `define` with a `build-config.ts` module that
    imports root `package.json` directly (works in both environments).

11. **[Low] `crypto.subtle` polyfill is unnecessary on Node 25.**
    **Accepted (downgrade).** Plan calls it a safety-net comment, not a
    required step.

12. **[Medium] Metadata-not-in-hash creates a `source` contradiction.**
    **Accepted (contradiction resolved, structural change declined).**
    `source` is informational only and not part of the hash. The original
    plan had a contradiction between claiming provenance as a goal and
    excluding `source` from the hash — that contradiction is fixed by
    removing "provenance" from the goals. Additionally, `source` is now
    derived from `window.location.origin` at runtime rather than from
    `package.json` config, removing both the maintenance burden and the
    "localhost says cliff-notes.dev" awkwardness that motivated the
    config-based approach. The hash recipe (`${seed}|${version}|${payload}`)
    is unchanged.

13. **[Low] Data-swap between two files passes silently.** **Accepted.**
    Added to the README's "what this checksum does not catch" list,
    referenced from the localStorage-policy section.

14. **[Low] URL-strip uses `state=` substring.** **Accepted.** §7
    explicitly says: strip any non-empty hash after the integrity flow
    resolves, regardless of key shape.

15. **[Low] No telemetry plan for hash failures.** **Declined.** This is
    a client-only playground with no analytics pipeline. Adding one for
    this feature would be scope creep. Plan now specifies
    `console.warn(cause, expected, actual)` as the minimum useful trace
    (new "Logging on integrity failures" section). If the team later adds
    telemetry, this is the natural attachment point.

**Net effect of the review:** structural plan unchanged at the file/URL
format level (user's settled decisions held). Internals got materially
better: startup flow, modal ownership, untrusted state machine,
localStorage policy, build-config module, and textarea race are now all
specified instead of hand-waved.
