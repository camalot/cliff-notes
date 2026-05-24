import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../lib/exec.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/exec.js")>("../lib/exec.js");
  return {
    ...actual,
    execProcess: vi.fn(async () => ({
      stdout: "# Changelog\n\n## [unreleased]\n\n- feat: from mock\n",
      stderr: "",
      exitCode: 0,
    })),
  };
});

import { buildServer } from "../server.js";
import { loadConfig } from "../config.js";
import { execProcess, ExecError } from "../lib/exec.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer(loadConfig({}), { logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/render", () => {
  it("returns markdown from a successful git-cliff exec", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/render",
      payload: {
        cliffToml: "[git]\nconventional_commits = true\n",
        releases: [{ commits: [{ message: "feat: hello" }] }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.markdown).toContain("Changelog");
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it("rejects invalid payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/render",
      payload: { cliffToml: "", releases: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 422 when git-cliff fails", async () => {
    vi.mocked(execProcess).mockRejectedValueOnce(
      new ExecError("git-cliff failed", "git-cliff", 2, "bad config", ""),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/render",
      payload: {
        cliffToml: "[git]\n",
        releases: [{ commits: [{ message: "feat: x" }] }],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/git-cliff/i);
  });
});
