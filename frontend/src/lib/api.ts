import type { BoardData } from "@/lib/kanban";

export type User = {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
};

export type BoardRole = "owner" | "editor" | "viewer";

export type BoardSummary = {
  id: number;
  name: string;
  description: string;
  owner: string;
  role: BoardRole;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BoardDetail = BoardSummary & { data: BoardData };

export type Member = {
  username: string;
  displayName: string;
  role: BoardRole;
};

export type AuthResult = { token: string; user: User };

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResult = {
  message: string;
  boardUpdate: BoardData | null;
};

export const UNAUTHORIZED_EVENT = "pm-unauthorized";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const errorMessage = (payload: unknown, status: number) => {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  // FastAPI validation errors: [{loc, msg}, ...]
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg.replace(/^Value error, /, "");
  }
  return `Request failed with status ${status}.`;
};

const request = async <T>(
  path: string,
  { token, method = "GET", body }: { token?: string; method?: string; body?: unknown } = {}
): Promise<T> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }
  return payload as T;
};

// Auth

export const login = (username: string, password: string) =>
  request<AuthResult>("/api/auth/login", { method: "POST", body: { username, password } });

export const register = (username: string, password: string, displayName: string) =>
  request<AuthResult>("/api/auth/register", {
    method: "POST",
    body: { username, password, displayName },
  });

export const logout = (token: string) => request<void>("/api/auth/logout", { token, method: "POST" });

export const fetchMe = (token: string) => request<User>("/api/auth/me", { token });

export const updateProfile = (token: string, displayName: string) =>
  request<User>("/api/auth/me", { token, method: "PATCH", body: { displayName } });

export const changePassword = (token: string, currentPassword: string, newPassword: string) =>
  request<void>("/api/auth/me/password", {
    token,
    method: "POST",
    body: { currentPassword, newPassword },
  });

// Users

export const listUsers = (token: string) => request<User[]>("/api/users", { token });

export const createUser = (
  token: string,
  user: { username: string; password: string; displayName: string; isAdmin: boolean }
) => request<User>("/api/users", { token, method: "POST", body: user });

export const updateUser = (
  token: string,
  userId: number,
  patch: { displayName?: string; isAdmin?: boolean; password?: string }
) => request<User>(`/api/users/${userId}`, { token, method: "PATCH", body: patch });

export const deleteUser = (token: string, userId: number) =>
  request<void>(`/api/users/${userId}`, { token, method: "DELETE" });

// Boards

export const listBoards = (token: string) => request<BoardSummary[]>("/api/boards", { token });

export const createBoard = (token: string, name: string, description: string) =>
  request<BoardDetail>("/api/boards", { token, method: "POST", body: { name, description } });

export const fetchBoard = (token: string, boardId: number) =>
  request<BoardDetail>(`/api/boards/${boardId}`, { token });

export const updateBoardMeta = (
  token: string,
  boardId: number,
  patch: { name?: string; description?: string }
) => request<BoardSummary>(`/api/boards/${boardId}`, { token, method: "PATCH", body: patch });

export const saveBoardData = (token: string, boardId: number, data: BoardData) =>
  request<BoardData>(`/api/boards/${boardId}/data`, { token, method: "PUT", body: data });

export const deleteBoard = (token: string, boardId: number) =>
  request<void>(`/api/boards/${boardId}`, { token, method: "DELETE" });

export const listMembers = (token: string, boardId: number) =>
  request<Member[]>(`/api/boards/${boardId}/members`, { token });

export const setMember = (token: string, boardId: number, username: string, role: "editor" | "viewer") =>
  request<Member[]>(`/api/boards/${boardId}/members/${encodeURIComponent(username)}`, {
    token,
    method: "PUT",
    body: { role },
  });

export const removeMember = (token: string, boardId: number, username: string) =>
  request<Member[]>(`/api/boards/${boardId}/members/${encodeURIComponent(username)}`, {
    token,
    method: "DELETE",
  });

export const sendAIChat = (
  token: string,
  boardId: number,
  prompt: string,
  history: AIChatMessage[]
) =>
  request<AIChatResult>(`/api/boards/${boardId}/ai/chat`, {
    token,
    method: "POST",
    body: { prompt, history },
  });
