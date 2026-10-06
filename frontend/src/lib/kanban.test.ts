import {
  addCard,
  addColumn,
  allLabels,
  deleteCard,
  EMPTY_FILTER,
  isFilterActive,
  isOverdue,
  matchesFilter,
  moveCard,
  parseLabels,
  removeColumn,
  renameColumn,
  shiftColumn,
  updateCard,
  type BoardData,
  type Card,
  type Column,
} from "@/lib/kanban";
import boardFixture from "@/lib/kanban-fixture.json";

const makeBoard = () => structuredClone(boardFixture) as BoardData;

const card = (overrides: Partial<Card> = {}): Card => ({
  id: "card-x",
  title: "Write spec",
  details: "Draft the API",
  priority: null,
  dueDate: null,
  labels: [],
  assignee: null,
  ...overrides,
});

const fields = { title: "New", details: "", priority: null, dueDate: null, labels: [], assignee: null };

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card to the end of its own column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("ignores unknown ids", () => {
    expect(moveCard(baseColumns, "card-404", "col-b")).toBe(baseColumns);
    expect(moveCard(baseColumns, "card-1", "col-404")).toBe(baseColumns);
  });
});

describe("board helpers", () => {
  it("adds a card to the end of a column", () => {
    const board = addCard(makeBoard(), "col-review", { ...fields, labels: ["ops"] });
    const newId = board.columns[3].cardIds.at(-1)!;
    expect(newId).toMatch(/^card-/);
    expect(board.cards[newId]).toEqual({ id: newId, ...fields, labels: ["ops"] });
  });

  it("updates and deletes a card", () => {
    let board = updateCard(makeBoard(), "card-1", { ...fields, priority: "low" });
    expect(board.cards["card-1"].priority).toBe("low");
    board = deleteCard(board, "card-1");
    expect(board.cards["card-1"]).toBeUndefined();
    expect(board.columns[0].cardIds).toEqual(["card-2"]);
  });

  it("adds, renames and reorders columns", () => {
    let board = addColumn(makeBoard(), "Blocked");
    expect(board.columns.at(-1)).toMatchObject({ title: "Blocked", cardIds: [] });

    board = renameColumn(board, "col-backlog", "Ideas");
    expect(board.columns[0].title).toBe("Ideas");

    board = shiftColumn(board, "col-backlog", 1);
    expect(board.columns.slice(0, 2).map((column) => column.id)).toEqual(["col-discovery", "col-backlog"]);
    expect(shiftColumn(board, "col-discovery", -1)).toBe(board);
  });

  it("removes only empty columns", () => {
    const board = addColumn(makeBoard(), "Blocked");
    const emptyId = board.columns.at(-1)!.id;
    expect(removeColumn(board, emptyId).columns).toHaveLength(5);
    expect(removeColumn(board, "col-backlog").columns).toHaveLength(6);
  });

  it("collects unique sorted labels", () => {
    expect(allLabels(makeBoard())).toEqual(["design", "planning", "research"]);
  });

  it("parses comma separated labels", () => {
    expect(parseLabels(" ui, ,api,ui ")).toEqual(["ui", "api"]);
  });

  it("detects overdue cards", () => {
    expect(isOverdue(card({ dueDate: "2026-01-01" }), "2026-01-02")).toBe(true);
    expect(isOverdue(card({ dueDate: "2026-01-02" }), "2026-01-02")).toBe(false);
    expect(isOverdue(card(), "2026-01-02")).toBe(false);
  });
});

describe("matchesFilter", () => {
  it("matches everything with an empty filter", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(matchesFilter(card(), EMPTY_FILTER)).toBe(true);
  });

  it("matches text in title, details and labels case-insensitively", () => {
    const target = card({ labels: ["Backend"] });
    expect(matchesFilter(target, { ...EMPTY_FILTER, text: "SPEC" })).toBe(true);
    expect(matchesFilter(target, { ...EMPTY_FILTER, text: "api" })).toBe(true);
    expect(matchesFilter(target, { ...EMPTY_FILTER, text: "backend" })).toBe(true);
    expect(matchesFilter(target, { ...EMPTY_FILTER, text: "nothing" })).toBe(false);
  });

  it("matches priority, label and assignee exactly", () => {
    const target = card({ priority: "high", labels: ["ops"], assignee: "alice" });
    expect(matchesFilter(target, { ...EMPTY_FILTER, priority: "high" })).toBe(true);
    expect(matchesFilter(target, { ...EMPTY_FILTER, priority: "low" })).toBe(false);
    expect(matchesFilter(target, { ...EMPTY_FILTER, label: "ops" })).toBe(true);
    expect(matchesFilter(target, { ...EMPTY_FILTER, label: "op" })).toBe(false);
    expect(matchesFilter(target, { ...EMPTY_FILTER, assignee: "alice" })).toBe(true);
    expect(matchesFilter(target, { ...EMPTY_FILTER, assignee: "bob" })).toBe(false);
  });
});
