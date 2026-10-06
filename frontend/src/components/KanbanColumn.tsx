import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, CardFields, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from "@/components/icons";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  totalCards: number;
  readOnly: boolean;
  dragDisabled: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  members: string[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, fields: CardFields) => void;
  onEditCard: (cardId: string, fields: CardFields) => void;
  onDeleteCard: (cardId: string) => void;
  onDelete: (columnId: string) => void;
  onMove: (columnId: string, offset: -1 | 1) => void;
};

const iconButton =
  "rounded-md p-1 text-[var(--gray-text)] transition enabled:hover:bg-white enabled:hover:text-[var(--primary-blue)] disabled:opacity-30";

export const KanbanColumn = ({
  column,
  cards,
  totalCards,
  readOnly,
  dragDisabled,
  canMoveLeft,
  canMoveRight,
  members,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onDelete,
  onMove,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: dragDisabled });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[calc(100vh-260px)] flex-col rounded-2xl border border-[var(--stroke)] bg-[var(--surface-column)] p-3 transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="border-b-2 border-[var(--accent-yellow)] pb-2">
        <div className="flex items-center gap-1">
          {readOnly ? (
            <h3 className="min-w-0 flex-1 px-1 py-0.5 font-display text-base font-semibold text-[var(--navy-dark)]">
              {column.title}
            </h3>
          ) : (
            <input
              key={column.title}
              defaultValue={column.title}
              maxLength={60}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (!title) {
                  event.target.value = column.title;
                } else if (title !== column.title) {
                  onRename(column.id, title);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 font-display text-base font-semibold text-[var(--navy-dark)] outline-none transition hover:bg-white focus:bg-white focus:ring-2 focus:ring-[var(--primary-blue)]"
              aria-label="Column title"
            />
          )}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]">
            {cards.length === totalCards ? totalCards : `${cards.length}/${totalCards}`}
          </span>
        </div>
        {readOnly ? null : (
          <div className="mt-1 flex justify-end gap-0.5">
            <button
              type="button"
              className={iconButton}
              disabled={!canMoveLeft}
              onClick={() => onMove(column.id, -1)}
              aria-label={`Move ${column.title} left`}
              title="Move left"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              className={iconButton}
              disabled={!canMoveRight}
              onClick={() => onMove(column.id, 1)}
              aria-label={`Move ${column.title} right`}
              title="Move right"
            >
              <ChevronRightIcon />
            </button>
            <button
              type="button"
              className={clsx(iconButton, "enabled:hover:text-red-600")}
              disabled={totalCards > 0}
              onClick={() => onDelete(column.id)}
              aria-label={`Delete ${column.title}`}
              title={totalCards > 0 ? "Move or delete its cards first" : "Delete column"}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              readOnly={readOnly}
              dragDisabled={dragDisabled}
              members={members}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-[var(--stroke-strong)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]">
            {totalCards > 0 ? "No matching cards" : readOnly ? "No cards" : "Drop a card here"}
          </div>
        )}
      </div>
      {readOnly ? null : (
        <NewCardForm members={members} onAdd={(fields) => onAddCard(column.id, fields)} />
      )}
    </section>
  );
};
