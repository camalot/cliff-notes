import { describe, it, expect } from "vitest";
import { checkRepoUrl } from "./url-allowlist.js";

describe("checkRepoUrl", () => {
  it("accepts a github https URL", () => {
    const r = checkRepoUrl("https://github.com/orhun/git-cliff");
    expect(r.ok).toBe(true);
    expect(r.host).toBe("github.com");
    expect(r.normalized).toBe("https://github.com/orhun/git-cliff");
  });
  it("accepts a github .git URL", () => {
    const r = checkRepoUrl("https://github.com/orhun/git-cliff.git");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("https://github.com/orhun/git-cliff.git");
  });
  it("rejects http://", () => {
    expect(checkRepoUrl("http://github.com/a/b").ok).toBe(false);
  });
  it("rejects credentials in URL", () => {
    expect(checkRepoUrl("https://user:pass@github.com/a/b").ok).toBe(false);
  });
  it("rejects unknown hosts", () => {
    expect(checkRepoUrl("https://example.com/a/b").ok).toBe(false);
  });
  it("rejects paths that don't look like /owner/repo", () => {
    expect(checkRepoUrl("https://github.com/").ok).toBe(false);
    expect(checkRepoUrl("https://github.com/single").ok).toBe(false);
    expect(checkRepoUrl("https://github.com/a/b/c").ok).toBe(false);
  });
  it("rejects unparsable input", () => {
    expect(checkRepoUrl("not a url").ok).toBe(false);
  });
  it("strips trailing slashes from the normalized form", () => {
    const r = checkRepoUrl("https://gitlab.com/foo/bar/");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("https://gitlab.com/foo/bar");
  });
});
