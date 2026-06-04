# cliff-notes

Interactive playground for [git-cliff](https://git-cliff.org) configurations. Edit a `cliff.toml`, supply or load tags and commits, and render the resulting changelog markdown — all in a browser, against a real `git-cliff` binary on the server.

## Stack

- **Web:** Vite + React + TypeScript + Tailwind + shadcn/ui + Monaco
- **API:** Node 20+ + TypeScript + Fastify, shells out to `git-cliff` and `git`
- **Shared:** Zod schemas reused by both sides
- **Language:** Language definition
- **Tests:** Vitest (web + api) with lcov + JUnit XML reporters; Playwright for E2E
- **Container:** single multi-stage Dockerfile, API serves the SPA from one port

## Layout

```tree
apps/
  api/        Fastify backend
  web/        Vite + React frontend
packages/
  shared/     Zod schemas, types, random conventional commit generator
tests/
  e2e/        Playwright suite
```

## Prerequisites

- Node 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- `git` and `git-cliff` binaries on PATH for the API to run end-to-end

The included devcontainer already provides all three.

## Development

```sh
pnpm install
pnpm dev              # runs web + api in parallel
```

- Web: http://localhost:5173
- API: http://localhost:3001

## Testing

```sh
pnpm typecheck
pnpm test             # unit + integration
pnpm test:coverage    # lcov reports under coverage/
pnpm test:junit       # JUnit XML reports under reports/
pnpm test:e2e         # Playwright (requires services running, or use playwright webServer)
```

## Production container

```sh
docker build -t cliff-notes .
docker run --rm -p 3001:3001 cliff-notes
# open http://localhost:3001
```

## Endpoints

| Method | Path                  | Purpose                                                                 |
| ------ | --------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/render`         | `{ cliffToml, tags, commits }` → rendered changelog markdown.           |
| POST   | `/api/repo/inspect`   | `{ url, range? }` → tags, commits, and (if present) `cliff.toml`.       |
| POST   | `/api/commits/random` | `{ type, breaking?, count? }` → synthesized conventional commits.       |
| GET    | `/api/health`         | Liveness probe.                                                         |
| GET    | `/api/healthz`        | Liveness probe.                                                         |
| GET    | `/api/ready`          | Readiness probe.                                                        |

Allowed clone hosts: `github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`.
