# Unit 1 — Backend Gist API

All backend changes required to proxy GitHub Gist operations.

**Depends on:** nothing
**Required by:** all frontend Gist units

---

## Phase 1: Add `gist` OAuth Scope

**File:** `apps/api/src/services/github-oauth.ts`

Change `scope` from `"read:user"` to `"read:user gist"`:

```diff
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
-   scope: "read:user",
+   scope: "read:user gist",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
```

**Impact:** Existing sessions that only have `read:user` will have an access token
without the `gist` scope. The token resolution logic (Phase 3) handles this gracefully.
Users re-logging in will automatically receive the new scope.

**Verify:** No other code changes needed — `exchangeCodeForToken` and `fetchGitHubUser`
already return and store `accessToken` in `SessionData`.

---

## Phase 2: GitHub Gist Service

Create **`apps/api/src/services/gist.ts`**:

```ts
const GITHUB_API = "https://api.github.com";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GistFileEntry {
  filename: string;
  content?: string;
  size: number;
  raw_url: string;
  truncated: boolean;
}

export interface GistResponse {
  id: string;
  description: string;
  public: boolean;
  created_at: string;
  updated_at: string;
  files: Record<string, GistFileEntry>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "cliff-notes.dev",
  };
}

async function checkResponse(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GistApiError(res.status, context, body);
  }
}

export class GistApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly context: string,
    public readonly detail: string,
  ) {
    super(`GitHub Gist API error (${statusCode}) during ${context}: ${detail}`);
    this.name = "GistApiError";
  }
}

// ── API wrappers ─────────────────────────────────────────────────────────────

export async function getGist(
  token: string,
  gistId: string,
): Promise<GistResponse> {
  const res = await fetch(`${GITHUB_API}/gists/${encodeURIComponent(gistId)}`, {
    headers: githubHeaders(token),
  });
  await checkResponse(res, "getGist");
  return res.json() as Promise<GistResponse>;
}

export async function createGist(
  token: string,
  description: string,
  isPublic: boolean,
  files: Record<string, string>, // filename → content
): Promise<GistResponse> {
  const filesPayload: Record<string, { content: string }> = {};
  for (const [name, content] of Object.entries(files)) {
    filesPayload[name] = { content };
  }

  const res = await fetch(`${GITHUB_API}/gists`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ description, public: isPublic, files: filesPayload }),
  });
  await checkResponse(res, "createGist");
  return res.json() as Promise<GistResponse>;
}

export async function updateGist(
  token: string,
  gistId: string,
  // null value = delete that file from the gist
  files: Record<string, string | null>,
): Promise<GistResponse> {
  const filesPayload: Record<string, { content: string } | null> = {};
  for (const [name, content] of Object.entries(files)) {
    filesPayload[name] = content === null ? null : { content };
  }

  const res = await fetch(`${GITHUB_API}/gists/${encodeURIComponent(gistId)}`, {
    method: "PATCH",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ files: filesPayload }),
  });
  await checkResponse(res, "updateGist");
  return res.json() as Promise<GistResponse>;
}

/** Fetch the raw content of a truncated gist file. */
export async function getRawGistFile(
  token: string,
  rawUrl: string,
): Promise<string> {
  // raw_url is served from gist.githubusercontent.com — still needs auth
  const res = await fetch(rawUrl, {
    headers: githubHeaders(token),
  });
  await checkResponse(res, "getRawGistFile");
  return res.text();
}
```

---

## Phase 3: Token Resolution Helper

Create **`apps/api/src/lib/resolve-gist-token.ts`**:

