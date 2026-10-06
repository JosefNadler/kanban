import { expect, test } from "@playwright/test";
import { createUser, signIn, uniqueName } from "./support";

test("blocks the app before sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toHaveCount(0);
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("seeded demo user signs in to the demo board", async ({ page }) => {
  await signIn(page, "user", "password");
  await expect(page.getByTestId("current-user")).toHaveText("Demo User");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByTestId("card-card-1")).toContainText("Align roadmap themes");
  await expect(page.getByRole("button", { name: "Users" })).toBeVisible();
});

test("registers a new account with a starter board and stays signed in after reload", async ({ page }) => {
  const username = uniqueName("reg");
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display name (optional)").fill("Reggie");
  await page.getByLabel("Password").fill("secret-pass");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByTestId("current-user")).toHaveText("Reggie");
  await expect(page.getByLabel("Board name")).toHaveValue("My first board");
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Users" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("current-user")).toHaveText("Reggie");
});

test("shows a server error for a taken username", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("secret-pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Username is already taken.")).toBeVisible();
});

test("logs out and the old session no longer works", async ({ page, request }) => {
  const user = await createUser(request);
  await signIn(page, user.username, user.password);
  const token = await page.evaluate(() => localStorage.getItem("pm-token"));

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const response = await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(401);
});

test("an expired session returns to sign in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pm-token", "expired-token"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("changes the password from account settings", async ({ page }) => {
  const username = uniqueName("pw");
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("first-pass");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByRole("button", { name: "Account" }).click();
  await page.getByLabel("Display name").fill("Renamed Person");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByTestId("current-user")).toHaveText("Renamed Person");

  await page.getByLabel("Current password").fill("first-pass");
  await page.getByLabel("New password", { exact: true }).fill("second-pass");
  await page.getByLabel("Confirm new password").fill("second-pass");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, username, "second-pass");
});
