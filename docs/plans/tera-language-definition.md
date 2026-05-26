# Plan: Tera language definition for the cliff.toml editor

> Status: design only. No code changes in this plan.

## Goal

A reusable language definition for `cliff.toml` with embedded Tera templates that gives the user discoverable completion (variables + filters + built-ins), hover docs, and snippets — packaged in a way the planned VSCode extension can consume unchanged.

## Decisions captured from design Q&A

| Decision | Choice |
|---|---|
| Language features | Member autocomplete, hover docs, filter/built-in completion, snippets |
| Schema source | Hand-written JSON Schemas bundled in a shared package |
| Profile handling | Detect active profiles from cliff.toml content |
| Packaging | TextMate grammar + completion JSON (VSCode-extension-style contribution) |
| Package location | New workspace package `packages/cliff-tera-lang/` |
| Tokenizer | Replace Monarch with TextMate now |
| Profile detection rules | Table presence in cliff.toml (`[remote.github]` etc.) |
| Delivery | Plan first, then build in a single PR with phased commits |
| Package name | `@cliff-notes/tera-lang` |
| Custom schema extensions | Allowed (`x-tera-example`, `x-tera-source`) |
| Bundle budget | ~150 KB additional WASM is acceptable |

## New workspace package: `packages/cliff-tera-lang/`

This is the first package under `packages/` in the workspace. `pnpm-workspace.yaml` must be updated to include `packages/*`.

```
packages/cliff-tera-lang/
├── package.json                              # name: @cliff-notes/tera-lang
├── tsconfig.json
├── grammars/
│   └── cliff-toml.tmLanguage.json            # TextMate grammar: TOML + embedded Tera in triple-quoted strings
├── schemas/
│   ├── context.base.schema.json              # Always-available: version, commits[], release, timestamp, repository, etc.
│   ├── context.conventional.schema.json      # Adds: commit.group, commit.scope, commit.breaking, footers[]
│   ├── context.github.schema.json            # Adds: github.*, commit.github.pr_number, etc.
│   ├── context.gitlab.schema.json
│   ├── context.gitea.schema.json
│   ├── context.bitbucket.schema.json
│   ├── context.azure_devops.schema.json
│   └── context.submodule.schema.json
├── snippets/
│   └── tera.snippets.json                    # VSCode-style snippets: for-commits, if-breaking, group-by-type, etc.
├── data/
│   ├── tera-builtins.json                    # Filters, tests, functions, tags from https://keats.github.io/tera/docs/#built-ins
│   └── cliff-fields.json                     # cliff.toml top-level keys (ported from monaco-cliff-toml.ts)
├── src/
│   ├── index.ts                              # Public re-exports
│   ├── profile-detect.ts                     # Parses cliff.toml text → Set<ProfileId>
│   ├── schema-resolve.ts                     # Schema-walking helpers: completionsAt(path), hoverFor(path)
│   ├── builtins.ts                           # Typed wrapper over data/tera-builtins.json
│   └── scope.ts                              # Cursor-context inference: are we in `{% %}`/`{{ }}`/after `|`/inside `for x in y`?
└── README.md
```

### How the JSON Schemas describe variables (not just validate)

JSON Schema is built for validation, but we use these fields as the data backbone:

- `properties.<field>.description` — shown in hover and completion detail
- `properties.<field>.type` and `items.$ref` — drives walking (`commit.author.email`)
- Custom annotation `x-tera-example` — short example shown in hover (`commit.message → "feat: add foo"`)
- Custom annotation `x-tera-source` — which profile this field came from (for the `(GitHub)` etc. annotations)

Profiles compose via `allOf: [ { $ref: "base" }, { $ref: "github" } ]` at resolve time, not in the source files. The `schema-resolve.ts` module is the only place that knows how to merge them.

## Profile detection

`profile-detect.ts` reads cliff.toml text (no AST needed — line-regex on `[remote.<x>]` table headers is enough):

| TOML signal | Profile activated |
|---|---|
| (always) | `base`, `conventional` |
| `[remote.github]` | `github` |
| `[remote.gitlab]` | `gitlab` |
| `[remote.gitea]` | `gitea` |
| `[remote.bitbucket]` | `bitbucket` |
| `[remote.azure_devops]` or `[remote.azuredevops]` | `azure_devops` |
| `recurse_submodules = true` under `[git]` | `submodule` |

Re-run on every edit (debounced ~150ms). Cache the in-memory profile set on the Monaco model; invalidate when the model contents change.

## Web app changes ([apps/web](apps/web/))

### Replace Monarch with TextMate

