import type { FastifyPluginAsync } from "fastify";
import { renderRequestSchema } from "@cliff-notes/shared";
import { renderChangelog, RenderError } from "../services/git-cliff.js";
import { ExecError } from "../lib/exec.js";
import { runForProject, sanitizeProjectId } from "../lib/project-queue.js";
import type { AppConfig } from "../config.js";

export const renderRoutes = (config: AppConfig): FastifyPluginAsync => {
  return async (app) => {
    app.post("/render", async (request, reply) => {
      const parsed = renderRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          detail: parsed.error.message,
        });
      }
      const projectId = sanitizeProjectId(request.headers["x-project-id"]);
      try {
        const result = await runForProject(projectId, () =>
          renderChangelog(parsed.data, config, projectId),
        );
        return reply.send({
          markdown: result.markdown,
          warnings: result.warnings,
          ...(result.nextTag !== undefined ? { nextTag: result.nextTag } : {}),
          ...(result.nextTagFallback !== undefined
            ? { nextTagFallback: result.nextTagFallback }
            : {}),
          ...(result.mockedRemotes && result.mockedRemotes.length > 0
            ? { mockedRemotes: result.mockedRemotes }
            : {}),
        });
      } catch (err) {
        if (err instanceof RenderError) {
          return reply.code(422).send({ error: "git-cliff failed", detail: err.stderr });
        }
        if (err instanceof ExecError) {
          return reply.code(500).send({ error: "Subprocess failure", detail: err.message });
        }
        request.log.error(err, "render failed");
        return reply.code(500).send({ error: "Internal error" });
      }
    });
  };
};
