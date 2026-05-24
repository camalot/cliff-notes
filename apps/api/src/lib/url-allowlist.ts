import { ALLOWED_REPO_HOSTS, type AllowedHost } from "@cliff-notes/shared";

export interface UrlCheckResult {
  ok: boolean;
  reason?: string;
  host?: AllowedHost;
  normalized?: string;
}

/**
 * Validate that a URL is one of the supported public git providers and looks
 * shaped like a clone URL we can safely pass to `git clone`. Strict by design:
 * only https, only allowed hosts, no credentials in the URL.
 */
export function checkRepoUrl(input: string): UrlCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Only https:// URLs are permitted." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credentials in URLs are not permitted." };
  }
  const host = parsed.hostname.toLowerCase() as AllowedHost;
  if (!(ALLOWED_REPO_HOSTS as readonly string[]).includes(host)) {
    return {
      ok: false,
      reason: `Host '${parsed.hostname}' is not on the allowlist. Allowed: ${ALLOWED_REPO_HOSTS.join(", ")}.`,
    };
  }
  // strip trailing slashes & fragments; keep the path so e.g. `/owner/repo`
  // (or `/owner/repo.git`) survives.
  const normalized = `https://${host}${parsed.pathname.replace(/\/+$/, "")}`;
  if (!/^\/[^/]+\/[^/]+(\.git)?$/.test(parsed.pathname.replace(/\/+$/, ""))) {
    return { ok: false, reason: "Expected a path like /<owner>/<repo>." };
  }
  return { ok: true, host, normalized };
}
