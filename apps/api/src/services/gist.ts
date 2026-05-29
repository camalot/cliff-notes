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
