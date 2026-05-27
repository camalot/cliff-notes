import { describe, it, expect, beforeEach } from "vitest";
import {
  encodeStateToPayload,
  decodePayloadToState,
  decodeFromUrlHash,
  buildShareUrl,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  type PersistedState,
} from "./storage";
import { IntegrityError } from "./integrity";

const sample: PersistedState = {
  cliffToml: "[git]\nconventional_commits = true\n",
  commits: [{ message: "feat: x" }],
  tags: [{ name: "v1.0.0", afterIndex: 0 }],
};

// ── payload encoding ──────────────────────────────────────────────────────────

describe("storage: payload encoding", () => {
  it("round-trips through encode/decode", () => {
    const payload = encodeStateToPayload(sample);
    expect(decodePayloadToState(payload)).toEqual(sample);
  });

  it("decodePayloadToState returns null for garbage", () => {
    expect(decodePayloadToState("not-valid-lz")).toBeNull();
  });
});

// ── URL hash format ───────────────────────────────────────────────────────────

describe("storage: URL hash decoding", () => {
  it("parses valid #s=&h=&v= fragment", async () => {
    const url = await buildShareUrl(sample, "https://example.com", "/");
    const hashPart = url.replace("https://example.com/", "");
    const result = decodeFromUrlHash(hashPart);
    expect(result).not.toBeNull();
    expect(result!.version).toBe("1");
    expect(result!.state).toEqual(sample);
  });

  it("returns null for empty fragment", () => {
    expect(decodeFromUrlHash("")).toBeNull();
    expect(decodeFromUrlHash("#")).toBeNull();
  });

  it("returns null for unrelated fragment", () => {
    expect(decodeFromUrlHash("#foo=bar")).toBeNull();
  });

  it("throws legacy-format for old #state= links", () => {
    expect(() => decodeFromUrlHash("#state=N4IgxgpgBA")).toThrow(IntegrityError);
    try {
      decodeFromUrlHash("#state=N4IgxgpgBA");
    } catch (e) {
      expect((e as IntegrityError).cause).toBe("legacy-format");
    }
  });

  it("buildShareUrl produces a URL with s, h, v params", async () => {
    const url = await buildShareUrl(sample, "https://example.com", "/");
    expect(url).toMatch(/^https:\/\/example\.com\/#s=.+&h=.+&v=1$/);
  });
});

// ── localStorage ──────────────────────────────────────────────────────────────

describe("storage: localStorage", () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  it("round-trips through save/load", () => {
    saveToLocalStorage(sample);
    expect(loadFromLocalStorage()).toEqual(sample);
  });

  it("returns null when nothing is stored", () => {
    expect(loadFromLocalStorage()).toBeNull();
  });
});
