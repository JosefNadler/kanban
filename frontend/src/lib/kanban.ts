export type Priority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null;
  labels: string[];
  assignee: string | null;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  schemaVersion: number;
  columns: Column[];
  cards: Record<string, Card>;
};

export type CardFields = Omit<Card, "id">;

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export const addCard = (board: BoardData, columnId: string, fields: CardFields): BoardData => {
  const id = createId("card");
  return {
    ...board,
    cards: { ...board.cards, [id]: { id, ...fields } },
    columns: board.columns.map((column) =>
      column.id === columnId ? { ...column, cardIds: [...column.cardIds, id] } : column
    ),
  };
};

export const updateCard = (board: BoardData, cardId: string, fields: CardFields): BoardData => ({
  ...board,
  cards: { ...board.cards, [cardId]: { id: cardId, ...fields } },
});

export const deleteCard = (board: BoardData, cardId: string): BoardData => ({
  ...board,
  cards: Object.fromEntries(Object.entries(board.cards).filter(([id]) => id !== cardId)),
  columns: board.columns.map((column) => ({
    ...column,
    cardIds: column.cardIds.filter((id) => id !== cardId),
  })),
});

export const renameColumn = (board: BoardData, columnId: string, title: string): BoardData => ({
  ...board,
  columns: board.columns.map((column) => (column.id === columnId ? { ...column, title } : column)),
});

export const addColumn = (board: BoardData, title: string): BoardData => ({
  ...board,
  columns: [...board.columns, { id: createId("col"), title, cardIds: [] }],
});

// Only empty columns can be removed, so no card is ever lost by accident.
export const removeColumn = (board: BoardData, columnId: string): BoardData => ({
  ...board,
  columns: board.columns.filter((column) => column.id !== columnId || column.cardIds.length > 0),
});

export const shiftColumn = (board: BoardData, columnId: string, offset: -1 | 1): BoardData => {
  const index = board.columns.findIndex((column) => column.id === columnId);
  const target = index + offset;
  if (index === -1 || target < 0 || target >= board.columns.length) {
    return board;
  }
  const columns = [...board.columns];
  [columns[index], columns[target]] = [columns[target], columns[index]];
  return { ...board, columns };
};

export type CardFilter = {
  text: string;
  priority: Priority | "";
  label: string;
  assignee: string;
};

export const EMPTY_FILTER: CardFilter = { text: "", priority: "", label: "", assignee: "" };

export const isFilterActive = (filter: CardFilter) =>
  Boolean(filter.text.trim() || filter.priority || filter.label || filter.assignee);

export const matchesFilter = (card: Card, filter: CardFilter) => {
  const text = filter.text.trim().toLowerCase();
  if (
    text &&
    !card.title.toLowerCase().includes(text) &&
    !card.details.toLowerCase().includes(text) &&
    !card.labels.some((label) => label.toLowerCase().includes(text))
  ) {
    return false;
  }
  if (filter.priority && card.priority !== filter.priority) {
    return false;
  }
  if (filter.label && !card.labels.includes(filter.label)) {
    return false;
  }
  if (filter.assignee && card.assignee !== filter.assignee) {
    return false;
  }
  return true;
};

export const allLabels = (board: BoardData) =>
  [...new Set(Object.values(board.cards).flatMap((card) => card.labels))].sort();

export const todayIso = () => new Date().toLocaleDateString("en-CA");

export const isOverdue = (card: Card, today = todayIso()) =>
  Boolean(card.dueDate && card.dueDate < today);

export const parseLabels = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
  ),
];
