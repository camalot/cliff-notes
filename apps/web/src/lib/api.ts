import type {
  RenderRequest,
  RenderResponse,
  RepoInspectRequest,
  RepoInspectResponse,
  RandomCommitRequest,
  RandomCommitResponse,
  ErrorResponse,
} from "@cliff-notes/shared";
import { getProjectId } from "./project-id";

const API_BASE = "/api";
export const PROJECT_ID_HEADER = "X-Project-Id";

export interface TomlEntry {
  id: string;
  label: string;
  sort?: number;
  description?: string;
}

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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<TReq, TRes>(path: string, body: TReq, extraHeaders?: HeadersInit): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [PROJECT_ID_HEADER]: getProjectId(),
      ...extraHeaders,
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | undefined;
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as ErrorResponse;
      message = data.error ?? message;
      detail = data.detail;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(message, res.status, detail);
  }
  return (await res.json()) as TRes;
}

async function get<TRes>(path: string, extraHeaders?: HeadersInit): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: extraHeaders,
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as ErrorResponse;
      message = data.error ?? message;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as TRes;
}

async function getText(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as ErrorResponse;
      message = data.error ?? message;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(message, res.status);
  }
  return res.text();
}

async function patch<TReq, TRes>(path: string, body: TReq, extraHeaders?: HeadersInit): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | undefined;
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as ErrorResponse;
      message = data.error ?? message;
      detail = data.detail;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(message, res.status, detail);
  }
  return (await res.json()) as TRes;
}

async function getPlainText(rawUrl: string, extraHeaders?: HeadersInit): Promise<string> {
  const res = await fetch(`${API_BASE}/gist/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    credentials: "include",
    body: JSON.stringify({ rawUrl }),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as ErrorResponse;
      message = data.error ?? message;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(message, res.status);
  }
  return res.text();
}

/** Returns headers with an optional PAT added. */
function gistHeaders(pat: string | null): HeadersInit {
  const h: Record<string, string> = {};
  if (pat) h["X-GitHub-Token"] = pat;
  return h;
}

export const api = {
  render: (body: RenderRequest) => post<RenderRequest, RenderResponse>("/render", body),
  inspectRepo: (body: RepoInspectRequest) =>
    post<RepoInspectRequest, RepoInspectResponse>("/repo/inspect", body),
  randomCommits: (body: RandomCommitRequest) =>
    post<RandomCommitRequest, RandomCommitResponse>("/commits/random", body),
  getTomls: () => get<TomlEntry[]>("/tomls"),
  getToml: (id: string) => getText(`/tomls/${encodeURIComponent(id)}`),

  getGist: (gistId: string, pat?: string | null): Promise<GistData> =>
    get<GistData>(`/gist/${encodeURIComponent(gistId)}`, gistHeaders(pat ?? null)),

  createGist: (opts: {
    description: string;
    isPublic: boolean;
    files: Record<string, string>;
    pat?: string | null;
  }): Promise<GistData> =>
    post<{ description: string; public: boolean; files: Record<string, string> }, GistData>(
      "/gist",
      { description: opts.description, public: opts.isPublic, files: opts.files },
      gistHeaders(opts.pat ?? null),
    ),

  updateGist: (
    gistId: string,
    files: Record<string, string | null>,
    pat?: string | null,
  ): Promise<GistData> =>
    patch<{ files: Record<string, string | null> }, GistData>(
      `/gist/${encodeURIComponent(gistId)}`,
      { files },
      gistHeaders(pat ?? null),
    ),

  getRawGistFile: (rawUrl: string, pat?: string | null): Promise<string> =>
    getPlainText(rawUrl, gistHeaders(pat ?? null)),
};

// ── Auth helpers ─────────────────────────────────────────────────────────────

export interface AuthUser {
  login: string;
  avatarUrl: string;
}

/** Thrown when the server has AUTH_ENABLED=false. */
export class AuthDisabledError extends Error {
  constructor() {
    super("Authentication is not enabled on this server");
    this.name = "AuthDisabledError";
  }
}

/**
 * Returns the currently authenticated user, or null if not logged in.
 * Throws AuthDisabledError when the server has auth disabled (501).
 * Throws ApiError for other non-OK responses.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/auth/me`);
  if (res.status === 401) return null;
  if (res.status === 501) throw new AuthDisabledError();
  if (!res.ok) throw new ApiError(`Auth check failed: ${res.status}`, res.status);
  return (await res.json()) as AuthUser;
}

/** POST /api/auth/logout — best-effort, does not throw. */
export async function logoutUser(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
}

export interface RepoSuggestion {
  fullName: string;
  htmlUrl: string;
  private: boolean;
}

/**
 * Returns the authenticated user's GitHub repos for autocomplete.
 * Returns an empty array when not logged in or the token lacks repo scope.
 */
export async function fetchUserRepos(): Promise<RepoSuggestion[]> {
  const res = await fetch(`${API_BASE}/auth/repos`);
  if (!res.ok) return [];
  const data = (await res.json()) as { repos?: RepoSuggestion[] };
  return data.repos ?? [];
}