```ts
import type { FastifyRequest } from "fastify";
import { getSession } from "./session-store.js";

const SESSION_COOKIE = "sid";
const PAT_HEADER = "x-github-token";

export class GistAuthError extends Error {
  constructor(public readonly reason: "unauthenticated" | "no_gist_scope") {
    super(reason === "unauthenticated"
      ? "No GitHub token available. Log in or provide a PAT via X-GitHub-Token."
      : "Your GitHub login does not have the 'gist' OAuth scope. Re-login or provide a PAT.");
    this.name = "GistAuthError";
  }
}

/**
 * Resolves the GitHub token to use for a Gist API call.
 * Priority: X-GitHub-Token header > OAuth session token.
 *
 * Does NOT validate whether the token actually has gist scope — that check
 * is surfaced by the GitHub API returning 403, which is forwarded to the client.
 */
export function resolveGistToken(req: FastifyRequest): string {
  // 1. PAT from request header (client sends this for non-OAuth users)
  const headerToken = (req.headers as Record<string, string>)[PAT_HEADER];
  if (headerToken && typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  // 2. OAuth token from server session
  const sid = (req.cookies as Record<string, string>)[SESSION_COOKIE];
  if (sid) {
    const session = getSession(sid);
    if (session?.accessToken) {
      return session.accessToken;
    }
  }

  throw new GistAuthError("unauthenticated");
}
```

---

## Phase 4: Gist Proxy Routes

Create **`apps/api/src/routes/gist.ts`**:

```ts
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";
import {
  createGist,
  getGist,
  getRawGistFile,
  GistApiError,
  updateGist,
} from "../services/gist.js";
import {
  GistAuthError,
  resolveGistToken,
} from "../lib/resolve-gist-token.js";

// ── Zod schemas (inline — no external import needed) ──────────────────────

import { z } from "zod";

const createGistBodySchema = z.object({
  description: z.string().max(256).default(""),
  public: z.boolean().default(false),
  files: z.record(z.string().min(1).max(255), z.string().max(512 * 1024)), // max 512 KB per file
});

const updateGistBodySchema = z.object({
  files: z.record(
    z.string().min(1).max(255),
    z.union([z.string().max(512 * 1024), z.null()]),
  ),
});

const gistIdParamSchema = z.object({
  gistId: z.string().regex(/^[a-f0-9]{20,40}$/i, "Invalid gist ID format"),
});

const rawFileBodySchema = z.object({
  rawUrl: z.string().url().startsWith("https://gist.githubusercontent.com/"),
});

// ── Route plugin ──────────────────────────────────────────────────────────

export const gistRoutes = (_config: AppConfig): FastifyPluginAsync => {
  return async (app) => {
    // ── Error handler shared across all gist routes ───────────────────────
    function handleGistError(err: unknown, reply: import("fastify").FastifyReply) {
      if (err instanceof GistAuthError) {
        const statusCode = err.reason === "unauthenticated" ? 401 : 403;
        return reply.code(statusCode).send({ error: err.message });
      }
      if (err instanceof GistApiError) {
        // Forward 404 and 403 from GitHub as-is; wrap others as 502
        const code = [403, 404, 422].includes(err.statusCode) ? err.statusCode : 502;
        return reply.code(code).send({
          error: `GitHub API error: ${err.detail || err.message}`,
        });
      }
      app.log.error(err, "Unexpected error in gist route");
      return reply.code(500).send({ error: "Internal server error" });
    }

    // ── GET /gist/:gistId ─────────────────────────────────────────────────
    app.get<{ Params: { gistId: string } }>("/gist/:gistId", async (req, reply) => {
      try {
        const { gistId } = gistIdParamSchema.parse(req.params);
        const token = resolveGistToken(req);
        const gist = await getGist(token, gistId);
        return reply.send(gist);
      } catch (err) {
        return handleGistError(err, reply);
      }
    });

    // ── POST /gist ────────────────────────────────────────────────────────
    app.post("/gist", async (req, reply) => {
      try {
        const body = createGistBodySchema.parse(req.body);
        const token = resolveGistToken(req);
        const gist = await createGist(token, body.description, body.public, body.files);
        return reply.code(201).send(gist);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });

    // ── PATCH /gist/:gistId ───────────────────────────────────────────────
    app.patch<{ Params: { gistId: string } }>("/gist/:gistId", async (req, reply) => {
      try {
        const { gistId } = gistIdParamSchema.parse(req.params);
        const body = updateGistBodySchema.parse(req.body);
        const token = resolveGistToken(req);
        const gist = await updateGist(token, gistId, body.files);
        return reply.send(gist);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });

    // ── POST /gist/raw ────────────────────────────────────────────────────
    // Proxy fetching of truncated gist file content. The rawUrl must be from
    // gist.githubusercontent.com (validated above) to prevent SSRF.
    app.post("/gist/raw", async (req, reply) => {
      try {
        const { rawUrl } = rawFileBodySchema.parse(req.body);
        const token = resolveGistToken(req);
        const content = await getRawGistFile(token, rawUrl);
        return reply.type("text/plain").send(content);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });
  };
};
```

