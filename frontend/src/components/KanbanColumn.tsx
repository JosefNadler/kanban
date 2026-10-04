import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[calc(100vh-180px)] flex-col rounded-2xl border border-[var(--stroke)] bg-[var(--surface-column)] p-3 transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="border-b-2 border-[var(--accent-yellow)] pb-2">
        <div className="flex items-center gap-2">
          <input
            key={column.title}
            defaultValue={column.title}
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
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]">
            {cards.length}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={onEditCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-[var(--stroke-strong)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
