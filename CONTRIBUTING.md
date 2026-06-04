# Contributing to cliff-notes

Thanks for your interest in contributing! cliff-notes is an interactive playground for [git-cliff](https://git-cliff.org) configurations. This guide covers everything you need to get going.

## Prerequisites

- Node 25+ (the repo's `.nvmrc` pins `25.x`)
- pnpm 11+ (`corepack enable && corepack prepare pnpm@11.5.0 --activate`)
- `git` and [`git-cliff`](https://git-cliff.org/docs/installation) binaries on `PATH` — required for the API to render end-to-end
- (Optional) [Docker](https://www.docker.com/) for the production container target
- (Optional) [Task](https://taskfile.dev/) for the convenience tasks defined in `Taskfile.yml`

The included [devcontainer](.devcontainer/devcontainer.json) ships Node, pnpm, `git`, and `git-cliff` preinstalled — if you have VS Code + the Dev Containers extension, "Reopen in Container" is the fastest path.

## Getting Started

1. Fork the repository on GitHub, then clone your fork:

   ```bash
   git clone https://github.com/<your-username>/cliff-notes.git
   cd cliff-notes
   ```

2. Install dependencies (this also builds the shared package via `postinstall`):

   ```bash
   pnpm install
   ```

3. Start the dev servers:

   ```bash
   pnpm dev
   ```

   - Web: <http://localhost:5173>
   - API: <http://localhost:3001>

## Project Layout

```tree
apps/
  api/              Fastify backend — shells out to `git-cliff` and `git`
  web/              Vite + React + Tailwind + shadcn/ui frontend with Monaco editor
packages/
  shared/           Zod schemas, shared types, conventional-commit generator
tests/
  e2e/              Playwright suite
docs/               Jekyll site sources
vscode-extension/   VS Code extension sources
.github/            Workflows, linter configs, dependabot
```

The shared package is built before any other workspace runs (`pnpm build:shared`), so its TypeScript output is what `apps/api` and `apps/web` consume — not its source.

## Development Scripts

All scripts are run from the repo root via pnpm.

| Script                | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `pnpm install`        | Install dependencies and build `packages/shared`                     |
| `pnpm dev`            | Run web + api in parallel (rebuilds shared first)                    |
| `pnpm build`          | Build every workspace                                                |
| `pnpm build:shared`   | Rebuild only `packages/shared` (do this after editing shared schemas) |
| `pnpm lint`           | Lint every workspace                                                 |
| `pnpm typecheck`      | Typecheck every workspace                                            |
| `pnpm test`           | Run unit + integration tests (excludes e2e)                          |
| `pnpm test:coverage`  | Same as `pnpm test`, emits lcov to `coverage/`                       |
| `pnpm test:junit`     | Same as `pnpm test`, emits JUnit XML to `reports/`                   |
| `pnpm test:e2e`       | Run Playwright suite in `tests/e2e`                                  |
| `pnpm clean`          | Remove build output, `coverage/`, and `reports/`                     |

You can also target a single workspace, e.g. `pnpm --filter @cliff-notes/api run test`.

### Task shortcuts

If you have [Task](https://taskfile.dev) installed:

| Task                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| `task cliff-notes/dev`     | `pnpm install` + `pnpm run dev`              |
| `task docker/build`        | Build the production Docker image            |
| `task docker/run`          | Run the production image on port 3001        |
| `task cliff-notes/docker`  | Build then run the production image          |

## Running Tests

Always start with a clean shared build, otherwise the api/web workspaces will consume stale types:

```bash
pnpm build:shared
```

### Unit + integration

```bash
pnpm test                 # all workspaces except e2e
pnpm --filter @cliff-notes/api  run test
pnpm --filter @cliff-notes/web  run test
pnpm --filter @cliff-notes/shared run test
```

### Coverage and CI reports

```bash
pnpm test:coverage        # lcov under coverage/
pnpm test:junit           # JUnit XML under reports/
```

### End-to-end (Playwright)

```bash
pnpm test:e2e
```

Playwright either drives long-running `pnpm dev` services or starts them itself via its `webServer` config — check [tests/e2e/playwright.config.ts](tests/e2e/playwright.config.ts) for the active setup.

## Production Container

A single multi-stage `Dockerfile` builds everything; the API serves the SPA on one port.

```bash
docker build -t cliff-notes .
docker run --rm -p 3001:3001 cliff-notes
# open http://localhost:3001
```

## Code Style & Linting

- TypeScript everywhere — keep `pnpm typecheck` clean before pushing.
- Run `pnpm lint` before opening a PR.
- Editor settings are defined in [.editorconfig](.editorconfig) and [.vscode/settings.json](.vscode/settings.json) — please respect them rather than reformatting unrelated files.
- The [.github/linters/](.github/linters/) directory holds the configs used by the Super-Linter step in CI (markdown, YAML, shell, ESLint, codespell, gitleaks, etc.). If your PR fails a linter check, the matching config there is the source of truth.

## Commit Messages — Conventional Commits Required

This project is a playground for `git-cliff`, which itself parses [Conventional Commits](https://www.conventionalcommits.org/). Eating our own dog food matters here: the changelog generated from this repo's history is a demo of the tool.

Format:

```text
<type>(<optional scope>): <short summary>

<optional body>

<optional footer(s)>
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:

```text
feat(web): add tag-range picker to the inspect panel
fix(api): reject clone URLs with embedded credentials
docs: clarify devcontainer prerequisites
chore(deps): bump fastify to 4.28.0
```

Breaking changes: append `!` after the type/scope, **and** add a `BREAKING CHANGE:` footer.

```text
feat(api)!: rename /api/render payload field `toml` to `cliffToml`

BREAKING CHANGE: clients must send `cliffToml` instead of `toml`.
```

The [cliff.toml](cliff.toml) at the repo root is what generates the changelog — if you're unsure how your commit will appear, run `git-cliff --unreleased` locally.

## Pull Request Workflow

1. Create a feature branch off `main`:

   ```bash
   git checkout -b feat/your-change
   ```

2. Make focused commits using Conventional Commits.
3. Before pushing, run the local gate:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

4. Push your branch and open a pull request against `main`.
5. In the PR description, include:
   - **What** changed and **why**.
   - Screenshots / GIFs for any UI change.
   - Notes on schema changes in `packages/shared` (these ripple to both api and web).
6. CI runs the [PR Review workflow](.github/workflows/pr-review.yml) — Super-Linter, build, and tests. Keep your branch green.
7. Address review feedback with additional commits (don't force-push during review unless asked); a maintainer will squash or merge as appropriate.

## Reporting Issues

- **Bugs:** open a [GitHub issue](https://github.com/camalot/cliff-notes/issues/new) with reproduction steps, expected vs. actual behavior, your OS / Node / pnpm versions, and — if relevant — the `cliff.toml` and a minimal commit list that triggers the problem.
- **Feature requests:** open an issue describing the use case first. For larger changes, please discuss before sending a PR so we can agree on scope.
- **Security vulnerabilities:** please do **not** file a public issue. Use GitHub's [private security advisory](https://github.com/camalot/cliff-notes/security/advisories/new) flow instead.

## License

By contributing to this repository, you agree that your contributions are licensed under the project's [LICENSE](LICENSE).
