import { describe, it, expect } from "vitest";
import { computeIntegrityHash, verifyIntegrity, IntegrityError } from "./integrity";

describe("integrity: computeIntegrityHash", () => {
  it("returns a non-empty base64url string", async () => {
    const hash = await computeIntegrityHash("1", "some-payload");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
    // base64url: no +, /, or = chars
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is stable across calls for the same input", async () => {
    const a = await computeIntegrityHash("1", "payload");
    const b = await computeIntegrityHash("1", "payload");
    expect(a).toBe(b);
  });

  it("differs when version changes", async () => {
    const a = await computeIntegrityHash("1", "payload");
    const b = await computeIntegrityHash("2", "payload");
    expect(a).not.toBe(b);
  });

  it("differs when payload changes", async () => {
    const a = await computeIntegrityHash("1", "payload-a");
    const b = await computeIntegrityHash("1", "payload-b");
    expect(a).not.toBe(b);
  });
});

describe("integrity: verifyIntegrity", () => {
  it("returns true for a freshly-computed hash", async () => {
    const payload = "test-payload-123";
    const hash = await computeIntegrityHash("1", payload);
    expect(await verifyIntegrity("1", payload, hash)).toBe(true);
  });

  it("returns false for a tampered payload", async () => {
    const hash = await computeIntegrityHash("1", "original");
    expect(await verifyIntegrity("1", "tampered", hash)).toBe(false);
  });

  it("returns false for a tampered hash", async () => {
    const hash = await computeIntegrityHash("1", "original");
    const flipped = hash.slice(0, -1) + (hash.endsWith("a") ? "b" : "a");
    expect(await verifyIntegrity("1", "original", flipped)).toBe(false);
  });

  it("returns false when version differs from hash", async () => {
    const hash = await computeIntegrityHash("1", "payload");
    expect(await verifyIntegrity("2", "payload", hash)).toBe(false);
  });
});

describe("IntegrityError", () => {
  it("carries the cause", () => {
    const e = new IntegrityError("hash-mismatch", { expected: "aaa", actual: "bbb" });
    expect(e.cause).toBe("hash-mismatch");
    expect(e.expected).toBe("aaa");
    expect(e.actual).toBe("bbb");
    expect(e).toBeInstanceOf(Error);
  });

  it("has a human-readable message", () => {
    const e = new IntegrityError("legacy-format");
    expect(e.message).toContain("Legacy");
  });

  it("includes version in unsupported-version message", () => {
    const e = new IntegrityError("unsupported-version", { version: "99" });
    expect(e.message).toContain("99");
  });
});
