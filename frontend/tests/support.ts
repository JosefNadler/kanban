import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import boardFixture from "../src/lib/kanban-fixture.json";

export type TestUser = {
  username: string;
  password: string;
  token: string;
  boardId: number;
};

let counter = 0;

// Every test works with its own users, so tests stay independent on the shared e2e database.
export const uniqueName = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export const createUser = async (
  request: APIRequestContext,
  { seedBoard = false }: { seedBoard?: boolean } = {}
): Promise<TestUser> => {
  const username = uniqueName("u");
  const password = "secret-pass";
  const response = await request.post("/api/auth/register", { data: { username, password } });
  expect(response.status()).toBe(201);
  const { token } = await response.json();

  const boards = await (await request.get("/api/boards", { headers: authHeaders(token) })).json();
  const boardId = boards[0].id as number;

  if (seedBoard) {
    const saved = await request.put(`/api/boards/${boardId}/data`, {
      headers: authHeaders(token),
      data: boardFixture,
    });
    expect(saved.status()).toBe(200);
  }

  return { username, password, token, boardId };
};

export const shareBoard = async (
  request: APIRequestContext,
  owner: TestUser,
  username: string,
  role: "editor" | "viewer"
) => {
  const response = await request.put(`/api/boards/${owner.boardId}/members/${username}`, {
    headers: authHeaders(owner.token),
    data: { role },
  });
  expect(response.status()).toBe(200);
};

export const signIn = async (page: Page, username: string, password: string) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

// Skips the login form by reusing an API session token.
export const openAs = async (page: Page, user: TestUser) => {
  await page.addInitScript((token) => localStorage.setItem("pm-token", token), user.token);
  await page.goto("/");
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
};

export const dragTo = async (page: Page, source: Locator, target: Locator, offsetY?: number) => {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + (offsetY ?? targetBox.height / 2), {
    steps: 12,
  });
  await page.mouse.up();
};

export const expectSaved = (page: Page) => expect(page.getByText("All changes saved")).toBeVisible();
