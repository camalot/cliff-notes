# Plan: Strip `[remote.*]` from user `cliff.toml` and inject mocked remote context

> Status: design only. No code changes in this plan.
> Revision 2 — incorporates critique from rubber-duck review.

## Goal

When a user's `cliff.toml` contains any `[remote.*]` table (`remote.github`,
`remote.gitlab`, `remote.gitea`, `remote.bitbucket`, `remote.azure_devops`,
or the global `[remote]` table), cliff-notes must:

1. **Strip** the section before invoking `git-cliff`, so:
   - No outbound API call is ever made from the server.
   - Any `token = "..."` is never exercised AND never written to a temp dir on disk.
2. **Mock** the data git-cliff's remote integration would have produced, so
   templates referencing `commit.remote.username`, `commit.remote.pr_number`,
   `github.contributors`, `remote.github.owner`, etc. still render meaningfully.
3. **Surface feedback** in the Monaco editor on each `[remote.*]` header
   informing the user that the section is mocked.

Mock data is sourced from `.cliff/context/*.json`:

- `conventional.json` / `unconentional.json` — shape of a release-with-commits
  context (these are *shape references*, not data to paste in literally).
- `remote.json` — top-level `remote.<kind>.{owner, repo}` mock defaults.
- `github.json` / `gitlab.json` / `gitea.json` / `bitbucket.json` /
  `azure_devops.json` — per-kind decoration shape for `commit.remote.*` and
  per-release `<kind>.contributors`.

---

## Verified facts about git-cliff (confirmed against `submodules/git-cliff` source)

These facts shaped the design and are listed up front so future maintainers
don't have to re-derive them.

