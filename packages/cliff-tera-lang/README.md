# @cliff-notes/tera-lang

Language definition for `cliff.toml` files with embedded [Tera](https://keats.github.io/tera/) templates. Packaged so the same artifacts can be consumed by:

- The Monaco editor in `apps/web` (today)
- A future VSCode extension for git-cliff

## What's in the box

| Path | Purpose |
|---|---|
| `grammars/cliff-toml.tmLanguage.json` | TextMate grammar for TOML with embedded Tera in triple-quoted strings |
| `schemas/context.*.schema.json` | JSON Schemas describing the variables git-cliff exposes to Tera, per profile (base, conventional, github, gitlab, gitea, bitbucket, azure_devops, submodule) |
| `snippets/tera.snippets.json` | VSCode-style snippets for common Tera constructs (`for`, `if`, etc.) |
| `data/tera-builtins.json` | Tera filters, tests, functions, and tags from the official docs |
| `data/cliff-fields.json` | Top-level cliff.toml configuration keys |
| `src/` | TypeScript helpers: profile detection, cursor-scope inference, schema walking |

## Custom JSON Schema extensions

Two non-standard `x-*` keywords are used as the data backbone for completion and hover:

- `x-tera-example` — short example string shown in hover docs
- `x-tera-source` — profile this field originates from, used to annotate completion items

## Consuming from Monaco

```ts
import { detectProfiles, completionsAt, hoverFor } from "@cliff-notes/tera-lang";
import grammar from "@cliff-notes/tera-lang/grammars/cliff-toml.tmLanguage.json";
```
