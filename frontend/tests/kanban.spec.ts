import { expect, test, type Page } from "@playwright/test";
import boardFixture from "../src/lib/kanban-fixture.json";

const createApiState = () => structuredClone(boardFixture);

const mockBoardApi = async (page: Page) => {
  let board = createApiState();
  await page.route("**/api/board", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, json: board });
      return;
    }
    if (request.method() === "PUT") {
      const nextBoard = request.postDataJSON();
      board = nextBoard;
      await route.fulfill({ status: 200, json: board });
      return;
    }
    await route.fulfill({ status: 405, json: { detail: "Method not allowed" } });
  });
};

const login = async (page: Page) => {
  await mockBoardApi(page);
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test("blocks board before login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("invalid");
  await page.getByLabel("Password").fill("invalid");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("loads the kanban board after login", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("moves a card into an empty column", async ({ page }) => {
  await page.goto("/");
  await login(page);

  const discoveryColumn = page.getByTestId("column-col-discovery");
  const reviewColumn = page.getByTestId("column-col-review");

  const firstMoveCard = page.getByTestId("card-card-3");
  const firstCardBox = await firstMoveCard.boundingBox();
  const reviewBox = await reviewColumn.boundingBox();
  if (!firstCardBox || !reviewBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    firstCardBox.x + firstCardBox.width / 2,
    firstCardBox.y + firstCardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    reviewBox.x + reviewBox.width / 2,
    reviewBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(discoveryColumn.getByText("Drop a card here")).toBeVisible();

  const secondMoveCard = page.getByTestId("card-card-1");
  const secondCardBox = await secondMoveCard.boundingBox();
  const discoveryBox = await discoveryColumn.boundingBox();
  if (!secondCardBox || !discoveryBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    secondCardBox.x + secondCardBox.width / 2,
    secondCardBox.y + secondCardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    discoveryBox.x + discoveryBox.width / 2,
    discoveryBox.y + discoveryBox.height / 2,
    { steps: 12 }
  );
  await page.mouse.up();

  await expect(discoveryColumn.getByTestId("card-card-1")).toBeVisible();
});

test("logs out back to sign in", async ({ page }) => {
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
