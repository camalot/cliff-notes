/**
 * Loads .env and .secrets files from the workspace root into process.env.
 *
 * Patterns resolved (relative to workspace root):
 *   .env  .env.*  *.env  (+ directory variants)
 *   .secrets  .secrets.*  .*.secrets  *.secrets  (+ directory variants)
 *
 * Existing env vars are NOT overwritten (dotenv's default behaviour).
 * Files/directories that don't exist are silently skipped.
 */

import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

// Workspace root is four levels up from apps/api/src/lib/
const WORKSPACE_ROOT = resolve(
  fileURLToPath(new URL("../../../..", import.meta.url)),
);

/** Returns true when the name matches any .env pattern. */
function isEnvFile(name: string): boolean {
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name.endsWith(".env")
  );
}

/** Returns true when the name matches any .secrets pattern. */
function isSecretsFile(name: string): boolean {
  return (
    name === ".secrets" ||
    name.startsWith(".secrets.") ||
    name.startsWith(".") && name.endsWith(".secrets") ||
    name.endsWith(".secrets")
  );
}

function loadFile(filePath: string): void {
  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      // If the matching entry is a directory, load every file inside it.
      for (const child of readdirSync(filePath)) {
        loadFile(join(filePath, child));
      }
    } else {
      dotenvConfig({ path: filePath });
    }
  } catch {
    // File/dir doesn't exist or isn't readable — skip silently.
  }
}

function loadEnvFiles(): void {
  let entries: string[];
  try {
    entries = readdirSync(WORKSPACE_ROOT);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isEnvFile(entry) || isSecretsFile(entry)) {
      loadFile(join(WORKSPACE_ROOT, entry));
    }
  }
}

loadEnvFiles();
