# Unit 7 — Testing

Test coverage for all Gist units. Tests are co-located with source where possible
using Vitest (web and API both use Vitest). E2E tests use Playwright.

---

## Phase 1: Backend Unit Tests (`apps/api`)

### `apps/api/src/services/gist.test.ts`

Uses `vi.stubGlobal("fetch", ...)` to mock `fetch`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getGist,
  createGist,
  updateGist,
  getRawGistFile,
  GistApiError,
} from "./gist";

const TOKEN = "ghp_test_token";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

describe("getGist", () => {
  it("returns parsed gist on 200", async () => {
    mockFetch(200, { id: "abc123", description: "", public: false, files: {} });
    const result = await getGist(TOKEN, "abc123");
    expect(result.id).toBe("abc123");
  });

  it("throws GistApiError on 404", async () => {
    mockFetch(404, { message: "Not Found" });
    await expect(getGist(TOKEN, "notexist")).rejects.toBeInstanceOf(GistApiError);
  });
});

describe("createGist", () => {
  it("sends POST with correct shape", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "new123", files: {}, public: false, description: "" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await createGist(TOKEN, "test gist", false, { "file.txt": "hello" });

    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/gists");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.files["file.txt"].content).toBe("hello");
    expect(body.public).toBe(false);
  });
});

describe("updateGist", () => {
  it("sends PATCH, null values for file deletion", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: "abc", files: {}, public: false, description: "" }),
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await updateGist(TOKEN, "abc", { "keep.txt": "new content", "delete.txt": null });

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.files["keep.txt"].content).toBe("new content");
    expect(body.files["delete.txt"]).toBeNull();
  });
});

describe("getRawGistFile", () => {
  it("returns text body on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      text: () => Promise.resolve("raw file content"),
    }));
    const result = await getRawGistFile(TOKEN, "https://gist.githubusercontent.com/user/abc/raw/file.txt");
    expect(result).toBe("raw file content");
  });
});
```

### `apps/api/src/lib/resolve-gist-token.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveGistToken, GistAuthError } from "./resolve-gist-token";

vi.mock("./session-store", () => ({
  getSession: vi.fn(),
}));
import { getSession } from "./session-store";

function makeRequest(overrides: { headers?: Record<string, string>; cookies?: Record<string, string> }) {
  return {
    headers: overrides.headers ?? {},
    cookies: overrides.cookies ?? {},
  } as unknown as import("fastify").FastifyRequest;
}

describe("resolveGistToken", () => {
  it("prefers X-GitHub-Token header over session", () => {
    vi.mocked(getSession).mockReturnValue({
      login: "user", avatarUrl: "", accessToken: "session_token",
      createdAt: 0, lastAccessedAt: 0,
    });
    const token = resolveGistToken(makeRequest({
      headers: { "x-github-token": "pat_token" },
      cookies: { sid: "abc" },
    }));
    expect(token).toBe("pat_token");
  });

  it("falls back to session accessToken", () => {
    vi.mocked(getSession).mockReturnValue({
      login: "user", avatarUrl: "", accessToken: "oauth_token",
      createdAt: 0, lastAccessedAt: 0,
    });
    const token = resolveGistToken(makeRequest({ cookies: { sid: "sid123" } }));
    expect(token).toBe("oauth_token");
  });

  it("throws GistAuthError when neither is present", () => {
    vi.mocked(getSession).mockReturnValue(undefined);
    expect(() => resolveGistToken(makeRequest({}))).toThrow(GistAuthError);
  });
});
```

### `apps/api/src/routes/gist.test.ts`

Integration-style tests using Fastify's `inject()`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildServer } from "../server";

// Mock the gist service
vi.mock("../services/gist", () => ({
  getGist: vi.fn(),
  createGist: vi.fn(),
  updateGist: vi.fn(),
  getRawGistFile: vi.fn(),
  GistApiError: class GistApiError extends Error {
    constructor(public statusCode: number, public context: string, public detail: string) {
      super();
    }
  },
}));

vi.mock("../lib/resolve-gist-token", () => ({
  resolveGistToken: vi.fn().mockReturnValue("test_token"),
  GistAuthError: class GistAuthError extends Error {
    constructor(public reason: string) { super(); }
  },
}));

import { getGist, createGist, updateGist } from "../services/gist";
import { resolveGistToken } from "../lib/resolve-gist-token";

const config = {
  port: 3001, host: "0.0.0.0",
  configsDir: "/tmp", remoteMocksDir: "/tmp",
  gitCliffBin: "git-cliff", gitBin: "git",
  cloneTimeoutMs: 5000, renderTimeoutMs: 5000,
  maxClonedCommits: 100,
  corsOrigins: ["http://localhost:5173"],
  authEnabled: false,
  githubClientId: "", githubClientSecret: "",
  githubCallbackUrl: "", appOrigin: "http://localhost:5173",
  sessionSecret: "testsecretfortestingonly1234567890",
  sessionTtlSeconds: 3600,
};

describe("GET /api/gist/:gistId", () => {
  it("returns 200 with gist data", async () => {
    vi.mocked(getGist).mockResolvedValue({
      id: "abc", description: "", public: false, files: {},
      created_at: "", updated_at: "",
    });
    const app = await buildServer(config, { logger: false });
    const res = await app.inject({ method: "GET", url: "/api/gist/abc" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe("abc");
  });

  it("returns 400 for invalid gist ID format", async () => {
    const app = await buildServer(config, { logger: false });
    const res = await app.inject({ method: "GET", url: "/api/gist/../../etc/passwd" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/gist", () => {
  it("returns 201 on successful creation", async () => {
    vi.mocked(createGist).mockResolvedValue({
      id: "new123", description: "test", public: false, files: {},
      created_at: "", updated_at: "",
    });
    const app = await buildServer(config, { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/gist",
      payload: { description: "test", public: false, files: { "test.txt": "hello" } },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("POST /api/gist/raw SSRF protection", () => {
  it("rejects non-gist.githubusercontent.com URLs", async () => {
    const app = await buildServer(config, { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/gist/raw",
      payload: { rawUrl: "https://evil.com/steal-data" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects internal URLs", async () => {
    const app = await buildServer(config, { logger: false });
    const res = await app.inject({
      method: "POST",
      url: "/api/gist/raw",
      payload: { rawUrl: "https://169.254.169.254/latest/meta-data" },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

---

## Phase 2: Frontend Unit Tests (`apps/web`)

### `apps/web/src/lib/gist-format.test.ts`

```ts
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

