import { createHash, randomBytes } from "node:crypto";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

/** Payload stored in the short-lived `oauth_state` cookie. */
export interface OAuthStateCookie {
  state: string;
  codeVerifier: string;
  targetOrigin: string;
}

/** Generate a fresh CSRF state + PKCE code-verifier pair. */
export function generateOAuthState(targetOrigin: string): OAuthStateCookie {
  const state = randomBytes(16).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  return { state, codeVerifier, targetOrigin };
}

/** Build the GitHub authorisation URL with PKCE code-challenge. */
export function buildAuthorizationUrl(
  clientId: string,
  callbackUrl: string,
  state: string,
  codeVerifier: string,
): string {
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "read:user repo gist",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange an authorisation code for a GitHub access token.
 * Includes PKCE code_verifier for verification.
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string,
): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };

  if (data.error || !data.access_token) {
    throw new Error(
      `GitHub token exchange error: ${data.error ?? "no access_token returned"}${
        data.error_description ? ` — ${data.error_description}` : ""
      }`,
    );
  }

  return data.access_token;
}

export interface GitHubUser {
  login: string;
  /** Validated to be on avatars.githubusercontent.com. Empty string if invalid. */
  avatarUrl: string;
  accessToken: string;
}

/** Fetch the authenticated user's profile. Validates avatarUrl hostname. */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "cliff-notes",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub user fetch failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { login?: string; avatar_url?: string };

  if (!data.login || typeof data.login !== "string") {
    throw new Error("GitHub user response missing login");
  }

  // Validate avatar hostname to prevent open-redirect / XSS via crafted URLs
  let avatarUrl = "";
  if (data.avatar_url && typeof data.avatar_url === "string") {
    try {
      const url = new URL(data.avatar_url);
      if (url.hostname === "avatars.githubusercontent.com") {
        avatarUrl = data.avatar_url;
      }
    } catch {
      // Invalid URL — discard silently
    }
  }

  return { login: data.login, avatarUrl, accessToken };
}
