import { expect, test } from "@playwright/test";
import { createUser, expectSaved, openAs, shareBoard, signIn, uniqueName } from "./support";

test("owner shares a board through the UI and a viewer gets read-only access", async ({ browser, request }) => {
  const owner = await createUser(request, { seedBoard: true });
  const viewer = await createUser(request);

  const ownerPage = await (await browser.newContext()).newPage();
  await openAs(ownerPage, owner);
  await ownerPage.getByRole("button", { name: "Share (1)" }).click();
  await ownerPage.getByLabel("Share with username").fill(viewer.username);
  await ownerPage.getByLabel("Share role").selectOption("viewer");
  await ownerPage.getByRole("button", { name: "Share", exact: true }).click();
  await expect(ownerPage.getByTestId("board-members")).toContainText(`@${viewer.username}`);

  const viewerPage = await (await browser.newContext()).newPage();
  await viewerPage.addInitScript((token) => localStorage.setItem("pm-token", token), viewer.token);
  await viewerPage.goto("/");
  const boardList = viewerPage.getByRole("complementary", { name: "Boards" });
  await boardList.getByRole("button", { name: new RegExp(`shared by ${owner.username}`) }).click();

  await expect(viewerPage.getByText("Read only")).toBeVisible();
  await expect(viewerPage.getByTestId("card-card-1")).toBeVisible();
  await expect(viewerPage.getByRole("button", { name: /add a card/i })).toHaveCount(0);
  await expect(viewerPage.getByLabel("Message")).toHaveCount(0);
});

test("an editor's changes are visible to the owner", async ({ browser, request }) => {
  const owner = await createUser(request, { seedBoard: true });
  const editor = await createUser(request);
  await shareBoard(request, owner, editor.username, "editor");

  const editorPage = await (await browser.newContext()).newPage();
  await editorPage.addInitScript((token) => localStorage.setItem("pm-token", token), editor.token);
  await editorPage.goto("/");
  await editorPage
    .getByRole("complementary", { name: "Boards" })
    .getByRole("button", { name: new RegExp(`shared by ${owner.username} \\(editor\\)`) })
    .click();

  const card = editorPage.getByTestId("card-card-4");
  await card.getByRole("button", { name: "Edit Refine status language" }).click();
  await card.getByLabel("Assignee").selectOption(editor.username);
  await card.getByRole("button", { name: "Save" }).click();
  await expectSaved(editorPage);

  const ownerPage = await (await browser.newContext()).newPage();
  await openAs(ownerPage, owner);
  await expect(ownerPage.getByTestId("card-card-4")).toContainText(`@${editor.username}`);

  // The owner removes the editor, who then loses access.
  await ownerPage.getByRole("button", { name: "Share (2)" }).click();
  await ownerPage.getByRole("button", { name: `Remove ${editor.username}` }).click();
  await expect(ownerPage.getByTestId("board-members")).not.toContainText(`@${editor.username}`);

  await editorPage.reload();
  await expect(
    editorPage.getByRole("complementary", { name: "Boards" }).getByRole("button", { name: /shared by/ })
  ).toHaveCount(0);
});

test("admin creates and deletes a user", async ({ page }) => {
  const username = uniqueName("adm");
  await signIn(page, "user", "password");
  await page.getByRole("button", { name: "Users" }).click();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display name").fill("Made By Admin");
  await page.getByLabel("Initial password").fill("secret-pass");
  await page.getByRole("button", { name: "Add user" }).click();
  const row = page.getByTestId(`user-row-${username}`);
  await expect(row).toContainText("Made By Admin");

  const response = await page.request.post("/api/auth/login", { data: { username, password: "secret-pass" } });
  expect(response.status()).toBe(200);

  page.on("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: `Delete ${username}` }).click();
  await expect(row).toHaveCount(0);
});
