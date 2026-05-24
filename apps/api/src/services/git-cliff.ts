import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execProcess, ExecError } from "../lib/exec.js";
import { withTempDir } from "../lib/temp.js";
import { buildContext } from "./context-builder.js";
import type { AppConfig } from "../config.js";
import type { Release } from "@cliff-notes/shared";

export interface RenderInput {
  cliffToml: string;
  releases: Release[];
}

export interface RenderOutput {
  markdown: string;
  warnings: string[];
}

export class RenderError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
    this.name = "RenderError";
  }
}

export async function renderChangelog(
  input: RenderInput,
  config: AppConfig,
): Promise<RenderOutput> {
  const context = buildContext(input.releases);
  const json = JSON.stringify(context);

  return withTempDir("cliffnotes-render", async (dir) => {
    const configPath = join(dir, "cliff.toml");
    await writeFile(configPath, input.cliffToml, "utf8");

    try {
      const result = await execProcess(config.gitCliffBin, {
        args: ["--config", configPath, "--from-context", "-"],
        stdin: json,
        cwd: dir,
        timeoutMs: config.renderTimeoutMs,
      });
      const warnings = result.stderr
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      return { markdown: result.stdout, warnings };
    } catch (err) {
      if (err instanceof ExecError) {
        throw new RenderError(
          `git-cliff exited with code ${err.exitCode ?? "null"}.`,
          err.stderr,
        );
      }
      throw err;
    }
  });
}
