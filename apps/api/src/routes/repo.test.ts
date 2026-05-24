import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const FIELD = "\x1f";
const RECORD = "\x1e";

vi.mock("../lib/exec.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/exec.js")>("../lib/exec.js");
  return {
    ...actual,
    execProcess: vi.fn(async (cmd: string, options: { args?: string[] } = {}) => {
      const args = options.args ?? [];
      if (args[0] === "clone") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (args.includes("tag")) {
        const line = ["v1.0.0", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "1700000000", "Release 1.0.0"].join(FIELD);
        return { stdout: line + "\n", stderr: "", exitCode: 0 };
      }
      if (args.includes("log")) {
        const commit = [
          "abc1234abc1234abc1234abc1234abc1234abc12",
          "A. Dev",
          "a@b.co",
          "1700000000",
          "A. Dev",
          "a@b.co",
          "1700000000",
          "feat: hello",
          "",
        ].join(FIELD) + RECORD;
        return { stdout: commit, stderr: "", exitCode: 0 };
      }
      if (args.includes("show")) {
        return { stdout: "[git]\nconventional_commits = true\n", stderr: "", exitCode: 0 };
      }
      if (args.includes("symbolic-ref")) {
        return { stdout: "main\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }),
  };
});

import { buildServer } from "../server.js";
import { loadConfig } from "../config.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer(loadConfig({}), { logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/repo/inspect", () => {
  it("returns tags, commits, and cliff.toml", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repo/inspect",
      payload: { url: "https://github.com/orhun/git-cliff" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tags).toHaveLength(1);
    expect(body.tags[0].name).toBe("v1.0.0");
    expect(body.commits).toHaveLength(1);
    expect(body.commits[0].message).toContain("feat: hello");
    expect(body.cliffToml).toContain("[git]");
    expect(body.defaultBranch).toBe("main");
  });

  it("rejects disallowed hosts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repo/inspect",
      payload: { url: "https://example.com/a/b" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/allowlist/i);
  });

  it("rejects malformed URLs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repo/inspect",
      payload: { url: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
  });
});
