import type { FastifyPluginAsync } from "fastify";
import { randomCommitRequestSchema, generateRandomCommits } from "@cliff-notes/shared";

export const randomRoutes: FastifyPluginAsync = async (app) => {
  app.post("/commits/random", async (request, reply) => {
    const parsed = randomCommitRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        detail: parsed.error.message,
      });
    }
    const commits = generateRandomCommits(parsed.data);
    console.log("[random route] Generated commits:", JSON.stringify(commits, null, 2));
    return reply.send({ commits });
  });
};