1. **`Changelog::new` runs the full pipeline:** `add_remote_context()` →
   (if not offline) `add_remote_data()` → `process_commits()` →
   `process_releases()` ([changelog.rs:42-49](../../submodules/git-cliff/git-cliff-core/src/changelog.rs#L42-L49)).
2. **`--context` is emitted *after* the full pipeline** —
   `Changelog::write_context` runs at [lib.rs:871-873](../../submodules/git-cliff/git-cliff/src/lib.rs#L871-L873),
   so commit_parsers / commit_preprocessors / link_parsers / filter_unconventional /
   filter_merge_commits / skip_tags / statistics have all already been applied.
3. **`from_context` does NOT re-run the pipeline.** It only calls `build`
   ([changelog.rs:72-74](../../submodules/git-cliff/git-cliff-core/src/changelog.rs#L72-L74)).
   Pass 2 trusts whatever the context JSON contains verbatim — *except*:
4. **`add_remote_context()` IS called after `from_context`** at
   [lib.rs:758](../../submodules/git-cliff/git-cliff/src/lib.rs#L758), so the
   global Tera `remote.<kind>.{owner, repo, api_url, token, native_protocol}`
   variables ARE populated from cliff.toml in pass 2.
5. **`github` / `gitlab` / `gitea` / `bitbucket` / `azure_devops` are fields on
   `Release`**, not top-level globals
   ([release.rs:54-55](../../submodules/git-cliff/git-cliff-core/src/release.rs#L54-L55)). The decorator must write
   `<kind>.contributors` onto each release object, not at the top of the array.
6. **Multiple `[remote.*]` blocks coexist.** `add_remote_data` checks each kind
   independently ([changelog.rs:450](../../submodules/git-cliff/git-cliff-core/src/changelog.rs#L450)).
   But `commit.remote` is a single object — only one kind can populate per-commit fields.

---

## Design

### A. Detect & strip `[remote.*]` from `cliff.toml`

A new module `apps/api/src/services/cliff-toml-remote.ts`:

```ts
parseAndStripRemote(toml: string): {
  cleanedToml: string;
  detectedKinds: RemoteKind[];        // ordered: ["github", "gitlab", "gitea", "bitbucket", "azure_devops"]
  carriedOver: Partial<Record<RemoteKind, { owner?: string; repo?: string; api_url?: string }>>;
  referencedToken: boolean;           // user has `token = "..."` set — for warnings[]
}
```

Where `RemoteKind = "github" | "gitlab" | "gitea" | "bitbucket" | "azure_devops"`.

**Scanner requirements (line-based, but with state):**

- Track whether we're inside a `"""..."""` or `'''...'''` triple-quoted string.
  Section headers inside template bodies must be ignored (this fixes a
  pre-existing class of bugs in `extractBumpInitialTag` / `cliffTomlContainsSecret`).
- Strip:
  - `[remote]` and all lines until the next header.
  - `[remote.<kind>]` and all lines until the next header.
  - `[remote.<kind>.<anything>]` (child tables, including `[remote.<kind>.contributors]`-style).
  - Dotted-key root-level assignments: `remote.github.owner = "..."`, `remote.github.token = "..."`.
- Refuse to strip and **fall back to safe defaults** when:
  - An inline-table assignment is seen at root level: `remote = { ... }`.
    Implementation: detect the form, refuse to render, and surface a clear
    user-facing error ("inline-table `remote = { ... }` is not supported in
    cliff-notes; use the section form"). This avoids silent token-leak risk.
- The `[remote]` (bare) table only carries `offline`; strip it but don't
  count it as a detected kind. We always set `offline = true` ourselves.
- Capture `owner`, `repo`, and `api_url` per detected kind for optional carry-through.
  **Never** capture `token` or `native_protocol`.

### B. Inject mocked `[remote.<kind>]` block(s) into the cleaned toml

For each detected kind, append:

```toml
[remote]
offline = true   # idempotent — appended once, regardless of kinds

[remote.<kind>]
owner = "<carried-over or fixture default>"
repo  = "<carried-over or fixture default>"
api_url = "<carried-over if it was a valid URL>"   # optional
token = ""        # explicit empty string so {{ remote.github.token }} renders deterministically
```

**Carry-through validation (tightened):**

- `owner`: regex `^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,38})$` (GitHub-style) for github/gitea/bitbucket;
  `^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)?$` for azure_devops (allows the `org/project` form);
  `^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$` for gitlab (allows nested groups).
- `repo`: regex `^[A-Za-z0-9._-]{1,100}$`.
- `api_url`: must parse as a URL with `http`/`https` scheme.
- On regex/URL failure, fall back to the corresponding fixture value from
  `.cliff/context/remote.json`.

### C. Two-pass render: capture context → decorate → re-render

When `detectedKinds.length > 0`:

1. **Strip & inject BEFORE writing to disk.** `buildTempRepo` is called with
   the cleaned toml. The user's original toml never lands in `/tmp`. This
   is the security fix for critique point 10/11.
2. **Pass 1 — capture full processed context:**

   ```
   git-cliff --context --offline
   ```

   stdout = JSON array of fully-processed releases (commit_parsers, groups,
   link_parsers, etc. have all run — see verified fact #2).
3. **Decorate** the JSON in-process (see section D below).
4. **Pass 2 — render from decorated context:**

   ```
   git-cliff --from-context - --offline
   ```

   stdin = decorated JSON; stdout = final markdown.

When `detectedKinds.length === 0`: existing single-pass flow runs unchanged
(no decoration overhead).

### D. Decorator behavior

`apps/api/src/services/remote-mock.ts`:

```ts
decorateContext(releases: ReleaseJson[], kinds: RemoteKind[], mocks): ReleaseJson[]
```

**Per-commit `commit.remote` (single object, kind = first of `kinds`):**

| Field           | Source / rule                                                                |
| --------------- | ---------------------------------------------------------------------------- |
| `username`      | If author email is `noreply@cliff-notes.local` (DEFAULT_AUTHOR) → `"cliff-notes-bot"`. Otherwise, the email local-part, sanitized to `[A-Za-z0-9_-]+`. |
| `pr_title`      | First line of commit message.                                                 |
| `pr_number`     | Monotonic counter (seeded by `hash(release.version)`, incremented per commit in topological order). Avoids hash collisions identified in critique point 8. |
| `pr_labels`     | `[]` (deterministic).                                                         |
| `is_first_time` | Computed in a second pass: `true` only for the *earliest release* (oldest first) in which a given `username` appears (see fact below). |

**Per-release `<kind>` decoration, for every kind in `kinds`:**

- `release.<kind>.contributors[]` — distinct `username` values from the
  release's commits, each with `{username, pr_title, pr_number, pr_labels, is_first_time}`.
- `is_first_time` for contributors is computed globally across all releases
  in the context: a contributor is "first time" only in the earliest release
  containing them. (Critique point 6.)

**Don't clobber pre-populated fields.** If pass 1's JSON already has a
`commit.remote` or `release.github` populated (because the user's pipeline
already wrote one — rare but possible), do an additive merge: missing keys
only, never overwrite. (Critique point 17.)

**Always boolean.** `is_first_time: true | false` — never strings or numbers,
because Tera's `filter(value=true)` is strict-equality. (Critique point 9.)

**Always seed a synthetic co-contributor.** When a release has commits from
only one author (very common in the playground), append one fixture-derived
co-contributor (`cliffjumper`, PR 999, labels from the fixture) to
`<kind>.contributors[]`. Lets first-time-contributor template branches
render something non-empty. (Critique point 7.)

### E. `--bumped-version` runs against the *cleaned* toml

`computeBumpedVersion` currently execs against the temp dir that contains
the *original* toml. After this change, the same dir contains the cleaned
toml — no special-casing needed, because we strip before `buildTempRepo`.
(Critique point 10; the fix is structural, not algorithmic.)

### F. Editor feedback — use a **hover provider**, not a marker

Replace the plan-revision-1 "Info-severity Monaco marker" idea with a
Monaco hover provider:

- Register a hover provider for `cliff-toml` that, when the cursor hovers
  over a token inside a `[remote.*]` header line, returns a markdown
  hover message explaining the mocking behavior.
- Does NOT pollute the Problems panel with one entry per `[remote.*]` block
  per keystroke (which would condition users to ignore it).
- The existing token-secret *Warning* marker stays — that's a real share-link risk.

Also: add `azure_devops` to `REMOTE_SUBSECTIONS` so the existing "Unknown
remote" warning doesn't fire on the fifth supported kind.

### G. API surface — `mockedRemotes` field

Add `mockedRemotes: RemoteKind[]` to `RenderResponse` (and the shared
schema). The web client renders a small badge "Remote data is mocked:
github" so users have a structured signal (not just an editor hover) that
mocking occurred for this render.

### H. Warnings handling for two-pass renders

stderr handling for `warnings[]`:

- Use **pass 1** stderr for `warnings[]` — that's where `commit_parsers`
  / `filter_unconventional` / `skip_tags` log warnings, which is what the
  user authored and wants feedback on.
- Pass 2 stderr is silently discarded *unless* git-cliff exits non-zero;
  in that case, pass 2 stderr is surfaced via the existing `RenderError`
  path. The two-pass refactor must preserve this error surface.

### I. Token-in-template footgun

When the user's stripped section contained `token = "..."`, `referencedToken`
is `true`. Add a string to `warnings[]`:

> "`remote.<kind>.token` was set in your cliff.toml. cliff-notes mocks
> this to an empty string; templates that reference `{{ remote.<kind>.token }}`
> will render empty here, even though they wouldn't in real git-cliff."

(Critique point 4.)

---

## File-by-file change list

### New
- `apps/api/src/services/cliff-toml-remote.ts` — strip/inject toml.
- `apps/api/src/services/remote-mock.ts` — load fixtures + decorate context.
- Tests for both (see "Test coverage" below).

### Modified
- `apps/api/src/services/git-cliff.ts` — two-pass branch, ordering fix
  (strip BEFORE `buildTempRepo`).
- `apps/api/src/config.ts` — add `remoteMocksDir` (defaults to
  `.cliff/context/`).
- `packages/shared/src/schemas.ts` — add `mockedRemotes: RemoteKind[]` to
  `renderResponseSchema`.
- `apps/web/src/lib/monaco-cliff-toml.ts` — add `azure_devops` to
  `REMOTE_SUBSECTIONS`; remove (do not add) any Info-marker on `[remote.*]`
  headers; register a hover provider with the mocking explanation.
- `apps/web/src/lib/api.ts` and the right-pane render results UI — show
  the "Remote data is mocked" badge when `mockedRemotes` is non-empty.

### Unchanged
- `apps/api/src/lib/exec.ts` — already supports `stdin` (used by fast-import today).
- `apps/api/src/services/repo-builder.ts` — receives the cleaned toml exactly
  as before; no change.
- `apps/web/src/components/CliffTomlEditor.tsx` — Monaco wiring already
  invokes `registerCliffToml`; the new hover provider lives in that module.

---

## Critique response: decisions and tradeoffs

Each item below is a critique point the rubber-duck review surfaced. Format:
**Critique** → **Options considered (pros/cons)** → **Chosen path & why**.

### 1. `--from-context` skips commit_parsers / preprocessors on pass 2

**Critique:** pass 2 never re-runs `process_commits`, so anything not already
applied in pass 1's `--context` output is lost.

**Options:**

- (a) Run pass 1 with `--context` and rely on git-cliff to have already
  processed commits there.
  - Pro: matches verified fact #2 (`write_context` runs after the full
    pipeline). No extra work.
  - Con: pass 1's exit code becomes load-bearing; a parser error in pass 1
    aborts the whole render with limited diagnostics.
- (b) Implement the commit parsing ourselves on the JSON and skip pass 1.
  - Pro: only one git-cliff invocation.
  - Con: re-implementing git-cliff in TS, including regex semantics and
    edge cases. Inevitable drift. Rejected.

**Chosen: (a).** The verified source confirms `--context` emits
post-pipeline data, which is exactly what pass 2 needs. Add an explicit
test that asserts commit groups and link-parser substitutions survive into
the rendered markdown.

### 2. `<kind>.contributors` is per-release, not global

**Critique:** prose said "release gets `release.<kind> = {...}`" which an
implementer might literally encode as `release: { github: {...} }`.

**Chosen:** decorator writes `release.<kind>.contributors`, NOT a `release`
wrapper. Plan prose tightened in section D. Fixture shape (e.g.
`github.json`) already matches this. No real disagreement; documentation fix.

### 3. Carry-through of `api_url` and behavior for `native_protocol`

**Critique:** templates legitimately reference `remote.<kind>.api_url`
(self-hosted GitLab compare URLs), and the plan didn't cover it.

**Options:**

- (a) Always force `api_url` to a fixture default.
  - Pro: maximally deterministic.
  - Con: breaks self-hosted-aware templates.
- (b) Carry user's `api_url` through if it parses as a `http(s)://` URL.
  - Pro: preserves template behavior.
  - Con: trivial information leak — the URL string appears in rendered
    markdown. Acceptable: it was already in cliff.toml, which is stored
    client-side and shared via URL anyway.

**Chosen: (b).** `native_protocol` is silently dropped (it controls TLS
behavior server-side; templates don't reference it in practice).

### 4. Token-in-template footgun

**Critique:** `{{ remote.github.token }}` references render empty silently
after stripping; user may not notice.

**Options:**

- (a) Inject `token = ""` so Tera resolves deterministically.
  - Pro: explicit; no Tera undefined-variable behavior changes.
- (b) Surface a `warnings[]` entry when `token` was set.
  - Pro: user sees the change.
- (c) Both.

**Chosen: (c).** Both. The `token = ""` injection prevents accidental
Tera errors; the warning makes the behavior change visible.

### 5. Line-based scanner counterexamples (triple-quotes, dotted keys, inline tables)

**Critique:** the scanner the plan describes will incorrectly trip on
`[remote.github]` text appearing inside a `"""..."""` template body, will
miss `remote.github.token = "..."` dotted-key root-level assignments, and
will miss the inline-table form `remote = { github = {...} }`.

**Options:**

- (a) Switch to a real TOML parser (`@iarna/toml` or `smol-toml`).
  - Pro: robust.
  - Con: adds a dependency for one feature.
- (b) Tighten the scanner: track triple-quote state, handle dotted keys,
  refuse-and-error on inline-table form.
  - Pro: no new dependency.
  - Con: still bespoke; future TOML features may catch us out.
- (c) Hybrid: scanner for the common case; if any `remote` token appears in
  a context the scanner can't classify, fall back to a real parser only on
  the strip path.
  - Pro: dependency cost amortized.
  - Con: two code paths to maintain.

**Chosen: (b).** The scanner approach matches the codebase's existing
style (`extractBumpInitialTag`, `cliffTomlContainsSecret`) and the
critique's listed cases are all tractable with state tracking. The
inline-table form is rejected outright with a clear error — it's an
unusual style for git-cliff configs anyway. If the scanner proves brittle
in practice, revisit (a). This decision is reversible.

### 6. `is_first_time` semantics

**Critique:** "first per release" produces a spurious "New Contributors"
section in every release the user has, looking like a bug.

**Chosen:** Compute first-time-ness across the entire context (oldest
release first), so each username is `is_first_time: true` exactly once.
Documented in section D. Tested with a multi-release context.

### 7. Username collision with `DEFAULT_AUTHOR` & single-author releases

**Critique:** the `noreply@cliff-notes.local` fallback maps every
anonymous commit to `noreply`, and single-author releases produce
contributor lists of length 1.

**Chosen:** Special-case `noreply@cliff-notes.local` → `cliff-notes-bot`,
and always append one fixture-derived co-contributor to each release's
`<kind>.contributors`. Both documented in section D.

### 8. `pr_number` hash collisions

**Critique:** `hash(commit_id) % 10000` collides ~50% of the time at 145 commits.

**Options:**

- (a) Larger modulus.
  - Pro: simple.
  - Con: still nonzero collision risk; PR numbers no longer look "PR-ish".
- (b) Monotonic counter per release.
  - Pro: zero collisions within a release; PR numbers are stable.
  - Con: collisions *across* releases possible (release A's PR #3 == release B's PR #3).
- (c) Monotonic counter, seeded by `hash(release.version)`.
  - Pro: stable, no inter-release collisions, deterministic, snapshot-testable.

**Chosen: (c).** Documented in section D's table.

### 9. Boolean vs. string for `is_first_time`

**Chosen:** Strict booleans throughout. Integration test asserts the
"New Contributors" section renders non-empty for a context where it should.
No real tradeoff — this is a "just don't get it wrong" item.

### 10 & 11. `--bumped-version` and tokens-on-disk

**Critique:** The `--bumped-version` path runs against the user's original
toml today; writing the original toml to a temp dir leaks tokens to disk
on crash.

**Chosen:** Reorder `renderChangelog`: strip → inject → `buildTempRepo`
(with cleaned toml) → `computeBumpedVersion` (against cleaned toml) → pass 1
→ decorate → pass 2. The cleanup is a pure ordering fix and was already
implied by the original plan; it's now explicit in section C.

### 12. Owner/repo regex too permissive

**Critique:** `[A-Za-z0-9_./-]+` allows `../../etc/passwd`-shaped values.

**Chosen:** Per-kind tightened regexes (section B). Azure DevOps owner is
special-cased to allow exactly one `/` (the `org/project` form). On
validation failure, fall back to the fixture default — never raise to the user.

### 13. Info marker vs. hover provider

**Critique:** Long-form Info markers pollute the Problems panel and
condition users to ignore them.

**Options:**

- (a) Info marker (original plan).
  - Pro: visible underline on the header.
  - Con: Problems-panel pollution.
- (b) Hover provider.
  - Pro: discoverable only when user actually looks at the section; no
    panel pollution.
  - Con: less discoverable on first edit.
- (c) One-time toast/banner on first detected `[remote.*]` per session.
  - Pro: maximum discoverability.
  - Con: state to manage; nags returning users.
- (d) Status-line indicator in the editor.
  - Pro: persistent without being noisy.
  - Con: another piece of UI to design.

**Chosen: (b) + (G).** Hover provider for the explanation, plus the new
`mockedRemotes` API field surfaced as a render-result badge. The badge
covers the "did mocking happen?" case structurally; the hover covers the
"why?" case on demand. (c) and (d) are nice-to-haves we can layer on later
if user feedback says discoverability is still poor.

### 14. Warnings stderr handling for two-pass

**Chosen:** Pass 1 stderr → `warnings[]` (user-relevant parser feedback).
Pass 2 stderr → silently discarded unless pass 2 fails (then surfaced via
the existing `RenderError` path). Documented in section H.

### 15. Multiple `[remote.<kind>]` blocks — which wins for per-commit?

**Critique:** `commit.remote` is one object; the plan didn't pick a priority.

**Chosen:** Fixed priority order
`["github", "gitlab", "gitea", "bitbucket", "azure_devops"]` for `commit.remote.*`
decoration. All detected kinds still get their per-release
`<kind>.contributors` (additive). Documented in section D and in
`mockedRemotes` (which lists every kind that was detected, in priority order).

### 16. Things the original plan got right (acknowledged)

- Two-pass is the only path that populates per-commit fields.
- `offline = true` belt-and-suspenders is good defense in depth.
- `azure_devops` needs to be added to `REMOTE_SUBSECTIONS`.
- Deterministic > random for snapshot tests.
- Treat bare `[remote]` differently from `[remote.<kind>]`.
- Load fixtures once at boot.

### 17. Additional tests called out

- Snapshot test: cliff.toml with `token = "REALLY_SECRET"` → output contains
  the token *nowhere* (markdown body, stderr-derived `warnings[]`, response JSON).
- Test that pass 1 stderr surfaces commit_parser warnings to `warnings[]`.
- Test the `--bumped-version` path with a `[remote.github]` block (asserts
  the bumped-version pass runs against the cleaned toml).
- Decorator idempotency: a context whose commits already have `remote.username`
  set is not clobbered.
- Unknown remote kind (`[remote.bogus]`) — stripper handles gracefully, not
  added to `detectedKinds`.
- Scanner regression: a `cliff.toml` with `"""... [remote.github] ..."""`
  inside a template body — section is NOT stripped.

---

## Implementation order (when the time comes)

1. Scanner module + tests (strip & inject, including the triple-quote, dotted-key,
   and inline-table-rejection cases).
2. Decorator module + tests (per-commit, per-release, idempotency, boolean discipline).
3. Wire two-pass into `renderChangelog`. Refactor ordering so cleaned toml is
   the only one written to disk. Update `computeBumpedVersion` callers if needed.
4. Shared schema: add `mockedRemotes`. Update render route.
5. Monaco hover provider + `azure_devops` subsection fix. Frontend badge.
6. Snapshot tests covering the full flow.
7. Docs note: short README paragraph + the hover text itself is the user-facing doc.

---

## Risks & mitigations (carried forward, plus new)

- **Pass-1 latency.** Bounded; `--offline` + cached temp repo. Add a
  perf log line so regressions are visible.
- **Fixture drift** as git-cliff evolves. Mitigation: snapshot tests against
  a pinned git-cliff (the submodule version) ensure regressions surface as
  test failures.
- **Scanner brittleness.** Mitigation: scanner regression tests in the
  critique list. If false positives appear in real configs, swap to a TOML
  parser; that's a localized change in `cliff-toml-remote.ts`.
- **`--bumped-version` semantics with mocked remote.** Mitigation: bumped
  version is computed against the *cleaned* toml, which has a synthetic
  `[remote.<kind>]` with fixed mock owner/repo. The bumped-version logic
  doesn't reference remote data anyway (it only reads `bump.*` config), but
  the test exists to catch regressions.
- **User confusion: "why does my GitHub PR show #1 here but #427 on real
  GitHub?"** Mitigation: the hover provider message and the
  `mockedRemotes` badge both make the mocking explicit.

---

## Out of scope (deliberately)

- Letting the user supply their *own* mock fixtures via the UI.
- Reading the user's real GitHub PRs via a client-side fetch (avoids any
  server-side proxying or token handling).
- Caching pass 1 output across renders (release/commit IDs change with
  every edit; cache invalidation would dominate).
- Fixing the pre-existing scanner brittleness in
  `extractBumpInitialTag` / `cliffTomlContainsSecret`. The new scanner
  handles triple-quote state correctly; backporting that improvement to
  the existing scanners is a separate cleanup.
