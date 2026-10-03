import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AppShell } from "@/components/AppShell";

vi.mock("@/components/KanbanBoard", () => ({
  KanbanBoard: () => <h1>Kanban Studio</h1>,
}));

const login = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("blocks board access before login", () => {
    render(<AppShell />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });

  it("rejects invalid credentials", async () => {
    render(<AppShell />);
    await login("wrong-user", "wrong-password");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid username or password."
    );
    expect(
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });

  it("allows login and logout", async () => {
    render(<AppShell />);
    await login("user", "password");
    expect(screen.getByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
    expect(localStorage.getItem("pm-authenticated")).toBe("true");
    expect(localStorage.getItem("pm-username")).toBe("user");

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("pm-authenticated")).toBeNull();
    expect(localStorage.getItem("pm-username")).toBeNull();
  });
});
