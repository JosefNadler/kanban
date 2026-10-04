import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import boardFixture from "@/lib/kanban-fixture.json";
import type { AIChatMessage, AIChatResult } from "@/lib/boardApi";

const fetchBoardMock = vi.fn<() => Promise<BoardData>>();
const updateBoardMock = vi.fn<(username: string, board: BoardData) => Promise<BoardData>>();
const sendAIChatMock = vi.fn<
  (username: string, prompt: string, history: AIChatMessage[]) => Promise<AIChatResult>
>();

vi.mock("@/lib/boardApi", () => ({
  fetchBoard: () => fetchBoardMock(),
  updateBoard: (username: string, board: BoardData) => updateBoardMock(username, board),
  sendAIChat: (username: string, prompt: string, history: AIChatMessage[]) =>
    sendAIChatMock(username, prompt, history),
}));

const makeBoard = (): BoardData => structuredClone(boardFixture);

const renderBoard = async () => {
  render(<KanbanBoard username="user" onLogout={() => {}} />);
  await screen.findByRole("heading", { name: "Kanban Studio" });
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    fetchBoardMock.mockResolvedValue(makeBoard());
    updateBoardMock.mockImplementation(async (_, board) => board);
    sendAIChatMock.mockResolvedValue({ message: "Acknowledged.", boardUpdate: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads board data from backend", async () => {
    await renderBoard();
    expect(fetchBoardMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column with a single save on Enter", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name{Enter}");

    await waitFor(() => {
      expect(updateBoardMock).toHaveBeenCalledTimes(1);
    });
    expect(updateBoardMock.mock.calls[0][1].columns[0].title).toBe("New Name");
  });

  it("restores the column title when cleared", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();

    expect(input).toHaveValue("Backlog");
    expect(updateBoardMock).not.toHaveBeenCalled();
  });

  it("edits a card", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: "Edit Align roadmap themes" })
    );
    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Edited title");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("Edited title")).toBeInTheDocument();
    await waitFor(() => {
      expect(updateBoardMock).toHaveBeenCalledTimes(1);
    });
    expect(updateBoardMock.mock.calls[0][1].cards["card-1"].title).toBe("Edited title");
  });

  it("sends only the latest board after an in-flight save", async () => {
    let resolveFirst: () => void = () => {};
    updateBoardMock.mockImplementationOnce(
      (_, board) => new Promise((resolve) => (resolveFirst = () => resolve(board)))
    );
    await renderBoard();
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: "Delete Align roadmap themes" }));
    await userEvent.click(within(column).getByRole("button", { name: "Delete Gather customer signals" }));
    await userEvent.click(
      within(screen.getByTestId("column-col-done")).getByRole("button", { name: "Delete Ship marketing page" })
    );
    expect(updateBoardMock).toHaveBeenCalledTimes(1);

    resolveFirst();
    await waitFor(() => {
      expect(updateBoardMock).toHaveBeenCalledTimes(2);
    });
    const lastSaved = updateBoardMock.mock.calls[1][1];
    expect(Object.keys(lastSaved.cards)).not.toContain("card-7");
    expect(Object.keys(lastSaved.cards)).not.toContain("card-2");
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
  });

  it("shows unsaved state and retries a failed save", async () => {
    updateBoardMock.mockRejectedValueOnce(new Error("Disk full"));
    await renderBoard();
    await userEvent.click(
      within(getFirstColumn()).getByRole("button", { name: "Delete Align roadmap themes" })
    );

    expect(await screen.findByText("Disk full")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    expect(updateBoardMock).toHaveBeenCalledTimes(2);
  });

  it("adds and removes a card while syncing to backend", async () => {
    await renderBoard();
    const column = getFirstColumn();

    await userEvent.click(
      within(column).getByRole("button", {
        name: /add a card/i,
      })
    );

    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    await userEvent.click(
      within(column).getByRole("button", {
        name: /delete new card/i,
      })
    );

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(updateBoardMock).toHaveBeenCalled();
    });
  });

  it("sends chat prompt and renders assistant reply", async () => {
    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "What should I do next?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(sendAIChatMock).toHaveBeenCalledWith("user", "What should I do next?", []);
    });

    expect(screen.getByText("What should I do next?")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Message"), "And then?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(sendAIChatMock).toHaveBeenLastCalledWith("user", "And then?", [
        { role: "user", content: "What should I do next?" },
        { role: "assistant", content: "Acknowledged." },
      ]);
    });
  });

  it("applies board update from AI response", async () => {
    const nextBoard = makeBoard();
    nextBoard.columns[0].title = "AI Updated";
    sendAIChatMock.mockResolvedValueOnce({
      message: "Updated the board.",
      boardUpdate: nextBoard,
    });

    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "Rename first column");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Updated the board.");
    await waitFor(() => {
      expect(screen.getByDisplayValue("AI Updated")).toBeInTheDocument();
    });
  });

  it("shows retry when chat request fails", async () => {
    sendAIChatMock
      .mockRejectedValueOnce(new Error("AI unavailable"))
      .mockResolvedValueOnce({ message: "Retried successfully.", boardUpdate: null });

    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "Try update");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("AI unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(sendAIChatMock).toHaveBeenCalledTimes(2);
    });
    expect(sendAIChatMock).toHaveBeenLastCalledWith("user", "Try update", []);
    expect(await screen.findByText("Retried successfully.")).toBeInTheDocument();
  });
});
