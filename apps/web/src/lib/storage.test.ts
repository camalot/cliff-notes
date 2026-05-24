import { describe, it, expect, beforeEach } from "vitest";
import {
  encodeToUrlHash,
  decodeFromUrlHash,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
  buildShareUrl,
} from "./storage";

const sample = {
  cliffToml: "[git]\nconventional_commits = true\n",
  commits: [{ message: "feat: x" }],
  tags: [{ name: "v1.0.0", afterIndex: 0 }],
};

describe("storage: URL hash encoding", () => {
  it("round-trips through encode/decode", () => {
    const encoded = encodeToUrlHash(sample);
    const decoded = decodeFromUrlHash(`#state=${encoded}`);
    expect(decoded).toEqual(sample);
  });
  it("returns null for missing/empty hash", () => {
    expect(decodeFromUrlHash("")).toBeNull();
    expect(decodeFromUrlHash("#nothing=1")).toBeNull();
  });
  it("returns null for garbage", () => {
    expect(decodeFromUrlHash("#state=not-valid-lz")).toBeNull();
  });
  it("buildShareUrl includes the state param", () => {
    const url = buildShareUrl(sample, "https://example.com", "/");
    expect(url).toMatch(/^https:\/\/example\.com\/#state=/);
  });
});

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
