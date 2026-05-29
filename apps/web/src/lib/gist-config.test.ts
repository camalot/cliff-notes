import { describe, it, expect, beforeEach } from "vitest";
import {
  getGistId,
  setGistId,
  clearGistId,
  getGistPat,
  setGistPat,
  clearGistPat,
  getSavePat,
  setSavePat,
  getLastSaveAction,
  setLastSaveAction,
} from "./gist-config";

beforeEach(() => {
  localStorage.clear();
});

describe("gistId", () => {
  it("returns null when not set", () => expect(getGistId()).toBeNull());
  it("round-trips", () => {
    setGistId("abc123");
    expect(getGistId()).toBe("abc123");
  });
  it("clear removes value", () => {
    setGistId("x");
    clearGistId();
    expect(getGistId()).toBeNull();
  });
});

describe("PAT", () => {
  it("returns null when savePat is false (default)", () => {
    setGistPat("mytoken");
    expect(getGistPat()).toBeNull(); // savePat defaults to false
  });

  it("returns stored value when savePat is true", () => {
    setSavePat(true);
    setGistPat("mytoken");
    expect(getGistPat()).toBe("mytoken");
  });

  it("setSavePat(false) clears stored PAT", () => {
    setSavePat(true);
    setGistPat("mytoken");
    setSavePat(false);
    expect(getGistPat()).toBeNull();
  });
});

describe("lastSaveAction", () => {
  it("defaults to local", () => expect(getLastSaveAction()).toBe("local"));
  it("round-trips gist", () => {
    setLastSaveAction("gist");
    expect(getLastSaveAction()).toBe("gist");
  });
});
