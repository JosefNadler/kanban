import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import type { BoardDetail, BoardRole, Member, User } from "@/lib/api";
import boardFixture from "@/lib/kanban-fixture.json";

const api = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  listMembers: vi.fn(),
  saveBoardData: vi.fn(),
  updateBoardMeta: vi.fn(),
  deleteBoard: vi.fn(),
  removeMember: vi.fn(),
  setMember: vi.fn(),
  sendAIChat: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

const currentUser: User = { id: 1, username: "user", displayName: "Demo", isAdmin: false, createdAt: "" };
const members: Member[] = [
  { username: "user", displayName: "Demo", role: "owner" },
  { username: "alice", displayName: "Alice", role: "editor" },
];

const makeBoard = () => structuredClone(boardFixture) as BoardData;

const makeDetail = (role: BoardRole = "owner"): BoardDetail => ({
  id: 7,
  name: "Launch",
  description: "Q3 launch",
  owner: "user",
  role,
  cardCount: 8,
  createdAt: "",
  updatedAt: "",
  data: makeBoard(),
});

const onBoardsChanged = vi.fn(async () => {});

const renderBoard = async (role: BoardRole = "owner") => {
  api.fetchBoard.mockResolvedValue(makeDetail(role));
  render(<KanbanBoard token="tok" boardId={7} currentUser={currentUser} onBoardsChanged={onBoardsChanged} />);
  await screen.findAllByTestId(/^column-/);
};

const savedBoards = () => api.saveBoardData.mock.calls.map((call) => call[2] as BoardData);
const getColumn = (id = "col-backlog") => screen.getByTestId(`column-${id}`);

