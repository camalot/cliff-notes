import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { loadConfig } from "../config.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer(loadConfig({ STATIC_DIR: "" }), { logger: false });
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    expect(typeof res.json().uptime).toBe("number");
  });
});

describe("API 404", () => {
  it("returns JSON 404 for unknown /api routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
  });
});
