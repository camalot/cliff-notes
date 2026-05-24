import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { healthRoutes } from "./routes/health.js";
import { renderRoutes } from "./routes/render.js";
import { repoRoutes } from "./routes/repo.js";
import { randomRoutes } from "./routes/random.js";
import type { AppConfig } from "./config.js";

export interface BuildOptions {
  logger?: boolean | { level: string };
}

export async function buildServer(
  config: AppConfig,
  options: BuildOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 1024 * 1024, // 1 MB
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(renderRoutes(config));
      await api.register(repoRoutes(config));
      await api.register(randomRoutes);
    },
    { prefix: "/api" },
  );

  if (config.staticDir) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api")) {
        return reply.code(404).send({ error: "Not Found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