> **Security note:** The `rawUrl` in `POST /gist/raw` is validated to start with
> `https://gist.githubusercontent.com/` to prevent server-side request forgery.
> Zod's `z.string().url().startsWith(...)` is applied before the fetch is made.

---

## Phase 5: Register Routes in Server

**File:** `apps/api/src/server.ts`

```diff
  import { authRoutes } from "./routes/auth.js";
+ import { gistRoutes } from "./routes/gist.js";

  // inside buildServer, within the /api prefix block:
      await api.register(authRoutes(config));
+     await api.register(gistRoutes(config));
```

Also add `PATCH` to the CORS `methods` list (currently only `["GET", "POST", "OPTIONS"]`):

```diff
  await app.register(cors, {
    origin: config.corsOrigins,
-   methods: ["GET", "POST", "OPTIONS"],
+   methods: ["GET", "POST", "PATCH", "OPTIONS"],
    credentials: true,
  });
```

---

## Phase 6: Frontend API Client

**File:** `apps/web/src/lib/api.ts` — add Gist methods to the existing `api` object.

### New types (add near top of file):

```ts
export interface GistFileEntry {
  filename: string;
  size: number;
  raw_url: string;
  truncated: boolean;
  content?: string;
}

export interface GistData {
  id: string;
  description: string;
  public: boolean;
  created_at: string;
  updated_at: string;
  files: Record<string, GistFileEntry>;
}
```

### New helper (add near top of file):

```ts
/** Returns headers with an optional PAT added. */
function gistHeaders(pat: string | null): HeadersInit {
  const h: Record<string, string> = {};
  if (pat) h["X-GitHub-Token"] = pat;
  return h;
}
```

### New `api` methods:

```ts
export const api = {
  // ... existing methods ...

  async getGist(gistId: string, pat?: string | null): Promise<GistData> {
    return get<GistData>(`/gist/${encodeURIComponent(gistId)}`, gistHeaders(pat ?? null));
  },

  async createGist(opts: {
    description: string;
    isPublic: boolean;
    files: Record<string, string>;
    pat?: string | null;
  }): Promise<GistData> {
    return post<{ description: string; public: boolean; files: Record<string, string> }, GistData>(
      "/gist",
      { description: opts.description, public: opts.isPublic, files: opts.files },
      gistHeaders(opts.pat ?? null),
    );
  },

  async updateGist(
    gistId: string,
    files: Record<string, string | null>,
    pat?: string | null,
  ): Promise<GistData> {
    return patch<{ files: Record<string, string | null> }, GistData>(
      `/gist/${encodeURIComponent(gistId)}`,
      { files },
      gistHeaders(pat ?? null),
    );
  },

  async getRawGistFile(rawUrl: string, pat?: string | null): Promise<string> {
    return post<{ rawUrl: string }, string>(
      "/gist/raw",
      { rawUrl },
      gistHeaders(pat ?? null),
    );
  },
};
```

> Note: the existing `api.ts` has `post<TReq, TRes>` and `get<TRes>` helpers. A `patch` helper
> needs to be added (identical to `post` but with `method: "PATCH"`).

### `patch` helper to add:

```ts
async function patch<TReq, TRes>(
  path: string,
  body: TReq,
  extraHeaders?: HeadersInit,
): Promise<TRes> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return res.json() as Promise<TRes>;
}
```

---

## Verification Checklist

- [ ] `pnpm --filter api typecheck` passes
- [ ] `GET /api/gist/:id` returns GitHub response (with valid token)
- [ ] `GET /api/gist/:id` returns `401` with no token and no session
- [ ] `POST /api/gist` creates a gist and returns `201`
- [ ] `PATCH /api/gist/:id` updates file content
- [ ] `POST /api/gist/raw` with non-`gist.githubusercontent.com` URL returns `400`
- [ ] Existing auth tests still pass
