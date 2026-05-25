import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";

interface TomlMeta {
  label?: string;
  sort?: number;
  description?: string;
}

interface TomlsManifest {
  [filename: string]: TomlMeta;
}

interface TomlEntry {
  id: string;
  label: string;
  sort?: number;
  description?: string;
}

const PKG_PATH = fileURLToPath(new URL("../../package.json", import.meta.url));

async function loadManifest(): Promise<TomlsManifest> {
  try {
    const raw = await readFile(PKG_PATH, "utf-8");
    const pkg = JSON.parse(raw) as { "cliff-notes"?: { tomls?: TomlsManifest } };
    return pkg["cliff-notes"]?.tomls ?? {};
  } catch {
    return {};
  }
}

/** Reject IDs that contain path separators or dot-segments. */
function isSafeId(id: string): boolean {
  if (!id) return false;
  if (id !== basename(id)) return false;
  if (id.includes("..") || id.startsWith(".")) return false;
  return /^[\w\-. ]+\.toml$/i.test(id);
}

function toEntry(id: string, meta: TomlMeta): TomlEntry {
  return {
    id,
    label: meta.label ?? id.replace(/\.toml$/i, ""),
    sort: meta.sort,
    description: meta.description,
  };
}

export const tomlsRoutes = (config: AppConfig): FastifyPluginAsync => {
  return async (app) => {
    app.get("/tomls", async (_request, reply) => {
      const manifest = await loadManifest();
      const entries: TomlEntry[] = Object.entries(manifest)
        .map(([id, meta]) => toEntry(id, meta))
        .sort((a, b) => {
          const sa = a.sort ?? Number.MAX_SAFE_INTEGER;
          const sb = b.sort ?? Number.MAX_SAFE_INTEGER;
          return sa - sb;
        });
      return reply.send(entries);
    });

    app.get<{ Params: { id: string } }>("/tomls/:id", async (request, reply) => {
      const { id } = request.params;

      if (!isSafeId(id)) {
        return reply.code(400).send({ error: "Invalid toml id" });
      }

      const manifest = await loadManifest();
      if (!Object.prototype.hasOwnProperty.call(manifest, id)) {
        return reply.code(404).send({ error: "Toml configuration not found" });
      }

      try {
        const content = await readFile(join(config.configsDir, id), "utf-8");
        return reply.type("text/plain").send(content);
      } catch {
        return reply.code(404).send({ error: "Toml file not found" });
      }
    });
  };
};
