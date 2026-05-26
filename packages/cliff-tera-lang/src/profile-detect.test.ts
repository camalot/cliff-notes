import { describe, expect, it } from "vitest";
import { detectProfiles } from "./profile-detect.js";

describe("detectProfiles", () => {
  it("always includes base and conventional", () => {
    const profiles = detectProfiles("");
    expect(profiles.has("base")).toBe(true);
    expect(profiles.has("conventional")).toBe(true);
    expect(profiles.size).toBe(2);
  });

  it("detects [remote.github]", () => {
    const profiles = detectProfiles(`
[remote.github]
owner = "orhun"
repo = "git-cliff"
`);
    expect(profiles.has("github")).toBe(true);
  });

  it("detects [remote.azure_devops] and the alias [remote.azuredevops]", () => {
    expect(detectProfiles("[remote.azure_devops]\n").has("azure_devops")).toBe(true);
    expect(detectProfiles("[remote.azuredevops]\n").has("azure_devops")).toBe(true);
  });

  it("detects all remote kinds when stacked", () => {
    const toml = `
[remote.github]
owner = "a"
[remote.gitlab]
owner = "b"
[remote.gitea]
owner = "c"
[remote.bitbucket]
owner = "d"
[remote.azure_devops]
owner = "e"
`;
    const profiles = detectProfiles(toml);
    expect(profiles).toEqual(
      new Set(["base", "conventional", "github", "gitlab", "gitea", "bitbucket", "azure_devops"]),
    );
  });

  it("activates submodule when recurse_submodules = true is under [git]", () => {
    const toml = `
[git]
recurse_submodules = true
`;
    expect(detectProfiles(toml).has("submodule")).toBe(true);
  });

  it("does not activate submodule when recurse_submodules is under a different section", () => {
    const toml = `
[changelog]
recurse_submodules = true
`;
    expect(detectProfiles(toml).has("submodule")).toBe(false);
  });

  it("does not activate submodule when recurse_submodules = false", () => {
    const toml = `
[git]
recurse_submodules = false
`;
    expect(detectProfiles(toml).has("submodule")).toBe(false);
  });

  it("ignores commented headers and keys", () => {
    const toml = `
# [remote.github]
[git] # comment
recurse_submodules = true # enabled
`;
    const profiles = detectProfiles(toml);
    expect(profiles.has("github")).toBe(false);
    expect(profiles.has("submodule")).toBe(true);
  });

  it("ignores unknown remote kinds", () => {
    const profiles = detectProfiles("[remote.someothersite]\n");
    expect(profiles).toEqual(new Set(["base", "conventional"]));
  });
});
