import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";
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

const makeBoard = (): BoardData => structuredClone(initialData);

const renderBoard = async () => {
  render(<KanbanBoard username="user" />);
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

  it("renames a column and persists it", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");

    await waitFor(() => {
      expect(updateBoardMock).toHaveBeenCalled();
    });
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
      expect(sendAIChatMock).toHaveBeenCalledWith(
        "user",
        "What should I do next?",
        [{ role: "user", content: "What should I do next?" }]
      );
    });

    expect(screen.getByText("What should I do next?")).toBeInTheDocument();
    expect(screen.getByText("Acknowledged.")).toBeInTheDocument();
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
    expect(screen.getByText("Retried successfully.")).toBeInTheDocument();
  });
});