- Add deps: `monaco-editor-textmate`, `monaco-textmate`, `vscode-oniguruma` (WASM)
- Drop the Monarch `setMonarchTokensProvider` block from [monaco-cliff-toml.ts](apps/web/src/lib/monaco-cliff-toml.ts)
- Load the WASM at app bootstrap (one-time async init); register the grammar from `@cliff-notes/tera-lang`
- **Bundle cost:** ~150 KB for onigasm WASM (lazy-loaded, not in the critical path). Confirm actual size and call it out before merging.

### New providers (all consume `@cliff-notes/tera-lang`)

- `registerTeraCompletion(monaco)` — fires inside `{{ }}` / `{% %}` / triple-string contexts:
  - After identifier + `.` → walk schema from the resolved root type
  - After `|` → filter list
  - After `is ` → test list
  - Inside `{% for X in Y %}` → bind `X` to the element type of `Y` for the loop body
  - Bare cursor in a Tera scope → variables in scope + functions + tags
- `registerTeraHover(monaco)` — same scope inference; returns markdown with description + type + example
- `registerTeraSnippets(monaco)` — completion items from `snippets/tera.snippets.json`

### Refactor split

`monaco-cliff-toml.ts` becomes a thin assembler. Implementation moves to:

- `apps/web/src/lib/monaco/textmate-bootstrap.ts` — WASM init + grammar registration
- `apps/web/src/lib/monaco/tera-providers.ts` — completion / hover / snippets wiring
- TOML key/value completion (the existing `provideCompletionItems` for top-level cliff fields) stays in `monaco-cliff-toml.ts` and consumes `cliff-fields.json` from the package

## Built-in Tera reference (`data/tera-builtins.json`)

Sourced from <https://keats.github.io/tera/docs/#built-ins>:

- **Filters** (~40): `upper`, `lower`, `capitalize`, `title`, `replace`, `truncate`, `trim`, `length`, `reverse`, `sort`, `slice`, `group_by`, `filter`, `map`, `concat`, `join`, `default`, `date`, `as_str`, `int`, `float`, `round`, `striptags`, `unique`, `urlencode`, `escape`, `safe`, `json_encode`, `pluralize`, `wordcount`, etc.
- **Tests**: `defined`, `undefined`, `string`, `number`, `divisibleby`, `iterable`, `odd`, `even`, `matching`, `containing`, `starting_with`, `ending_with`
- **Functions**: `range`, `now`, `throw`, `get_random`, `get_env`
- **Tags**: `if`/`elif`/`else`/`endif`, `for`/`endfor`, `block`/`endblock`, `extends`, `include`, `import`, `macro`, `set`, `filter`, `raw`

Each entry: `{ name, signature, description, example, url }`.

## Custom JSON Schema extensions

We use two non-standard keywords (allowed by JSON Schema spec via the `x-` convention):

| Keyword | Purpose | Example |
|---|---|---|
| `x-tera-example` | Short example string shown in hover docs | `"feat: add foo"` |
| `x-tera-source` | Profile this field originates from, used to annotate completion items | `"github"` |

## Verification

After each phase:

1. `pnpm --filter @cliff-notes/tera-lang test` — unit tests for `profile-detect`, `schema-resolve`, `scope`
2. `pnpm --filter web typecheck && pnpm --filter web build` — bundle compiles, grammar loads
3. Manual: open the cliff editor in a browser, verify:
   - Typing `{{ commit.` in a `body` template shows `group, scope, message, author, ...`
   - Adding `[remote.github]` then `{{ commit.github.` shows `pr_number, pr_labels`
   - Hover on `commits` shows array description
   - `{% for` triggers a snippet expansion
   - Syntax highlighting still works identically to today

## Out of scope

- Tera diagnostics (red squiggles on undefined variables) — would need a real parser
- TOML schema validation beyond what's already there
- Language Server / LSP — the package exposes plain functions, no server runtime
- Auto-import / refactoring

## Delivery (single PR, commit order so it's reviewable)

1. Scaffold `packages/cliff-tera-lang/` with empty schemas + `package.json` wired into the workspace; update `pnpm-workspace.yaml` to include `packages/*`
2. Author JSON Schemas + `tera-builtins.json` + snippets
3. Implement `profile-detect.ts`, `scope.ts`, `schema-resolve.ts` + unit tests
4. Author `cliff-toml.tmLanguage.json` (port the current Monarch rules)
5. Wire TextMate loader into the web app; remove Monarch
6. Wire completion / hover / snippets providers
7. Manual browser verification + screenshots
