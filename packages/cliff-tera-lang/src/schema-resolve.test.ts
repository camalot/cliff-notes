import { describe, expect, it } from "vitest";
import { buildRegistry } from "./schema-resolve.js";

describe("buildRegistry", () => {
  it("exposes Release as the root type with base properties", () => {
    const reg = buildRegistry(["base"]);
    const root = reg.rootType();
    expect(root.name).toBe("Release");
    expect(root.properties.has("version")).toBe(true);
    expect(root.properties.has("commits")).toBe(true);
    expect(root.properties.has("timestamp")).toBe(true);
  });

  it("merges conventional fields into the Commit type", () => {
    const reg = buildRegistry(["base", "conventional"]);
    const commit = reg.typeByName("Commit");
    expect(commit).toBeDefined();
    expect(commit!.properties.has("id")).toBe(true); // from base
    expect(commit!.properties.has("group")).toBe(true); // from conventional
    expect(commit!.properties.has("breaking")).toBe(true);
    expect(commit!.properties.has("footers")).toBe(true);
  });

  it("does not include conventional fields when conventional profile is inactive", () => {
    const reg = buildRegistry(["base"]);
    const commit = reg.typeByName("Commit");
    expect(commit?.properties.has("group")).toBe(false);
  });

  it("adds github-specific top-level keys when github profile is active", () => {
    const reg = buildRegistry(["base", "conventional", "github"]);
    const release = reg.rootType();
    expect(release.properties.has("github")).toBe(true);
    expect(release.properties.has("remote")).toBe(true);
    const commit = reg.typeByName("Commit");
    expect(commit!.properties.has("remote")).toBe(true);
    expect(commit!.properties.has("github")).toBe(true);
  });

  it("walks a multi-segment property path", () => {
    const reg = buildRegistry(["base", "conventional"]);
    const start = reg.rootType();
    const result = reg.walkPath(start, ["commits"]);
    expect(result?.primitive).toBe("array");
    expect(result?.itemType?.name).toBe("Commit");
  });

  it("walkPath returns undefined on an unknown segment", () => {
    const reg = buildRegistry(["base"]);
    const start = reg.rootType();
    expect(reg.walkPath(start, ["bogus"])).toBeUndefined();
  });

  it("walkPath descends into a nested object property", () => {
    const reg = buildRegistry(["base", "conventional"]);
    const commit = reg.typeByName("Commit")!;
    const author = reg.walkPath(commit, ["author"]);
    expect(author?.properties.has("email")).toBe(true);
    expect(author?.properties.has("name")).toBe(true);
  });

  it("resolveTypeRef element_of returns the array element type", () => {
    const reg = buildRegistry(["base", "conventional"]);
    const ref = reg.resolveTypeRef({ kind: "element_of", varName: "commits" });
    expect(ref?.name).toBe("Commit");
    expect(ref?.properties.has("group")).toBe(true);
  });

  it("resolveTypeRef element_of returns the map value type for submodule_commits", () => {
    const reg = buildRegistry(["base", "conventional", "submodule"]);
    const ref = reg.resolveTypeRef({ kind: "element_of", varName: "submodule_commits" });
    // submodule_commits is a map (additionalProperties=array) — value type is the array
    expect(ref?.primitive).toBe("array");
    expect(ref?.itemType?.properties.has("id")).toBe(true);
  });

  it("resolveTypeRef element_of with a piped expression still extracts the head", () => {
    const reg = buildRegistry(["base", "conventional"]);
    const ref = reg.resolveTypeRef({
      kind: "element_of",
      varName: "commits | filter(attribute=\"breaking\", value=true)",
    });
    expect(ref?.name).toBe("Commit");
  });

  it("resolveTypeRef named looks up a registered type", () => {
    const reg = buildRegistry(["base", "conventional"]);
    const commit = reg.resolveTypeRef({ kind: "named", name: "Commit" });
    expect(commit?.name).toBe("Commit");
  });

  it("attaches descriptions and source profile to properties", () => {
    const reg = buildRegistry(["base", "conventional", "github"]);
    const commit = reg.typeByName("Commit")!;
    expect(commit.properties.get("id")?.source).toBe("base");
    expect(commit.properties.get("group")?.source).toBe("conventional");
    expect(commit.properties.get("group")?.description).toMatch(/commit group/i);
  });
});
