import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }));
  app.get("/healthz", async () => ({ status: "ok", uptime: process.uptime() }));
  app.get("/ready", async () => ({ status: "ok", uptime: process.uptime() }));
};
