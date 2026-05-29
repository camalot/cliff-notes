import type { FastifyRequest } from "fastify";
import { getSession } from "./session-store.js";

const SESSION_COOKIE = "sid";
const PAT_HEADER = "x-github-token";

export class GistAuthError extends Error {
  constructor(public readonly reason: "unauthenticated" | "no_gist_scope") {
    super(
      reason === "unauthenticated"
        ? "No GitHub token available. Log in or provide a PAT via X-GitHub-Token."
        : "Your GitHub login does not have the 'gist' OAuth scope. Re-login or provide a PAT.",
    );
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
