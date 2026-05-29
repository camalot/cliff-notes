import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getGist,
  createGist,
  updateGist,
  getRawGistFile,
  GistApiError,
} from "./gist";

const TOKEN = "ghp_test_token";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

describe("getGist", () => {
  it("returns parsed gist on 200", async () => {
    mockFetch(200, { id: "abc123", description: "", public: false, files: {} });
    const result = await getGist(TOKEN, "abc123");
    expect(result.id).toBe("abc123");
  });

  it("throws GistApiError on 404", async () => {
    mockFetch(404, { message: "Not Found" });
    await expect(getGist(TOKEN, "notexist")).rejects.toBeInstanceOf(GistApiError);
  });
});

describe("createGist", () => {
  it("sends POST with correct shape", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "new123", files: {}, public: false, description: "" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await createGist(TOKEN, "test gist", false, { "file.txt": "hello" });

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/gists");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.files["file.txt"].content).toBe("hello");
    expect(body.public).toBe(false);
  });
});

describe("updateGist", () => {
  it("sends PATCH, null values for file deletion", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "abc", files: {}, public: false, description: "" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await updateGist(TOKEN, "abc", { "keep.txt": "new content", "delete.txt": null });

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.files["keep.txt"].content).toBe("new content");
    expect(body.files["delete.txt"]).toBeNull();
  });
});

describe("getRawGistFile", () => {
  it("returns text body on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("raw file content"),
      }),
    );
    const result = await getRawGistFile(
      TOKEN,
      "https://gist.githubusercontent.com/user/abc/raw/file.txt",
    );
    expect(result).toBe("raw file content");
  });
});
