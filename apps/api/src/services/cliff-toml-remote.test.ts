import { describe, it, expect } from "vitest";
import {
  parseAndStripRemote,
  injectMockedRemoteBlocks,
  InlineRemoteTableError,
  type RemoteMockDefaults,
} from "./cliff-toml-remote.js";

const DEFAULTS: RemoteMockDefaults = {
  github: { owner: "orhun", repo: "git-cliff" },
  gitlab: { owner: "orhun", repo: "git-cliff" },
  gitea: { owner: "orhun", repo: "git-cliff" },
  bitbucket: { owner: "orhun", repo: "git-cliff" },
  azure_devops: { owner: "orhun-org/myproject", repo: "git-cliff" },
};

describe("parseAndStripRemote", () => {
  it("returns empty detection when no remote sections are present", () => {
    const toml = `[changelog]\nheader = "x"\n[git]\nconventional_commits = true\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual([]);
    expect(r.carriedOver).toEqual({});
    expect(r.referencedToken).toBe(false);
    expect(r.cleanedToml).toBe(toml);
  });

  it("strips a [remote.github] section and captures owner/repo", () => {
    const toml =
      `[changelog]\nheader = "h"\n\n` +
      `[remote.github]\nowner = "foo"\nrepo = "bar"\ntoken = "ghp_secret"\n\n` +
      `[git]\nconventional_commits = true\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual(["github"]);
    expect(r.carriedOver.github).toEqual({ owner: "foo", repo: "bar" });
    expect(r.referencedToken).toBe(true);
    expect(r.cleanedToml).not.toMatch(/\[remote/);
    expect(r.cleanedToml).not.toMatch(/ghp_secret/);
    expect(r.cleanedToml).toMatch(/\[git\]/);
  });

  it("captures multiple kinds in priority order", () => {
    const toml =
      `[remote.bitbucket]\nowner = "a"\nrepo = "b"\n\n` +
      `[remote.github]\nowner = "c"\nrepo = "d"\n\n` +
      `[remote.gitlab]\nowner = "e"\nrepo = "f"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual(["github", "gitlab", "bitbucket"]);
  });

  it("strips the bare [remote] table without recording it as a kind", () => {
    const toml = `[remote]\noffline = false\n\n[changelog]\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual([]);
    expect(r.cleanedToml).not.toMatch(/offline = false/);
    expect(r.cleanedToml).toMatch(/\[changelog\]/);
  });

  it("strips child tables like [remote.github.contributors]", () => {
    const toml =
      `[remote.github]\nowner = "a"\nrepo = "b"\n\n` +
      `[remote.github.contributors]\nfoo = 1\n\n[changelog]\nheader="x"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.cleanedToml).not.toMatch(/contributors/);
    expect(r.cleanedToml).toMatch(/\[changelog\]/);
  });

  it("handles dotted-key root-level remote assignments", () => {
    const toml = `remote.github.owner = "foo"\nremote.github.token = "x"\n[changelog]\nheader="h"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual(["github"]);
    expect(r.carriedOver.github?.owner).toBe("foo");
    expect(r.referencedToken).toBe(true);
    expect(r.cleanedToml).not.toMatch(/remote\./);
    expect(r.cleanedToml).toMatch(/\[changelog\]/);
  });

  it("rejects inline-table form `remote = { ... }`", () => {
    const toml = `remote = { github = { owner = "x", repo = "y" } }\n`;
    expect(() => parseAndStripRemote(toml)).toThrow(InlineRemoteTableError);
  });

  it("rejects inline-table form `remote.github = { ... }`", () => {
    const toml = `remote.github = { owner = "x", repo = "y" }\n`;
    expect(() => parseAndStripRemote(toml)).toThrow(InlineRemoteTableError);
  });

  it("does not strip section headers inside triple-quoted templates", () => {
    const toml =
      `[changelog]\nbody = """\nfoo\n[remote.github]\nowner = "x"\n"""\n\n[git]\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual([]);
    expect(r.cleanedToml).toMatch(/\[remote\.github\]/);
  });

  it("falls back when owner/repo carry-over fails validation", () => {
    const toml = `[remote.github]\nowner = "../../etc"\nrepo = "ok"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual(["github"]);
    expect(r.carriedOver.github?.owner).toBeUndefined();
    expect(r.carriedOver.github?.repo).toBe("ok");
  });

  it("ignores unknown remote kinds for detection", () => {
    const toml = `[remote.bogus]\nowner = "x"\n[changelog]\n`;
    const r = parseAndStripRemote(toml);
    expect(r.detectedKinds).toEqual([]);
    // still stripped though
    expect(r.cleanedToml).not.toMatch(/bogus/);
  });

  it("captures api_url when it is a valid http(s) URL", () => {
    const toml = `[remote.gitlab]\nowner = "a"\nrepo = "b"\napi_url = "https://gitlab.example/api/v4"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.carriedOver.gitlab?.api_url).toBe("https://gitlab.example/api/v4");
  });

  it("rejects invalid api_url (non-http scheme)", () => {
    const toml = `[remote.gitlab]\nowner = "a"\nrepo = "b"\napi_url = "file:///etc/passwd"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.carriedOver.gitlab?.api_url).toBeUndefined();
  });

  it("validates azure_devops org/project owner form", () => {
    const toml = `[remote.azure_devops]\nowner = "myorg/myproject"\nrepo = "repo"\n`;
    const r = parseAndStripRemote(toml);
    expect(r.carriedOver.azure_devops?.owner).toBe("myorg/myproject");
  });
});

describe("injectMockedRemoteBlocks", () => {
  it("appends nothing when no kinds were detected", () => {
    const cleaned = `[changelog]\nheader="h"\n`;
    expect(injectMockedRemoteBlocks(cleaned, [], {}, DEFAULTS)).toBe(cleaned);
  });

  it("injects a [remote] offline=true header and one [remote.<kind>] per kind", () => {
    const cleaned = `[changelog]\nheader="h"\n`;
    const out = injectMockedRemoteBlocks(
      cleaned,
      ["github", "gitlab"],
      { github: { owner: "u", repo: "r" } },
      DEFAULTS,
    );
    expect(out).toMatch(/\[remote\]\noffline = true/);
    expect(out).toMatch(/\[remote\.github\]\nowner = "u"\nrepo = "r"\ntoken = ""/);
    expect(out).toMatch(/\[remote\.gitlab\]\nowner = "orhun"\nrepo = "git-cliff"\ntoken = ""/);
  });

  it("includes api_url when carried over", () => {
    const out = injectMockedRemoteBlocks(
      "",
      ["gitlab"],
      { gitlab: { owner: "u", repo: "r", api_url: "https://x.example/api" } },
      DEFAULTS,
    );
    expect(out).toMatch(/api_url = "https:\/\/x\.example\/api"/);
  });
});
