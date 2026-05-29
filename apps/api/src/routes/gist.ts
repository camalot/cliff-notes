import { z } from "zod";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import {
  createGist,
  getGist,
  getRawGistFile,
  GistApiError,
  updateGist,
} from "../services/gist.js";
import { GistAuthError, resolveGistToken } from "../lib/resolve-gist-token.js";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createGistBodySchema = z.object({
  description: z.string().max(256).default(""),
  public: z.boolean().default(false),
  files: z.record(z.string().min(1).max(255), z.string().max(512 * 1024)), // max 512 KB per file
});

const updateGistBodySchema = z.object({
  files: z.record(
    z.string().min(1).max(255),
    z.union([z.string().max(512 * 1024), z.null()]),
  ),
});

const gistIdParamSchema = z.object({
  gistId: z.string().regex(/^[a-f0-9]{20,40}$/i, "Invalid gist ID format"),
});

const rawFileBodySchema = z.object({
  rawUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://gist.githubusercontent.com/"), {
      message: "rawUrl must be from gist.githubusercontent.com",
    }),
});

// ── Route plugin ──────────────────────────────────────────────────────────────

export const gistRoutes = (_config: AppConfig): FastifyPluginAsync => {
  return async (app) => {
    function handleGistError(err: unknown, reply: FastifyReply) {
      if (err instanceof GistAuthError) {
        const statusCode = err.reason === "unauthenticated" ? 401 : 403;
        return reply.code(statusCode).send({ error: err.message });
      }
      if (err instanceof GistApiError) {
        const code = [403, 404, 422].includes(err.statusCode) ? err.statusCode : 502;
        return reply.code(code).send({
          error: `GitHub API error: ${err.detail || err.message}`,
        });
      }
      app.log.error(err, "Unexpected error in gist route");
      return reply.code(500).send({ error: "Internal server error" });
    }

    // GET /gist/:gistId
    app.get<{ Params: { gistId: string } }>("/gist/:gistId", async (req, reply) => {
      try {
        const { gistId } = gistIdParamSchema.parse(req.params);
        const token = resolveGistToken(req);
        const gist = await getGist(token, gistId);
        return reply.send(gist);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });

    // POST /gist
    app.post("/gist", async (req, reply) => {
      try {
        const body = createGistBodySchema.parse(req.body);
        const token = resolveGistToken(req);
        const gist = await createGist(token, body.description, body.public, body.files);
        return reply.code(201).send(gist);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });

    // PATCH /gist/:gistId
    app.patch<{ Params: { gistId: string } }>("/gist/:gistId", async (req, reply) => {
      try {
        const { gistId } = gistIdParamSchema.parse(req.params);
        const body = updateGistBodySchema.parse(req.body);
        const token = resolveGistToken(req);
        const gist = await updateGist(token, gistId, body.files);
        return reply.send(gist);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });

    // POST /gist/raw — proxy truncated gist file content
    // rawUrl validated to gist.githubusercontent.com to prevent SSRF
    app.post("/gist/raw", async (req, reply) => {
      try {
        const { rawUrl } = rawFileBodySchema.parse(req.body);
        const token = resolveGistToken(req);
        const content = await getRawGistFile(token, rawUrl);
        return reply.type("text/plain").send(content);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({ error: err.message });
        }
        return handleGistError(err, reply);
      }
    });
  };
};
