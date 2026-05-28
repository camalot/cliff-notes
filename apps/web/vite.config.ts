import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { config as dotenvConfig } from "dotenv";

// Workspace root is two levels up from apps/web/
const WORKSPACE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function isEnvFile(name: string): boolean {
  return name === ".env" || name.startsWith(".env.") || name.endsWith(".env");
}

function isSecretsFile(name: string): boolean {
  return (
    name === ".secrets" ||
    name.startsWith(".secrets.") ||
    (name.startsWith(".") && name.endsWith(".secrets")) ||
    name.endsWith(".secrets")
  );
}

function loadFileIntoEnv(filePath: string): void {
  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      for (const child of readdirSync(filePath)) {
        loadFileIntoEnv(join(filePath, child));
      }
    } else {
      dotenvConfig({ path: filePath });
    }
  } catch {
    // skip silently
  }
}

function loadEnvAndSecrets(): void {
  let entries: string[];
  try {
    entries = readdirSync(WORKSPACE_ROOT);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isEnvFile(entry) || isSecretsFile(entry)) {
      loadFileIntoEnv(join(WORKSPACE_ROOT, entry));
    }
  }
}

loadEnvAndSecrets();

export default defineConfig({
  plugins: [react()],
  envDir: WORKSPACE_ROOT,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
