import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData, type BoardData } from "@/lib/kanban";

const fetchBoardMock = vi.fn<() => Promise<BoardData>>();
const updateBoardMock = vi.fn<(username: string, board: BoardData) => Promise<BoardData>>();

vi.mock("@/lib/boardApi", () => ({
  fetchBoard: () => fetchBoardMock(),
  updateBoard: (username: string, board: BoardData) => updateBoardMock(username, board),
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
});
