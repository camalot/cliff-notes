import { describe, it, expect, vi } from "vitest";
import { resolveGistToken, GistAuthError } from "./resolve-gist-token";

vi.mock("./session-store", () => ({
  getSession: vi.fn(),
}));
import { getSession } from "./session-store";

function makeRequest(overrides: {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}) {
  return {
    headers: overrides.headers ?? {},
    cookies: overrides.cookies ?? {},
  } as unknown as import("fastify").FastifyRequest;
}

describe("resolveGistToken", () => {
  it("prefers X-GitHub-Token header over session", () => {
    vi.mocked(getSession).mockReturnValue({
      login: "user",
      avatarUrl: "",
      accessToken: "session_token",
      createdAt: 0,
      lastAccessedAt: 0,
    });
    const token = resolveGistToken(
      makeRequest({
        headers: { "x-github-token": "pat_token" },
        cookies: { sid: "abc" },
      }),
    );
    expect(token).toBe("pat_token");
  });

  it("falls back to session accessToken", () => {
    vi.mocked(getSession).mockReturnValue({
      login: "user",
      avatarUrl: "",
      accessToken: "oauth_token",
      createdAt: 0,
      lastAccessedAt: 0,
    });
    const token = resolveGistToken(makeRequest({ cookies: { sid: "sid123" } }));
    expect(token).toBe("oauth_token");
  });

  it("throws GistAuthError when neither is present", () => {
    vi.mocked(getSession).mockReturnValue(undefined);
    expect(() => resolveGistToken(makeRequest({}))).toThrow(GistAuthError);
  });
});
