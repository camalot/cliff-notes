# Environment Variables

All environment variables are consumed by **`apps/api`**. The web, shared, and tera-lang packages have no env var dependencies — the web app communicates with the API via a relative `/api` path.

The API loads `.env` and `.secrets` files from the workspace root automatically at startup (see [`apps/api/src/lib/env.ts`](../apps/api/src/lib/env.ts)). Existing `process.env` values are never overwritten, so shell exports take precedence over file values.

---

## Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | TCP port the API server listens on. |
| `HOST` | `0.0.0.0` | Hostname/interface the server binds to. |
| `LOG_LEVEL` | `info` | Fastify logger level. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`. |
| `NODE_ENV` | — | When set to `production`, session cookies are marked `Secure`. |

## Static / SPA

| Variable | Default | Description |
|---|---|---|
| `STATIC_DIR` | — | Absolute path to the built web app (`apps/web/dist`). When set, the API serves the SPA at `/`. Omit in dev (Vite handles it). |

## Paths

| Variable | Default | Description |
|---|---|---|
| `CONFIGS_DIR` | `<workspace>/.cliff/tomls` | Directory containing bundled `.toml` config presets shown in the UI. |
| `REMOTE_MOCKS_DIR` | `<workspace>/.cliff/context` | Directory containing fixture JSON files used as remote-context mocks. |
| `GIT_CLIFF_BIN` | `git-cliff` | Path to the `git-cliff` binary. |
| `GIT_BIN` | `git` | Path to the `git` binary. |

## Limits

| Variable | Default | Description |
|---|---|---|
| `CLONE_TIMEOUT_MS` | `30000` | Milliseconds before a repository clone is aborted. |
| `RENDER_TIMEOUT_MS` | `15000` | Milliseconds before a changelog render is aborted. |
| `MAX_CLONED_COMMITS` | `1000` | Maximum number of commits fetched when cloning a repository. |

## CORS

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins. The first entry is also used as the default `APP_ORIGIN`. |
| `APP_ORIGIN` | first `CORS_ORIGINS` entry | Origin of the SPA, used as the `postMessage` target and validated against the CORS allowlist. |

## Authentication

Authentication is disabled by default. Set `AUTH_ENABLED=true` and provide all required variables below to enable GitHub OAuth.

| Variable | Default | Required | Description |
|---|---|---|---|
| `AUTH_ENABLED` | `false` | No | Set to the string `"true"` to enable GitHub OAuth. All `/api/auth/*` routes return `501` when disabled. |
| `GITHUB_CLIENT_ID` | — | When `AUTH_ENABLED=true` | GitHub OAuth App client ID. |
| `GITHUB_CLIENT_SECRET` | — | When `AUTH_ENABLED=true` | GitHub OAuth App client secret. |
| `GITHUB_CALLBACK_URL` | `http://localhost:300/api/auth/github/callback` | No | Full URL GitHub redirects to after authorization. Must match the OAuth App settings. In dev, point this at the Vite dev server so session cookies land on the correct origin. |
| `SESSION_SECRET` | — | When `AUTH_ENABLED=true` | Random string (≥ 32 characters) used to sign session cookies. |
| `SESSION_TTL_SECONDS` | `604800` (7 days) | No | Sliding session lifetime in seconds. |

---

## Example `.env`

```dotenv
# Server
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=development

# CORS (dev: Vite dev server)
CORS_ORIGINS=http://localhost:5173

# Auth (remove or set to false to disable)
AUTH_ENABLED=true
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CALLBACK_URL=http://localhost:5173/api/auth/github/callback
```

## Example `.secrets`

```dotenv
GITHUB_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=at_least_32_random_characters_here
```

> The API loads all `.env` and `.secrets` files from the workspace root. Keeping secrets in a separate `.secrets` file makes it easier to exclude them from version control.
