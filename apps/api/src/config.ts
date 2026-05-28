import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Default configsDir: .cliff/tomls at the workspace/project root.
// Resolves to the same location whether running from src/ or dist/ since both
// are one level deep inside apps/api/.
const WORKSPACE_ROOT = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const DEFAULT_CONFIGS_DIR = resolve(WORKSPACE_ROOT, ".cliff/tomls");
const DEFAULT_REMOTE_MOCKS_DIR = resolve(WORKSPACE_ROOT, ".cliff/context");

export interface AppConfig {
  port: number;
  host: string;
  /** Absolute path to the built SPA. When set, the API serves it at /. */
  staticDir?: string;
  /** Absolute path to the directory containing cliff.toml configuration presets. */
  configsDir: string;
  /** Absolute path to the directory containing remote-mock fixture JSON files. */
  remoteMocksDir: string;
  gitCliffBin: string;
  gitBin: string;
  cloneTimeoutMs: number;
  renderTimeoutMs: number;
  maxClonedCommits: number;
  /** CORS origins permitted in dev. Comma-separated. */
  corsOrigins: string[];

  // ── Auth ──────────────────────────────────────────────────────────────────
  /** When false all /api/auth/* routes return 501. */
  authEnabled: boolean;
  /** GitHub OAuth App client ID. Required when authEnabled. */
  githubClientId: string;
  /** GitHub OAuth App client secret. Required when authEnabled. */
  githubClientSecret: string;
  /**
   * Full URL GitHub redirects to after authorisation.
   * Must match the GitHub OAuth App settings.
   * In dev, point this at the Vite proxy so cookies land on localhost:5173.
   */
  githubCallbackUrl: string;
  /**
   * Origin of the SPA (used as postMessage target and validated against
   * CORS allowlist). Defaults to the first entry in corsOrigins.
   */
  appOrigin: string;
  /** ≥32-char random secret used to sign session cookies. Required when authEnabled. */
  sessionSecret: string;
  /** Sliding session TTL in seconds. Default 7 days. */
  sessionTtlSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const corsOrigins = (env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: env.PORT ? Number(env.PORT) : 3001,
    host: env.HOST ?? "0.0.0.0",
    staticDir: env.STATIC_DIR,
    configsDir: env.CONFIGS_DIR ?? DEFAULT_CONFIGS_DIR,
    remoteMocksDir: env.REMOTE_MOCKS_DIR ?? DEFAULT_REMOTE_MOCKS_DIR,
    gitCliffBin: env.GIT_CLIFF_BIN ?? "git-cliff",
    gitBin: env.GIT_BIN ?? "git",
    cloneTimeoutMs: env.CLONE_TIMEOUT_MS ? Number(env.CLONE_TIMEOUT_MS) : 30_000,
    renderTimeoutMs: env.RENDER_TIMEOUT_MS ? Number(env.RENDER_TIMEOUT_MS) : 15_000,
    maxClonedCommits: env.MAX_CLONED_COMMITS ? Number(env.MAX_CLONED_COMMITS) : 1000,
    corsOrigins,

    authEnabled: env.AUTH_ENABLED === "true",
    githubClientId: env.GITHUB_CLIENT_ID ?? "",
    githubClientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    githubCallbackUrl:
      env.GITHUB_CALLBACK_URL ??
      "http://localhost:5173/api/auth/github/callback",
    appOrigin: env.APP_ORIGIN ?? corsOrigins[0] ?? "http://localhost:5173",
    sessionSecret: env.SESSION_SECRET ?? "",
    sessionTtlSeconds: env.SESSION_TTL_SECONDS
      ? Number(env.SESSION_TTL_SECONDS)
      : 604_800,
  };
}
