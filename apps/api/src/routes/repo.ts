import type { FastifyPluginAsync } from "fastify";
import { repoInspectRequestSchema } from "@cliff-notes/shared";
import { inspectRepo, RepoLoadError } from "../services/repo-loader.js";
import { runForProject, sanitizeProjectId } from "../lib/project-queue.js";
import type { AppConfig } from "../config.js";

export const repoRoutes = (config: AppConfig): FastifyPluginAsync => {
  return async (app) => {
    app.post("/repo/inspect", async (request, reply) => {
      const parsed = repoInspectRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          detail: parsed.error.message,
        });
      }
      const { url, range, maxCommits = 200 } = parsed.data;
      const projectId = sanitizeProjectId(request.headers["x-project-id"]);
      try {
        const result = await runForProject(projectId, () =>
          inspectRepo(url, range, maxCommits, config, projectId),
        );
        return reply.send(result);
      } catch (err) {
        if (err instanceof RepoLoadError) {
          return reply.code(err.status).send({ error: err.message });
        }
        request.log.error(err, "repo inspect failed");
        return reply.code(500).send({ error: "Internal error" });
      }
    });
  };
};
