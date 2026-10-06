import { vi } from "vitest";
import {
  ApiError,
  createBoard,
  deleteBoard,
  fetchBoard,
  login,
  saveBoardData,
  sendAIChat,
  setMember,
  UNAUTHORIZED_EVENT,
} from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import boardFixture from "@/lib/kanban-fixture.json";

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("logs in without an auth header", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { token: "t", user: { username: "user" } }));
    const result = await login("user", "password");

    expect(result.token).toBe("t");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ username: "user", password: "password" });
  });

  it("sends the bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 3, data: boardFixture }));
    await fetchBoard("secret", 3);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/boards/3");
    expect(init?.headers).toEqual({ Authorization: "Bearer secret" });
  });

  it("sends board data with PUT", async () => {
    const board = structuredClone(boardFixture) as BoardData;
    fetchMock.mockResolvedValue(jsonResponse(200, board));
    await saveBoardData("t", 7, board);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/boards/7/data");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual(board);
  });

  it("posts board creation and chat payloads", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    await createBoard("t", "Launch", "Q3");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ name: "Launch", description: "Q3" });

    fetchMock.mockResolvedValue(jsonResponse(200, { message: "ok", boardUpdate: null }));
    await sendAIChat("t", 4, "hi", [{ role: "user", content: "before" }]);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/boards/4/ai/chat");
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      prompt: "hi",
      history: [{ role: "user", content: "before" }],
    });
  });

  it("encodes usernames in member urls", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await setMember("t", 1, "a.b c", "viewer");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/boards/1/members/a.b%20c");
  });

  it("handles empty 204 responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteBoard("t", 1)).resolves.toBeUndefined();
  });

  it("surfaces backend error details", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { detail: "Username is already taken." }));
    await expect(login("user", "x")).rejects.toEqual(new ApiError("Username is already taken.", 409));
  });

  it("surfaces the first validation error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: [{ loc: ["body"], msg: "Value error, Labels must be unique per card." }] })
    );
    await expect(saveBoardData("t", 1, boardFixture as BoardData)).rejects.toThrow(
      "Labels must be unique per card."
    );
  });

  it("falls back to a generic message", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(fetchBoard("t", 1)).rejects.toThrow("Request failed with status 500.");
  });

  it("broadcasts expired sessions", async () => {
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "Session expired. Please sign in again." }));

    await expect(fetchBoard("old", 1)).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);

    // A failed login is not an expired session.
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: "Invalid username or password." }));
    await expect(login("user", "bad")).rejects.toThrow("Invalid username or password.");
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
});
