import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { ApiError, UNAUTHORIZED_EVENT, type User } from "@/lib/api";

const user: User = { id: 1, username: "user", displayName: "Demo User", isAdmin: true, createdAt: "2026-01-01" };

const api = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  fetchMe: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

vi.mock("@/components/Workspace", () => ({
  Workspace: ({ user, onLogout }: { user: User; onLogout: () => void }) => (
    <>
      <h1>Kanban Studio</h1>
      <p>Hello {user.displayName}</p>
      <button onClick={onLogout}>Log out</button>
    </>
  ),
}));

const fillLogin = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    api.login.mockResolvedValue({ token: "tok", user });
    api.register.mockResolvedValue({ token: "new-tok", user: { ...user, username: "alice", displayName: "Alice" } });
    api.logout.mockResolvedValue(undefined);
    api.fetchMe.mockResolvedValue(user);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks board access before login", () => {
    render(<AppShell />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Kanban Studio" })).not.toBeInTheDocument();
  });

  it("shows the server error for invalid credentials", async () => {
    api.login.mockRejectedValueOnce(new ApiError("Invalid username or password.", 401));
    render(<AppShell />);
    await fillLogin("user", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.queryByRole("heading", { name: "Kanban Studio" })).not.toBeInTheDocument();
    expect(localStorage.getItem("pm-token")).toBeNull();
  });

  it("logs in, stores the token and logs out", async () => {
    render(<AppShell />);
    await fillLogin("user", "password");

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith("user", "password");
    expect(localStorage.getItem("pm-token")).toBe("tok");

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledWith("tok");
    expect(localStorage.getItem("pm-token")).toBeNull();
  });

  it("registers a new account", async () => {
    render(<AppShell />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Username"), "alice");
    await userEvent.type(screen.getByLabelText("Display name (optional)"), "Alice");
    await userEvent.type(screen.getByLabelText("Password"), "secret-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Hello Alice")).toBeInTheDocument();
    expect(api.register).toHaveBeenCalledWith("alice", "secret-pass", "Alice");
    expect(localStorage.getItem("pm-token")).toBe("new-tok");
  });

  it("restores a stored session", async () => {
    localStorage.setItem("pm-token", "stored");
    render(<AppShell />);
    expect(await screen.findByText("Hello Demo User")).toBeInTheDocument();
    expect(api.fetchMe).toHaveBeenCalledWith("stored");
  });

  it("offers retry when the account cannot be loaded", async () => {
    localStorage.setItem("pm-token", "stored");
    api.fetchMe.mockRejectedValueOnce(new Error("Network down"));
    render(<AppShell />);

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Hello Demo User")).toBeInTheDocument();
  });

  it("signs out when the session expires", async () => {
    localStorage.setItem("pm-token", "stored");
    render(<AppShell />);
    await screen.findByText("Hello Demo User");

    act(() => {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    });
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("pm-token")).toBeNull();
  });
});
