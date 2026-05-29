import { test, expect } from "@playwright/test";

const MOCK_GIST_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const MOCK_GIST = {
  id: MOCK_GIST_ID,
  description: "cliff-notes.dev playground",
  public: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  files: {
    "cliff-notes.gist": {
      filename: "cliff-notes.gist",
      content: '{"version":"1","app":"cliff-notes.dev"}',
      size: 42,
      raw_url: "",
      truncated: false,
    },
    "proj-uuid.metadata": {
      filename: "proj-uuid.metadata",
      content: JSON.stringify({
        id: "proj-uuid",
        name: "Test Project",
        description: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      size: 100,
      raw_url: "",
      truncated: false,
    },
    "proj-uuid--pg-uuid.cliff-notes": {
      filename: "proj-uuid--pg-uuid.cliff-notes",
      content:
        "---\nversion: '1'\nkind: CliffNotesProject\nmetadata:\n  \"cliff-notes.dev/name\": 'Test Playground'\n  \"cliff-notes.dev/id\": 'pg-uuid'\n  \"cliff-notes.dev/source\": 'http://localhost:5173'\n  \"cliff-notes.dev/hash\": 'placeholder'\ndata: |\n  placeholder\n",
      size: 200,
      raw_url: "",
      truncated: false,
    },
    "proj-uuid--pg-uuid.metadata": {
      filename: "proj-uuid--pg-uuid.metadata",
      content: JSON.stringify({
        id: "pg-uuid",
        projectId: "proj-uuid",
        name: "Test Playground",
        description: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      size: 150,
      raw_url: "",
      truncated: false,
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

  test("Load Playground modal shows 'Open from GitHub Gist' when gistId is set", async ({
    page,
  }) => {
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
