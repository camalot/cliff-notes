import { test, expect } from "@playwright/test";

test.describe("cliff-notes smoke", () => {
  test("loads the app shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /generate/i })).toBeVisible();
    await expect(page.getByText(/cliff\.toml/i).first()).toBeVisible();
    await expect(page.getByText(/load from a public repository/i)).toBeVisible();
  });

  test("adds a manual commit", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/feat\(api\): add cool thing/);
    await input.fill("feat(test): smoke test commit");
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(page.locator('[data-testid="commit-list"]')).toContainText(
      "feat(test): smoke test commit",
    );
  });

  test("inserts a random fix", async ({ page }) => {
    await page.goto("/");
    const list = page.locator('[data-testid="commit-list"]');
    const initial = await list.locator("li").count();
    // The commit-section select is the first one on the page.
    await page.locator("select").first().selectOption("fix");
    await page.getByRole("button", { name: /insert random fix/i }).click();
    await expect(list.locator("li")).toHaveCount(initial + 1);
  });

  test("adds a tag at the end of the commits list", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("v1.0.0").fill("v9.9.9");
    await page.getByRole("button", { name: /add tag/i }).click();
    await expect(page.locator('[data-testid="tag-list"]')).toContainText("v9.9.9");
  });
});
