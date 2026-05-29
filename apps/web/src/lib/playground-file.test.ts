import { describe, it, expect } from "vitest";
import {
  serializePlayground,
  parsePlayground,
  tryRecoverFromFile,
  slugifyPlaygroundName,
} from "./playground-file";
import { IntegrityError } from "./integrity";
import type { PersistedState } from "./storage";

const sampleState: PersistedState = {
  cliffToml: "[git]\nconventional_commits = true\n",
  commits: [{ message: "feat: add tests" }],
  tags: [{ name: "v1.0.0", afterIndex: 0 }],
  options: { unreleased: false, bumpedVersion: false },
  name: "Test Project",
};

// ── round-trip ────────────────────────────────────────────────────────────────

describe("playground-file: round-trip", () => {
  it("serialize → parse produces equal state", async () => {
    const content = await serializePlayground(sampleState);
    const parsed = await parsePlayground(content);
    expect(parsed).toEqual(sampleState);
  });

  it("serialized content contains required metadata fields", async () => {
    const content = await serializePlayground(sampleState);
    expect(content).toContain("cliff-notes.dev/name");
    expect(content).toContain("cliff-notes.dev/id");
    expect(content).toContain("cliff-notes.dev/source");
    expect(content).toContain("cliff-notes.dev/hash");
  });

  it("renaming the name metadata does not break parsing (name not in hash)", async () => {
    const content = await serializePlayground(sampleState);
    const renamed = content.replace(
      /"cliff-notes\.dev\/name": 'Test Project'/,
      `"cliff-notes.dev/name": 'Renamed Project'`,
    );
    // Should still parse because name is not included in the hash
    const parsed = await parsePlayground(renamed);
    expect(parsed).toEqual(sampleState);
  });
});

// ── tamper detection ──────────────────────────────────────────────────────────

describe("playground-file: tamper detection", () => {
  it("throws hash-mismatch when data line is altered", async () => {
    const content = await serializePlayground(sampleState);
    // Replace one character in the data payload
    const tampered = content.replace(/^(  )([A-Za-z0-9_-]{5})/m, "$1ZZZZZ");
    await expect(parsePlayground(tampered)).rejects.toSatisfy(
      (e: unknown) => e instanceof IntegrityError && (e as IntegrityError).cause === "hash-mismatch",
    );
  });

  it("throws hash-mismatch when the stored hash is altered", async () => {
    const content = await serializePlayground(sampleState);
    const tampered = content.replace(
      /"cliff-notes\.dev\/hash": '[^']+'/,
      `"cliff-notes.dev/hash": 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'`,
    );
    await expect(parsePlayground(tampered)).rejects.toSatisfy(
      (e: unknown) => e instanceof IntegrityError && (e as IntegrityError).cause === "hash-mismatch",
    );
  });

  it("throws missing-field when hash metadata is absent", async () => {
    const content = await serializePlayground(sampleState);
    const stripped = content.replace(/^\s+"cliff-notes\.dev\/hash": '[^']+'\n/m, "");
    await expect(parsePlayground(stripped)).rejects.toSatisfy(
      (e: unknown) => e instanceof IntegrityError && (e as IntegrityError).cause === "missing-field",
    );
  });

  it("throws missing-field when source metadata is absent", async () => {
    const content = await serializePlayground(sampleState);
    const stripped = content.replace(/^\s+"cliff-notes\.dev\/source": '[^']+'\n/m, "");
    await expect(parsePlayground(stripped)).rejects.toSatisfy(
      (e: unknown) => e instanceof IntegrityError && (e as IntegrityError).cause === "missing-field",
    );
  });

  it("throws unsupported-version for unknown version", async () => {
    const content = await serializePlayground(sampleState);
    const bumped = content.replace(/^version: '1'$/m, "version: '99'");
    await expect(parsePlayground(bumped)).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof IntegrityError && (e as IntegrityError).cause === "unsupported-version",
    );
  });

  it("throws missing-field for a non-CliffNotesProject file", async () => {
    await expect(parsePlayground("---\nfoo: bar\n")).rejects.toSatisfy(
      (e: unknown) => e instanceof IntegrityError && (e as IntegrityError).cause === "missing-field",
    );
  });
});

// ── recovery ──────────────────────────────────────────────────────────────────

describe("playground-file: tryRecoverFromFile", () => {
  it("recovers state from a valid file even when hash is wrong", async () => {
    const content = await serializePlayground(sampleState);
    const tampered = content.replace(
      /"cliff-notes\.dev\/hash": '[^']+'/,
      `"cliff-notes.dev/hash": 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'`,
    );
    const recovered = tryRecoverFromFile(tampered);
    expect(recovered).toEqual(sampleState);
  });

  it("returns null for garbage input", () => {
    expect(tryRecoverFromFile("not a valid file")).toBeNull();
  });
});

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugifyPlaygroundName", () => {
  it("handles the canonical example", () => {
    expect(slugifyPlaygroundName("Cliff-Notes Remote")).toBe("cliff-notes-remote");
  });

  it("converts underscores to hyphens", () => {
    expect(slugifyPlaygroundName("My_Cool_Project")).toBe("my-cool-playground");
  });

  it("strips special characters", () => {
    expect(slugifyPlaygroundName("Hello World!!")).toBe("hello-world");
  });

  it("transliterates unicode", () => {
    expect(slugifyPlaygroundName("Café Münch")).toBe("cafe-munch");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugifyPlaygroundName("foo--bar")).toBe("foo-bar");
  });

  it("falls back for empty / whitespace-only input", () => {
    expect(slugifyPlaygroundName("")).toBe("untitled-playground");
    expect(slugifyPlaygroundName("   ")).toBe("untitled-playground");
  });
});
