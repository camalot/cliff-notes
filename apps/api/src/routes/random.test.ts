import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { loadConfig } from "../config.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer(loadConfig({}), { logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/commits/random", () => {
  it("generates a single random feat", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/commits/random",
      payload: { type: "feat" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.commits).toHaveLength(1);
    expect(body.commits[0].message).toMatch(/^feat/);
  });

  it("supports breaking and count", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/commits/random",
      payload: { type: "feat", breaking: true, count: 3 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.commits).toHaveLength(3);
    for (const c of body.commits) expect(c.message).toMatch(/!:/);
  });

  it("rejects unknown type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/commits/random",
      payload: { type: "bogus" },
    });
    expect(res.statusCode).toBe(400);
  });
});