function makeEntry(overrides: Partial<{
  filename: string; content: string; size: number;
  raw_url: string; truncated: boolean;
}>) {
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
      id: PROJECT_ID, name: "My Project", description: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const playgroundMeta = JSON.stringify({
      id: PLAYGROUND_ID, projectId: PROJECT_ID, name: "My Playground",
      description: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const files = {
      [GIST_MARKER_FILE]: makeEntry({ filename: GIST_MARKER_FILE }),
      [`${PROJECT_ID}.metadata`]: makeEntry({ filename: `${PROJECT_ID}.metadata`, content: projectMeta }),
      [`${PROJECT_ID}/${PLAYGROUND_ID}.cliff-notes`]: makeEntry({
        filename: `${PROJECT_ID}/${PLAYGROUND_ID}.cliff-notes`,
        content: "---\nversion: '1'\n...",
      }),
      [`${PROJECT_ID}/${PLAYGROUND_ID}.metadata`]: makeEntry({
        filename: `${PROJECT_ID}/${PLAYGROUND_ID}.metadata`,
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
      [`${PROJECT_ID}/${PLAYGROUND_ID}.cliff-notes`]: makeEntry({
        filename: `${PROJECT_ID}/${PLAYGROUND_ID}.cliff-notes`,
        content: "---",
      }),
    };
    const tree = parseGistTree(files);
    expect(tree[0]!.id).toBe(PROJECT_ID);
    expect(tree[0]!.playgrounds[0]!.id).toBe(PLAYGROUND_ID);
  });

  it("handles malformed metadata JSON without throwing", () => {
    const files = {
      [`${PROJECT_ID}.metadata`]: makeEntry({ content: "not json{{" }),
      [`${PROJECT_ID}/${PLAYGROUND_ID}.cliff-notes`]: makeEntry({ filename: `${PROJECT_ID}/${PLAYGROUND_ID}.cliff-notes` }),
    };
    expect(() => parseGistTree(files)).not.toThrow();
  });

  it("returns projects sorted by name", () => {
    const makeProject = (id: string, name: string) => ({
      [`${id}.metadata`]: makeEntry({ content: JSON.stringify({ id, name, description: "", createdAt: "", updatedAt: "" }) }),
    });
    const files = { ...makeProject("zzz", "Zebra Project"), ...makeProject("aaa", "Apple Project") };
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
```

### `apps/web/src/lib/gist-config.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  getGistId, setGistId, clearGistId,
  getGistPat, setGistPat, clearGistPat,
  getSavePat, setSavePat,
  getLastSaveAction, setLastSaveAction,
} from "./gist-config";

beforeEach(() => {
  localStorage.clear();
});

describe("gistId", () => {
  it("returns null when not set", () => expect(getGistId()).toBeNull());
  it("round-trips", () => { setGistId("abc123"); expect(getGistId()).toBe("abc123"); });
  it("clear removes value", () => { setGistId("x"); clearGistId(); expect(getGistId()).toBeNull(); });
});

describe("PAT", () => {
  it("returns null when savePat is false (default)", () => {
    setGistPat("mytoken");
    expect(getGistPat()).toBeNull(); // savePat defaults to false
  });

  it("returns stored value when savePat is true", () => {
    setSavePat(true);
    setGistPat("mytoken");
    expect(getGistPat()).toBe("mytoken");
  });

  it("setSavePat(false) clears stored PAT", () => {
    setSavePat(true);
    setGistPat("mytoken");
    setSavePat(false);
    expect(getGistPat()).toBeNull();
  });
});

describe("lastSaveAction", () => {
  it("defaults to local", () => expect(getLastSaveAction()).toBe("local"));
  it("round-trips gist", () => { setLastSaveAction("gist"); expect(getLastSaveAction()).toBe("gist"); });
});
```

---

## Phase 3: Component Tests (`apps/web`)

### `apps/web/src/components/GistExplorer.test.tsx`

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GistExplorer } from "./GistExplorer";
import type { GistProject } from "../lib/gist-format";

const PROJECTS: GistProject[] = [
  {
    id: "proj-1",
    name: "Alpha Project",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    playgrounds: [
      {
        id: "pg-1",
        projectId: "proj-1",
        name: "My Playground",
        description: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        filename: "proj-1/pg-1.cliff-notes",
        rawUrl: null,
        truncated: false,
      },
    ],
  },
];

describe("GistExplorer — open mode", () => {
  it("renders project names", () => {
    render(
      <GistExplorer
        mode="open"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
  });

  it("shows playground after expanding project", () => {
    render(
      <GistExplorer
        mode="open"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Alpha Project"));
    expect(screen.getByText("My Playground")).toBeInTheDocument();
  });

  it("calls onSelectPlayground when file clicked", () => {
    const onSelect = vi.fn();
    render(
      <GistExplorer
        mode="open"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        onSelectPlayground={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Alpha Project"));
    fireEvent.click(screen.getByText("My Playground"));
    expect(onSelect).toHaveBeenCalledWith(PROJECTS[0]!.playgrounds[0]);
  });
});

describe("GistExplorer — save mode", () => {
  it("shows filename input when a project is selected", () => {
    render(
      <GistExplorer
        mode="save"
        projects={PROJECTS}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
        selectedProjectId="proj-1"
        fileName="my-playground.cliff-notes"
        onFileNameChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("my-playground.cliff-notes")).toBeInTheDocument();
  });

  it("shows new-project button in save mode", () => {
    render(
      <GistExplorer
        mode="save"
        projects={[]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByTitle("New project")).toBeInTheDocument();
  });
});

describe("GistExplorer — loading / error states", () => {
  it("shows loading indicator", () => {
    render(
      <GistExplorer
        mode="open"
        projects={[]}
        loading={true}
        error={null}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText(/loading gist/i)).toBeInTheDocument();
  });

  it("shows error with retry button", () => {
    const onRefresh = vi.fn();
    render(
      <GistExplorer
        mode="open"
        projects={[]}
        loading={false}
        error="Network error"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByText("Network error")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRefresh).toHaveBeenCalled();
  });
});
```

### `apps/web/src/components/ui/SplitButton.test.tsx`

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SplitButton } from "./SplitButton";

const ACTIONS = [
  { key: "local", label: "Save Locally", icon: "vsc:save" },
  { key: "gist", label: "Save to GitHub Gist", icon: "vsc:github-inverted" },
];

describe("SplitButton", () => {
  it("displays active action label", () => {
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={vi.fn()}
        onChangeActiveKey={vi.fn()}
      />,
    );
    expect(screen.getByText("Save Locally")).toBeInTheDocument();
  });

  it("calls onAction with active key on main button click", () => {
    const onAction = vi.fn();
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={onAction}
        onChangeActiveKey={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Save Locally"));
    expect(onAction).toHaveBeenCalledWith("local");
  });

  it("opens dropdown on chevron click", () => {
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={vi.fn()}
        onChangeActiveKey={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "" })); // chevron
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Save to GitHub Gist")).toBeInTheDocument();
  });

  it("calls onChangeActiveKey and onAction when dropdown item selected", () => {
    const onAction = vi.fn();
    const onChangeActiveKey = vi.fn();
    render(
      <SplitButton
        actions={ACTIONS}
        activeKey="local"
        onAction={onAction}
        onChangeActiveKey={onChangeActiveKey}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[1]!); // chevron
    fireEvent.click(screen.getByText("Save to GitHub Gist"));
    expect(onChangeActiveKey).toHaveBeenCalledWith("gist");
    expect(onAction).toHaveBeenCalledWith("gist");
  });
});
```

---

## Phase 4: E2E Tests (`tests/e2e`)

### `tests/e2e/tests/gist-save-load.spec.ts`

Uses Playwright. GitHub API calls are intercepted with `page.route()` to avoid
real network calls and API rate limits.

```ts
import { test, expect } from "@playwright/test";

const MOCK_GIST_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const MOCK_GIST = {
  id: MOCK_GIST_ID,
  description: "cliff-notes.dev playground",
  public: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  files: {
    "cliff-notes.gist": { filename: "cliff-notes.gist", content: '{"version":"1","app":"cliff-notes.dev"}', size: 42, raw_url: "", truncated: false },
    "proj-uuid.metadata": {
      filename: "proj-uuid.metadata",
      content: JSON.stringify({ id: "proj-uuid", name: "Test Project", description: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
      size: 100, raw_url: "", truncated: false,
    },
    "proj-uuid/pg-uuid.cliff-notes": {
      filename: "proj-uuid/pg-uuid.cliff-notes",
      content: "---\nversion: '1'\nkind: CliffNotesProject\nmetadata:\n  \"cliff-notes.dev/name\": 'Test Playground'\n  \"cliff-notes.dev/id\": 'pg-uuid'\n  \"cliff-notes.dev/source\": 'http://localhost:5173'\n  \"cliff-notes.dev/hash\": 'placeholder'\ndata: |\n  placeholder\n",
      size: 200, raw_url: "", truncated: false,
    },
    "proj-uuid/pg-uuid.metadata": {
      filename: "proj-uuid/pg-uuid.metadata",
      content: JSON.stringify({ id: "pg-uuid", projectId: "proj-uuid", name: "Test Playground", description: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
      size: 150, raw_url: "", truncated: false,
    },
  },
};

test.describe("Gist save flow", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept Gist API proxy calls
    await page.route("**/api/gist", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 201, json: MOCK_GIST });
      } else {
        await route.continue();
      }
    });
    await page.route(`**/api/gist/${MOCK_GIST_ID}`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, json: MOCK_GIST });
      } else if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 200, json: MOCK_GIST });
      }
    });
  });

  test("split button shows Save Locally by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Save Locally")).toBeVisible();
  });

  test("opens SaveToGistModal on 'Save to GitHub Gist' click", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "" }).last().click(); // chevron
    await page.getByText("Save to GitHub Gist").click();
    await expect(page.getByText("Save to GitHub Gist", { exact: false })).toBeVisible();
  });
});

