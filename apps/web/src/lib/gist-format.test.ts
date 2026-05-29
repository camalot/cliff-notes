import { describe, it, expect } from "vitest";
import {
  parseGistTree,
  buildGistSaveFiles,
  projectMetadataFilename,
  playgroundFilename,
  playgroundMetadataFilename,
  GIST_MARKER_FILE,
} from "./gist-format";

const PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";
const PLAYGROUND_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function makeEntry(
  overrides: Partial<{
    filename: string;
    content: string;
    size: number;
    raw_url: string;
    truncated: boolean;
  }>,
) {
  return {
    filename: "file.txt",
    content: "{}",
    size: 2,
    raw_url: "",
    truncated: false,
    ...overrides,
  };
}

describe("parseGistTree", () => {
  it("parses a single project + playground", () => {
    const projectMeta = JSON.stringify({
      id: PROJECT_ID,
      name: "My Project",
      description: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const playgroundMeta = JSON.stringify({
      id: PLAYGROUND_ID,
      projectId: PROJECT_ID,
      name: "My Playground",
      description: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const files = {
      [GIST_MARKER_FILE]: makeEntry({ filename: GIST_MARKER_FILE }),
      [projectMetadataFilename(PROJECT_ID)]: makeEntry({
        filename: projectMetadataFilename(PROJECT_ID),
        content: projectMeta,
      }),
      [playgroundFilename(PROJECT_ID, PLAYGROUND_ID)]: makeEntry({
        filename: playgroundFilename(PROJECT_ID, PLAYGROUND_ID),
        content: "---\nversion: '1'\n...",
      }),
      [playgroundMetadataFilename(PROJECT_ID, PLAYGROUND_ID)]: makeEntry({
        filename: playgroundMetadataFilename(PROJECT_ID, PLAYGROUND_ID),
        content: playgroundMeta,
      }),
    };

    const tree = parseGistTree(files);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe("My Project");
    expect(tree[0]!.playgrounds).toHaveLength(1);
    expect(tree[0]!.playgrounds[0]!.name).toBe("My Playground");
  });

  it("handles missing .metadata gracefully (synthesises from id)", () => {
    const files = {
      [playgroundFilename(PROJECT_ID, PLAYGROUND_ID)]: makeEntry({
        filename: playgroundFilename(PROJECT_ID, PLAYGROUND_ID),
        content: "---",
      }),
    };
    const tree = parseGistTree(files);
    expect(tree[0]!.id).toBe(PROJECT_ID);
    expect(tree[0]!.playgrounds[0]!.id).toBe(PLAYGROUND_ID);
  });

  it("handles malformed metadata JSON without throwing", () => {
    const files = {
      [projectMetadataFilename(PROJECT_ID)]: makeEntry({ content: "not json{{" }),
      [playgroundFilename(PROJECT_ID, PLAYGROUND_ID)]: makeEntry({
        filename: playgroundFilename(PROJECT_ID, PLAYGROUND_ID),
      }),
    };
    expect(() => parseGistTree(files)).not.toThrow();
  });

  it("returns projects sorted by name", () => {
    const makeProject = (id: string, name: string) => ({
      [projectMetadataFilename(id)]: makeEntry({
        content: JSON.stringify({
          id,
          name,
          description: "",
          createdAt: "",
          updatedAt: "",
        }),
      }),
    });
    const files = {
      ...makeProject("zzz", "Zebra Project"),
      ...makeProject("aaa", "Apple Project"),
    };
    const tree = parseGistTree(files);
    expect(tree[0]!.name).toBe("Apple Project");
  });
});

describe("buildGistSaveFiles", () => {
  it("produces exactly 4 files", () => {
    const result = buildGistSaveFiles({
      projectId: PROJECT_ID,
      projectName: "Test Project",
      playgroundId: PLAYGROUND_ID,
      playgroundName: "Test Playground",
      playgroundContent: "---\nkind: CliffNotesProject\n",
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(Object.keys(result)).toHaveLength(4);
    expect(result[GIST_MARKER_FILE]).toBeDefined();
    expect(result[projectMetadataFilename(PROJECT_ID)]).toBeDefined();
    expect(result[playgroundFilename(PROJECT_ID, PLAYGROUND_ID)]).toBeDefined();
    expect(result[playgroundMetadataFilename(PROJECT_ID, PLAYGROUND_ID)]).toBeDefined();
  });

  it("preserves existingProjectCreatedAt", () => {
    const result = buildGistSaveFiles({
      projectId: PROJECT_ID,
      projectName: "P",
      playgroundId: PLAYGROUND_ID,
      playgroundName: "PG",
      playgroundContent: "",
      now: "2026-06-01T00:00:00.000Z",
      existingProjectCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    const meta = JSON.parse(result[projectMetadataFilename(PROJECT_ID)]!);
    expect(meta.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(meta.updatedAt).toBe("2026-06-01T00:00:00.000Z");
  });
});
