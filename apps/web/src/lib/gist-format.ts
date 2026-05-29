// ── Types ────────────────────────────────────────────────────────────────────

export interface GistProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  playgrounds: GistPlayground[];
}

export interface GistPlayground {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Full gist filename: "<projectId>/<playgroundId>.cliff-notes" */
  filename: string;
  rawUrl: string | null;
  truncated: boolean;
}

export interface GistProjectMetadata {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface GistPlaygroundMetadata {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface GistFileEntry {
  filename: string;
  size: number;
  raw_url: string;
  truncated: boolean;
  content?: string;
}

// ── File name helpers ────────────────────────────────────────────────────────

export const GIST_MARKER_FILE = "cliff-notes.gist";

export function projectMetadataFilename(projectId: string): string {
  return `${projectId}.metadata`;
}

export function playgroundFilename(projectId: string, playgroundId: string): string {
  return `${projectId}--${playgroundId}.cliff-notes`;
}

export function playgroundMetadataFilename(
  projectId: string,
  playgroundId: string,
): string {
  return `${projectId}--${playgroundId}.metadata`;
}

export function buildMarkerContent(): string {
  return JSON.stringify({ version: "1", app: "cliff-notes.dev" }, null, 2);
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse the flat files map from a GitHub Gist response into a GistProject tree.
 *
 * Files in the gist have names like:
 *   cliff-notes.gist                     ← marker
 *   <projectId>.metadata                 ← project metadata
 *   <projectId>--<playgroundId>.cliff-notes
 *   <projectId>--<playgroundId>.metadata
 *
 * Note: "/" is not allowed in Gist filenames, so "--" is used as separator.
 */
export function parseGistTree(
  files: Record<string, GistFileEntry>,
): GistProject[] {
  const projects = new Map<string, GistProject>();

  // ── Pass 1: collect project metadata ─────────────────────────────────
  for (const [filename, entry] of Object.entries(files)) {
    // Playground metadata files contain "--"; skip them here
    if (filename.includes("--")) continue;
    const projectMetaMatch = filename.match(/^([^.]+)\.metadata$/);
    if (!projectMetaMatch) continue;
    const projectId = projectMetaMatch[1]!;

    let meta: GistProjectMetadata;
    try {
      meta = JSON.parse(entry.content ?? "{}") as GistProjectMetadata;
    } catch {
      meta = {
        id: projectId,
        name: projectId,
        description: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    projects.set(projectId, {
      id: projectId,
      name: meta.name || projectId,
      description: meta.description ?? "",
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      playgrounds: [],
    });
  }

  // ── Pass 2: collect playground files ─────────────────────────────────
  for (const [filename, entry] of Object.entries(files)) {
    const playgroundMatch = filename.match(/^(.+?)--(.+?)\.cliff-notes$/);
    if (!playgroundMatch) continue;
    const [, projectId, playgroundId] = playgroundMatch;

    if (!projects.has(projectId!)) {
      projects.set(projectId!, {
        id: projectId!,
        name: projectId!,
        description: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        playgrounds: [],
      });
    }

    const metaFilename = playgroundMetadataFilename(projectId!, playgroundId!);
    const metaEntry = files[metaFilename];
    let meta: Partial<GistPlaygroundMetadata> = {};
    if (metaEntry?.content) {
      try {
        meta = JSON.parse(metaEntry.content) as GistPlaygroundMetadata;
      } catch {
        // ignore
      }
    }

    projects.get(projectId!)!.playgrounds.push({
      id: playgroundId!,
      projectId: projectId!,
      name: meta.name || playgroundId!,
      description: meta.description ?? "",
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      filename,
      rawUrl: entry.truncated ? entry.raw_url : null,
      truncated: entry.truncated,
    });
  }

  const sorted = [...projects.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const project of sorted) {
    project.playgrounds.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

// ── Serialisation ────────────────────────────────────────────────────────────

export function buildGistSaveFiles(opts: {
  projectId: string;
  projectName: string;
  projectDescription?: string;
  playgroundId: string;
  playgroundName: string;
  playgroundDescription?: string;
  playgroundContent: string;
  now?: string;
  existingProjectCreatedAt?: string;
  existingPlaygroundCreatedAt?: string;
}): Record<string, string> {
  const now = opts.now ?? new Date().toISOString();

  const projectMeta: GistProjectMetadata = {
    id: opts.projectId,
    name: opts.projectName,
    description: opts.projectDescription ?? "",
    createdAt: opts.existingProjectCreatedAt ?? now,
    updatedAt: now,
  };

  const playgroundMeta: GistPlaygroundMetadata = {
    id: opts.playgroundId,
    projectId: opts.projectId,
    name: opts.playgroundName,
    description: opts.playgroundDescription ?? "",
    createdAt: opts.existingPlaygroundCreatedAt ?? now,
    updatedAt: now,
  };

  return {
    [GIST_MARKER_FILE]: buildMarkerContent(),
    [projectMetadataFilename(opts.projectId)]: JSON.stringify(projectMeta, null, 2),
    [playgroundFilename(opts.projectId, opts.playgroundId)]: opts.playgroundContent,
    [playgroundMetadataFilename(opts.projectId, opts.playgroundId)]:
      JSON.stringify(playgroundMeta, null, 2),
  };
}

// ── ID generation ─────────────────────────────────────────────────────────────

export function generatePlaygroundId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
