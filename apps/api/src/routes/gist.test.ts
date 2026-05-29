import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { loadConfig } from "../config.js";

// Mock the gist service
vi.mock("../services/gist", () => ({
  getGist: vi.fn(),
  createGist: vi.fn(),
  updateGist: vi.fn(),
  getRawGistFile: vi.fn(),
  GistApiError: class GistApiError extends Error {
    constructor(public statusCode: number, public context: string, public detail: string) {
      super();
    }
  },
}));

vi.mock("../lib/resolve-gist-token", () => ({
  resolveGistToken: vi.fn().mockReturnValue("test_token"),
  GistAuthError: class GistAuthError extends Error {
    constructor(public reason: string) {
      super();
    }
  },
}));

import { getGist, createGist, updateGist } from "../services/gist";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer(loadConfig({}), { logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/gist/:gistId", () => {
  it("returns 200 with gist data", async () => {
    vi.mocked(getGist).mockResolvedValue({
      id: "a1b2c3d4e5f6a1b2c3d4e5f6",
      description: "",
      public: false,
      files: {},
      created_at: "",
      updated_at: "",
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/gist/a1b2c3d4e5f6a1b2c3d4e5f6",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe("a1b2c3d4e5f6a1b2c3d4e5f6");
  });

  it("returns 400 for invalid gist ID format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/gist/invalid",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/gist", () => {
  it("returns 201 on successful creation", async () => {
    vi.mocked(createGist).mockResolvedValue({
      id: "a1b2c3d4e5f6a1b2c3d4e5f6",
      description: "test",
      public: false,
      files: {},
      created_at: "",
      updated_at: "",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/gist",
      payload: {
        description: "test",
        public: false,
        files: { "test.txt": "hello" },
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("POST /api/gist/raw SSRF protection", () => {
  it("rejects non-gist.githubusercontent.com URLs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/gist/raw",
      payload: { rawUrl: "https://evil.com/steal-data" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects internal URLs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/gist/raw",
      payload: { rawUrl: "https://169.254.169.254/latest/meta-data" },
    });
    expect(res.statusCode).toBe(400);
  });
});
