import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";
import {
  deleteSession,
  generateSessionId,
  getSession,
  setSession,
} from "../lib/session-store.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  generateOAuthState,
  type OAuthStateCookie,
} from "../services/github-oauth.js";

const STATE_COOKIE = "oauth_state";
const SESSION_COOKIE = "sid";
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes

function buildCallbackHtml(targetOrigin: string, error: string | null): string {
  if (error !== null) {
    const safeError = escapeHtml(error);
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Authentication Error</title></head>
<body>
<p>Authentication failed: ${safeError}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(
      { type: 'auth:error', message: ${JSON.stringify(error)} },
      ${JSON.stringify(targetOrigin)}
    );
  }
  window.close();
</script>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Authentication Complete</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'auth:success' }, ${JSON.stringify(targetOrigin)});
  }
  window.close();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function setCookieOptions(maxAge: number, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export const authRoutes = (config: AppConfig): FastifyPluginAsync => {
  return async (app) => {
    const isSecure = process.env.NODE_ENV === "production";

    // When auth is disabled, return 501 for all auth routes
    if (!config.authEnabled) {
      app.all("/auth/*", async (_req, reply) => {
        return reply.code(501).send({ error: "Authentication is not enabled" });
      });
      return;
    }

    // ── GET /auth/github ──────────────────────────────────────────────────
    // Initiate the GitHub OAuth flow: generate CSRF state + PKCE, redirect.
    app.get("/auth/github", async (req, reply) => {
      const oauthState = generateOAuthState(config.appOrigin);

      reply.setCookie(STATE_COOKIE, JSON.stringify(oauthState), {
        ...setCookieOptions(STATE_COOKIE_MAX_AGE, isSecure),
        httpOnly: true,
      });

      const authUrl = buildAuthorizationUrl(
        config.githubClientId,
        config.githubCallbackUrl,
        oauthState.state,
        oauthState.codeVerifier,
      );

      return reply.redirect(authUrl);
    });

    // ── GET /auth/github/callback ─────────────────────────────────────────
    // GitHub redirects here after authorisation.
    app.get<{ Querystring: { code?: string; state?: string } }>(
      "/auth/github/callback",
      async (req, reply) => {
        // Strict CSP for this HTML-returning endpoint (it runs inline JS)
        reply.header(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'unsafe-inline'",
        );
        reply.header("Cache-Control", "no-store");

        const { code, state } = req.query;

        // Helper to render an error page pointing at the configured app origin
        const sendError = (msg: string, statusCode = 400) => {
          return reply
            .code(statusCode)
            .type("text/html; charset=utf-8")
            .send(buildCallbackHtml(config.appOrigin, msg));
        };

        if (!code || !state) {
          return sendError("Missing code or state parameter.");
        }

        // Verify CSRF state against the short-lived cookie
        const rawStateCookie = (req.cookies as Record<string, string>)[STATE_COOKIE];
        if (!rawStateCookie) {
          return sendError("OAuth state cookie missing. Please try signing in again.");
        }

        let storedState: OAuthStateCookie;
        try {
          storedState = JSON.parse(rawStateCookie) as OAuthStateCookie;
        } catch {
          return sendError("Invalid OAuth state cookie.");
        }

        if (storedState.state !== state) {
          return sendError("OAuth state mismatch. Please try signing in again.");
        }

        // Clear the one-time state cookie
        reply.clearCookie(STATE_COOKIE, { path: "/" });

        // Exchange code for token + fetch user profile
        let login: string;
        let avatarUrl: string;
        let accessToken: string;

        try {
          const token = await exchangeCodeForToken(
            code,
            storedState.codeVerifier,
            config.githubClientId,
            config.githubClientSecret,
            config.githubCallbackUrl,
          );
          const user = await fetchGitHubUser(token);
          login = user.login;
          avatarUrl = user.avatarUrl;
          accessToken = user.accessToken;
        } catch (err) {
          req.log.error(err, "GitHub OAuth token/user exchange failed");
          return sendError("Authentication failed. Please try again.", 500);
        }

        // Session fixation prevention: destroy any pre-existing session
        const oldSid = (req.cookies as Record<string, string>)[SESSION_COOKIE];
        if (oldSid) {
          deleteSession(oldSid);
        }

        // Create new session
        const sid = generateSessionId();
        setSession(sid, {
          login,
          avatarUrl,
          accessToken,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        });

        reply.setCookie(SESSION_COOKIE, sid, {
          ...setCookieOptions(config.sessionTtlSeconds, isSecure),
        });

        return reply
          .type("text/html; charset=utf-8")
          .send(buildCallbackHtml(storedState.targetOrigin, null));
      },
    );

    // ── GET /auth/repos ───────────────────────────────────────────────────
    // Returns the authenticated user's GitHub repositories for autocomplete.
    app.get("/auth/repos", async (req, reply) => {
      reply.header("Cache-Control", "private, max-age=60");

      const sid = (req.cookies as Record<string, string>)[SESSION_COOKIE];
      if (!sid) return reply.code(401).send({ error: "unauthenticated" });

      const session = getSession(sid);
      if (!session) return reply.code(401).send({ error: "session_evicted" });

      try {
        const res = await fetch(
          "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "cliff-notes",
            },
          },
        );
        if (!res.ok) {
          // Token may lack repo scope — return empty list rather than an error
          return reply.send({ repos: [] });
        }
        const data = (await res.json()) as Array<{ full_name?: string; html_url?: string; private?: boolean }>;
        const repos = data
          .filter((r) => r.full_name && r.html_url)
          .map((r) => ({ fullName: r.full_name!, htmlUrl: r.html_url!, private: r.private ?? false }));
        return reply.send({ repos });
      } catch {
        return reply.send({ repos: [] });
      }
    });

    // ── GET /auth/me ──────────────────────────────────────────────────────
    // Returns the currently authenticated user or 401.
    app.get("/auth/me", async (req, reply) => {
      reply.header("Cache-Control", "no-store, private");

      const sid = (req.cookies as Record<string, string>)[SESSION_COOKIE];
      if (!sid) {
        return reply.code(401).send({ error: "unauthenticated" });
      }

      const session = getSession(sid);
      if (!session) {
        // Distinguish evicted sessions from never-logged-in for client diagnostics
        return reply.code(401).send({ error: "session_evicted" });
      }

      return reply.send({ login: session.login, avatarUrl: session.avatarUrl });
    });

    // ── POST /auth/logout ─────────────────────────────────────────────────
    app.post("/auth/logout", async (req, reply) => {
      reply.header("Cache-Control", "no-store, private");

      const sid = (req.cookies as Record<string, string>)[SESSION_COOKIE];
      if (sid) {
        deleteSession(sid);
      }

      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.code(204).send();
    });
  };
};