describe("KanbanBoard", () => {
  beforeEach(() => {
    localStorage.clear();
    api.listMembers.mockResolvedValue(members);
    api.saveBoardData.mockImplementation(async (_t, _id, board) => board);
    api.updateBoardMeta.mockImplementation(async (_t, _id, patch) => ({ ...makeDetail(), ...patch }));
    api.sendAIChat.mockResolvedValue({ message: "Acknowledged.", boardUpdate: null });
    api.deleteBoard.mockResolvedValue(undefined);
    api.removeMember.mockResolvedValue([members[0]]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("loads board data and members", async () => {
    await renderBoard();
    expect(api.fetchBoard).toHaveBeenCalledWith("tok", 7);
    expect(api.listMembers).toHaveBeenCalledWith("tok", 7);
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
    expect(screen.getByLabelText("Board name")).toHaveValue("Launch");
    expect(screen.getByRole("button", { name: "Share (2)" })).toBeInTheDocument();
  });

  it("shows an error with retry when loading fails", async () => {
    api.fetchBoard.mockRejectedValueOnce(new Error("Board not found."));
    render(<KanbanBoard token="tok" boardId={7} currentUser={currentUser} onBoardsChanged={onBoardsChanged} />);
    expect(await screen.findByText("Board not found.")).toBeInTheDocument();

    api.fetchBoard.mockResolvedValue(makeDetail());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("renames a column with a single save on Enter", async () => {
    await renderBoard();
    const input = within(getColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name{Enter}");

    await waitFor(() => expect(api.saveBoardData).toHaveBeenCalledTimes(1));
    expect(api.saveBoardData.mock.calls[0].slice(0, 2)).toEqual(["tok", 7]);
    expect(savedBoards()[0].columns[0].title).toBe("New Name");
    await waitFor(() => expect(onBoardsChanged).toHaveBeenCalled());
  });

  it("restores the column title when cleared", async () => {
    await renderBoard();
    const input = within(getColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();

    expect(input).toHaveValue("Backlog");
    expect(api.saveBoardData).not.toHaveBeenCalled();
  });

  it("adds, moves and deletes columns", async () => {
    await renderBoard();
    await userEvent.type(screen.getByLabelText("New column title"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getAllByTestId(/^column-/)).toHaveLength(6);

    await userEvent.click(screen.getByRole("button", { name: "Move Blocked left" }));
    const titles = () => screen.getAllByLabelText("Column title").map((input) => (input as HTMLInputElement).value);
    expect(titles()).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Blocked", "Done"]);

    // Columns with cards cannot be deleted.
    expect(screen.getByRole("button", { name: "Delete Backlog" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Delete Blocked" }));
    expect(titles()).toEqual(["Backlog", "Discovery", "In Progress", "Review", "Done"]);

    await waitFor(() => expect(savedBoards().at(-1)!.columns).toHaveLength(5));
  });

  it("edits a card's fields", async () => {
    await renderBoard();
    const column = getColumn();
    await userEvent.click(within(column).getByRole("button", { name: "Edit Align roadmap themes" }));
    const titleInput = within(column).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Edited title");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "low");
    await userEvent.type(within(column).getByLabelText("Due date"), "2020-05-01");
    const labels = within(column).getByLabelText("Labels");
    await userEvent.clear(labels);
    await userEvent.type(labels, "ops, infra");
    await userEvent.selectOptions(within(column).getByLabelText("Assignee"), "alice");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByText("Edited title")).toBeInTheDocument();
    expect(within(card).getByText("low")).toBeInTheDocument();
    expect(within(card).getByText(/Overdue/)).toBeInTheDocument();
    expect(within(card).getByText("ops")).toBeInTheDocument();
    expect(within(card).getByText("@alice")).toBeInTheDocument();

    await waitFor(() => expect(api.saveBoardData).toHaveBeenCalledTimes(1));
    expect(savedBoards()[0].cards["card-1"]).toEqual({
      id: "card-1",
      title: "Edited title",
      details: "Draft quarterly themes with impact statements and metrics.",
      priority: "low",
      dueDate: "2020-05-01",
      labels: ["ops", "infra"],
      assignee: "alice",
    });
  });

  it("adds and removes a card", async () => {
    await renderBoard();
    const column = getColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByLabelText("Card title"), "New card");
    await userEvent.type(within(column).getByLabelText("Details"), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(within(column).getByText("New card")).toBeInTheDocument();

    await userEvent.click(within(column).getByRole("button", { name: /delete new card/i }));
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    await waitFor(() => expect(api.saveBoardData).toHaveBeenCalled());
  });

  it("sends only the latest board after an in-flight save", async () => {
    let resolveFirst: () => void = () => {};
    api.saveBoardData.mockImplementationOnce(
      (_t, _id, board) => new Promise((resolve) => (resolveFirst = () => resolve(board)))
    );
    await renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Gather customer signals" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Ship marketing page" }));
    expect(api.saveBoardData).toHaveBeenCalledTimes(1);

    resolveFirst();
    await waitFor(() => expect(api.saveBoardData).toHaveBeenCalledTimes(2));
    const lastSaved = savedBoards()[1];
    expect(Object.keys(lastSaved.cards)).not.toContain("card-7");
    expect(Object.keys(lastSaved.cards)).not.toContain("card-2");
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
  });

  it("shows unsaved state and retries a failed save", async () => {
    api.saveBoardData.mockRejectedValueOnce(new Error("Disk full"));
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));

    expect(await screen.findByText("Disk full")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    expect(api.saveBoardData).toHaveBeenCalledTimes(2);
  });

  it("filters cards by text and priority", async () => {
    await renderBoard();
    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);
    expect(within(getColumn()).getByText("1/2")).toBeInTheDocument();
    expect(within(getColumn("col-done")).getByText("No matching cards")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(8);

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "medium");
    expect(screen.getAllByTestId(/^card-/).map((card) => card.dataset.testid)).toEqual(["card-card-3"]);

    await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "");
    await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "design");
    expect(screen.getAllByTestId(/^card-/).map((card) => card.dataset.testid)).toEqual(["card-card-5"]);
  });

  it("renames the board and its description", async () => {
    await renderBoard();
    const name = screen.getByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.type(name, "Relaunch{Enter}");
    await waitFor(() => expect(api.updateBoardMeta).toHaveBeenCalledWith("tok", 7, { name: "Relaunch" }));

    const description = screen.getByLabelText("Board description");
    await userEvent.clear(description);
    await userEvent.type(description, "New goal{Enter}");
    await waitFor(() =>
      expect(api.updateBoardMeta).toHaveBeenLastCalledWith("tok", 7, { description: "New goal" })
    );
    expect(onBoardsChanged).toHaveBeenCalled();
  });

  it("deletes the board after confirmation", async () => {
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(window.confirm).toHaveBeenCalledWith('Delete "Launch" and all of its cards?');
    await waitFor(() => expect(api.deleteBoard).toHaveBeenCalledWith("tok", 7));
    expect(onBoardsChanged).toHaveBeenCalled();
  });

  it("keeps the board when deletion is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(api.deleteBoard).not.toHaveBeenCalled();
  });

  it("lets a member leave a shared board", async () => {
    await renderBoard("editor");
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith("tok", 7, "user"));
  });

  it("is read-only for viewers", async () => {
    await renderBoard("viewer");
    expect(screen.getByText("Read only")).toBeInTheDocument();
    expect(screen.queryByLabelText("Board name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Column title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add a card/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New column title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI assistant" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Members (2)" })).toBeInTheDocument();
  });

  it("hides the AI assistant and remembers the choice", async () => {
    await renderBoard();
    const toggle = screen.getByRole("button", { name: "AI assistant" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(toggle);
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    expect(localStorage.getItem("pm-chat-open")).toBe("false");

    await userEvent.click(toggle);
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(localStorage.getItem("pm-chat-open")).toBe("true");
  });

  it("sends chat prompts with history", async () => {
    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "What should I do next?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(api.sendAIChat).toHaveBeenCalledWith("tok", 7, "What should I do next?", []));
    expect(screen.getByText("What should I do next?")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Message"), "And then?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(api.sendAIChat).toHaveBeenLastCalledWith("tok", 7, "And then?", [
        { role: "user", content: "What should I do next?" },
        { role: "assistant", content: "Acknowledged." },
      ])
    );
  });

  it("applies board update from AI response", async () => {
    const nextBoard = makeBoard();
    nextBoard.columns[0].title = "AI Updated";
    api.sendAIChat.mockResolvedValueOnce({ message: "Updated the board.", boardUpdate: nextBoard });

    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "Rename first column");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Updated the board.");
    await waitFor(() => expect(screen.getByDisplayValue("AI Updated")).toBeInTheDocument());
    expect(onBoardsChanged).toHaveBeenCalled();
  });

  it("shows retry when chat request fails", async () => {
    api.sendAIChat
      .mockRejectedValueOnce(new Error("AI unavailable"))
      .mockResolvedValueOnce({ message: "Retried successfully.", boardUpdate: null });

    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "Try update");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("AI unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(api.sendAIChat).toHaveBeenCalledTimes(2));
    expect(api.sendAIChat).toHaveBeenLastCalledWith("tok", 7, "Try update", []);
    expect(await screen.findByText("Retried successfully.")).toBeInTheDocument();
  });

  it("blocks chat while a save has failed", async () => {
    api.saveBoardData.mockRejectedValueOnce(new Error("Disk full"));
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));
    await screen.findByText("Disk full");

    await userEvent.type(screen.getByLabelText("Message"), "Summarize");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Board changes are not saved. Retry the save, then resend.")).toBeInTheDocument();
    expect(api.sendAIChat).not.toHaveBeenCalled();
  });
});
