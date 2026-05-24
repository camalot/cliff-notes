export interface AppConfig {
  port: number;
  host: string;
  /** Absolute path to the built SPA. When set, the API serves it at /. */
  staticDir: string | undefined;
  gitCliffBin: string;
  gitBin: string;
  cloneTimeoutMs: number;
  renderTimeoutMs: number;
  maxClonedCommits: number;
  /** CORS origins permitted in dev. Comma-separated. */
  corsOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: env.PORT ? Number(env.PORT) : 3001,
    host: env.HOST ?? "0.0.0.0",
    staticDir: env.STATIC_DIR,
    gitCliffBin: env.GIT_CLIFF_BIN ?? "git-cliff",
    gitBin: env.GIT_BIN ?? "git",
    cloneTimeoutMs: env.CLONE_TIMEOUT_MS ? Number(env.CLONE_TIMEOUT_MS) : 30_000,
    renderTimeoutMs: env.RENDER_TIMEOUT_MS ? Number(env.RENDER_TIMEOUT_MS) : 15_000,
    maxClonedCommits: env.MAX_CLONED_COMMITS ? Number(env.MAX_CLONED_COMMITS) : 1000,
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
