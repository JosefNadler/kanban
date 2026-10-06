import { expect, test } from "@playwright/test";
import { createUser, dragTo, expectSaved, openAs } from "./support";

test("adds a card with details and it persists after reload", async ({ page, request }) => {
  const user = await createUser(request, { seedBoard: true });
  await openAs(page, user);

  const column = page.getByTestId("column-col-review");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByLabel("Card title").fill("Write release notes");
  await column.getByLabel("Details").fill("Cover new boards and sharing.");
  await column.getByLabel("Priority").selectOption("high");
  await column.getByLabel("Due date").fill("2031-03-15");
  await column.getByLabel("Labels").fill("docs, release");
  await column.getByLabel("Assignee").selectOption(user.username);
  await column.getByRole("button", { name: "Add card" }).click();
  await expectSaved(page);

  await page.reload();
  const card = page.getByTestId("column-col-review").locator("article", { hasText: "Write release notes" });
  await expect(card).toContainText("Cover new boards and sharing.");
  await expect(card).toContainText("high");
  await expect(card).toContainText("Due 2031-03-15");
  await expect(card).toContainText("docs");
  await expect(card).toContainText("release");
  await expect(card).toContainText(`@${user.username}`);
});

test("edits and deletes cards, persisting both", async ({ page, request }) => {
  const user = await createUser(request, { seedBoard: true });
  await openAs(page, user);

  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await card.getByLabel("Card title").fill("Edited in e2e");
  await card.getByLabel("Due date").fill("2020-01-01");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("card-card-1")).toContainText("Overdue 2020-01-01");

  await page.getByRole("button", { name: "Delete Gather customer signals", exact: true }).click();
  await expectSaved(page);

  await page.reload();
  await expect(page.getByTestId("card-card-1")).toContainText("Edited in e2e");
  await expect(page.getByTestId("card-card-2")).toHaveCount(0);
});

test("drags cards between columns and into an empty column", async ({ page, request }) => {
  const user = await createUser(request, { seedBoard: true });
  await openAs(page, user);

  const discovery = page.getByTestId("column-col-discovery");
  const review = page.getByTestId("column-col-review");

  await dragTo(page, page.getByTestId("card-card-3"), review, 120);
  await expect(review.getByTestId("card-card-3")).toBeVisible();
  await expect(discovery.getByText("Drop a card here")).toBeVisible();

  await dragTo(page, page.getByTestId("card-card-1"), discovery);
  await expect(discovery.getByTestId("card-card-1")).toBeVisible();
  await expectSaved(page);

  await page.reload();
  await expect(page.getByTestId("column-col-review").getByTestId("card-card-3")).toBeVisible();
  await expect(page.getByTestId("column-col-discovery").getByTestId("card-card-1")).toBeVisible();
});

test("manages columns and persists the layout", async ({ page, request }) => {
  const user = await createUser(request);
  await openAs(page, user);

  await page.getByTestId("column-col-backlog").getByLabel("Column title").fill("Ideas");
  await page.getByTestId("column-col-backlog").getByLabel("Column title").press("Enter");
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByRole("button", { name: "Move Blocked left" }).click();
  await page.getByRole("button", { name: "Delete Discovery" }).click();
  await expectSaved(page);

  await page.reload();
  const titles = page.getByLabel("Column title", { exact: true });
  await expect(titles).toHaveCount(5);
  await expect(titles.nth(0)).toHaveValue("Ideas");
  await expect(titles.nth(1)).toHaveValue("In Progress");
  await expect(titles.nth(2)).toHaveValue("Review");
  await expect(titles.nth(3)).toHaveValue("Blocked");
  await expect(titles.nth(4)).toHaveValue("Done");
});

test("filters cards by search and label", async ({ page, request }) => {
  const user = await createUser(request, { seedBoard: true });
  await openAs(page, user);

  await page.getByLabel("Search cards").fill("prototype");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);
  await expect(page.getByTestId("card-card-3")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by label").selectOption("research");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(1);
  await expect(page.getByTestId("card-card-2")).toBeVisible();
});

test("creates, renames, switches and deletes boards", async ({ page, request }) => {
  const user = await createUser(request, { seedBoard: true });
  await openAs(page, user);
  page.on("dialog", (dialog) => dialog.accept());

  const boardList = page.getByRole("complementary", { name: "Boards" });
  await boardList.getByRole("button", { name: "New board" }).click();
  await boardList.getByLabel("Board name").fill("Launch plan");
  await boardList.getByRole("button", { name: "Create" }).click();

  const nameInput = page.locator("main, body").getByLabel("Board name").last();
  await expect(nameInput).toHaveValue("Launch plan");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  await nameInput.fill("Launch 2031");
  await nameInput.press("Enter");
  await expect(boardList.getByRole("button", { name: /Launch 2031/ })).toBeVisible();

  await boardList.getByRole("button", { name: /My first board/ }).click();
  await expect(page.getByTestId("card-card-1")).toBeVisible();
  await expect(boardList.getByText("8 cards")).toBeVisible();

  // The selected board is remembered across reloads.
  await boardList.getByRole("button", { name: /Launch 2031/ }).click();
  await page.reload();
  await expect(page.getByLabel("Board name").last()).toHaveValue("Launch 2031");

  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(boardList.getByRole("button", { name: /Launch 2031/ })).toHaveCount(0);
  await expect(page.getByTestId("card-card-1")).toBeVisible();
});

test("AI chat applies a board update", async ({ page, request }) => {
  const user = await createUser(request, { seedBoard: true });
  await openAs(page, user);

  // OpenRouter is not called in e2e; the chat endpoint is mocked with a realistic update.
  await page.route("**/api/boards/*/ai/chat", async (route) => {
    const board = await (
      await request.get(`/api/boards/${user.boardId}`, { headers: { Authorization: `Bearer ${user.token}` } })
    ).json();
    board.data.columns[0].title = "AI Updated";
    await route.fulfill({ json: { message: "Renamed the first column.", boardUpdate: board.data } });
  });

  await page.getByLabel("Message").fill("Rename the first column");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Renamed the first column.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue("AI Updated");
});
