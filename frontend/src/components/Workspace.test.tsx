import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Workspace } from "@/components/Workspace";
import type { BoardSummary, User } from "@/lib/api";

const api = vi.hoisted(() => ({
  listBoards: vi.fn(),
  createBoard: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

vi.mock("@/components/KanbanBoard", () => ({
  KanbanBoard: ({ boardId }: { boardId: number }) => <p>Board view {boardId}</p>,
}));
vi.mock("@/components/AccountSettings", () => ({ AccountSettings: () => <p>Account view</p> }));
vi.mock("@/components/UserAdmin", () => ({ UserAdmin: () => <p>Users view</p> }));

const admin: User = { id: 1, username: "user", displayName: "Demo User", isAdmin: true, createdAt: "" };

const summary = (id: number, name: string, extra: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  name,
  description: "",
  owner: "user",
  role: "owner",
  cardCount: 0,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

const renderWorkspace = (user = admin) =>
  render(<Workspace token="tok" user={user} onUserChange={() => {}} onLogout={() => {}} />);

describe("Workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    api.listBoards.mockResolvedValue([
      summary(1, "Roadmap", { cardCount: 3 }),
      summary(2, "Team space", { owner: "alice", role: "viewer", cardCount: 1 }),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists boards and opens the first one", async () => {
    renderWorkspace();
    expect(await screen.findByText("Board view 1")).toBeInTheDocument();
    const list = screen.getByRole("complementary", { name: "Boards" });
    expect(within(list).getByText("3 cards")).toBeInTheDocument();
    expect(within(list).getByText(/shared by alice \(viewer\)/)).toBeInTheDocument();
    expect(screen.getByTestId("current-user")).toHaveTextContent("Demo User");
  });

  it("switches boards and remembers the choice", async () => {
    const { unmount } = renderWorkspace();
    await screen.findByText("Board view 1");
    await userEvent.click(screen.getByRole("button", { name: /Team space/ }));
    expect(screen.getByText("Board view 2")).toBeInTheDocument();
    expect(localStorage.getItem("pm-board-user")).toBe("2");

    unmount();
    renderWorkspace();
    expect(await screen.findByText("Board view 2")).toBeInTheDocument();
  });

  it("falls back to the first board when the remembered one is gone", async () => {
    localStorage.setItem("pm-board-user", "99");
    renderWorkspace();
    expect(await screen.findByText("Board view 1")).toBeInTheDocument();
  });

  it("creates a board and selects it", async () => {
    api.createBoard.mockResolvedValue({ ...summary(3, "Launch"), data: {} });
    renderWorkspace();
    await screen.findByText("Board view 1");

    api.listBoards.mockResolvedValue([summary(1, "Roadmap"), summary(3, "Launch")]);
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Launch");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(api.createBoard).toHaveBeenCalledWith("tok", "Launch", ""));
    expect(await screen.findByText("Board view 3")).toBeInTheDocument();
  });

  it("shows an error when board creation fails", async () => {
    api.createBoard.mockRejectedValue(new Error("Name too long"));
    renderWorkspace();
    await screen.findByText("Board view 1");
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Name too long")).toBeInTheDocument();
  });

  it("shows an empty state without boards", async () => {
    api.listBoards.mockResolvedValue([]);
    renderWorkspace();
    expect(await screen.findByText(/You have no boards yet/)).toBeInTheDocument();
  });

  it("retries when boards fail to load", async () => {
    api.listBoards.mockRejectedValueOnce(new Error("Offline"));
    renderWorkspace();
    expect(await screen.findByText("Offline")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Board view 1")).toBeInTheDocument();
  });

  it("navigates to account and admin views", async () => {
    renderWorkspace();
    await screen.findByText("Board view 1");
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Account view")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Users" }));
    expect(screen.getByText("Users view")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByText("Board view 1")).toBeInTheDocument();
  });

  it("hides user management from non-admins", async () => {
    renderWorkspace({ ...admin, isAdmin: false });
    await screen.findByText("Board view 1");
    expect(screen.queryByRole("button", { name: "Users" })).not.toBeInTheDocument();
  });
});