test.describe("Gist load flow", () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed gistId in localStorage
    await page.goto("/");
    await page.evaluate((id) => {
      localStorage.setItem("cliff-notes:gist-id:v1", id);
    }, MOCK_GIST_ID);

    await page.route(`**/api/gist/${MOCK_GIST_ID}`, async (route) => {
      await route.fulfill({ status: 200, json: MOCK_GIST });
    });
  });

  test("Load Playground modal shows 'Open from GitHub Gist' when gistId is set", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Load Playground").click();
    await expect(page.getByText("Open from GitHub Gist")).toBeVisible();
  });

  test("opens Gist explorer and shows project tree", async ({ page }) => {
    await page.goto("/");
    await page.getByTitle("Load Playground").click();
    await page.getByText("Open from GitHub Gist").click();
    await expect(page.getByText("Test Project")).toBeVisible();
  });
});
```

---

## Running Tests

```bash
# Backend
pnpm --filter api test

# Frontend unit + component
pnpm --filter web test

# E2E (requires dev server running)
pnpm --filter e2e test
```

---

## Coverage Goals

| Area | Target |
|------|--------|
| `gist.ts` service | 90%+ line coverage |
| `resolve-gist-token.ts` | 100% branch coverage |
| `gist-format.ts` | 90%+ (all parse/build paths) |
| `gist-config.ts` | 100% |
| `GistExplorer.tsx` | 80%+ (all key interactions) |
| `SplitButton.tsx` | 100% |
| E2E happy paths | Save + Load flows covered |
