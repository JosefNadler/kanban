import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, CardFields } from "@/lib/kanban";
import { CardForm } from "@/components/CardForm";
import { CardMeta } from "@/components/CardMeta";
import { PencilIcon, TrashIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  readOnly: boolean;
  dragDisabled: boolean;
  members: string[];
  onEdit: (cardId: string, fields: CardFields) => void;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, readOnly, dragDisabled, members, onEdit, onDelete }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const canDrag = !isEditing && !dragDisabled;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_4px_12px_rgba(3,33,71,0.06)]",
        "transition-shadow duration-150 hover:shadow-[0_8px_20px_rgba(3,33,71,0.1)]",
        canDrag && "cursor-grab",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      // Sortable attributes add role="button" and aria-disabled, which would disable the edit form.
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <CardForm
          initial={card}
          members={members}
          submitLabel="Save"
          onSubmit={(fields) => {
            onEdit(card.id, fields);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <div className="flex items-start gap-2">
            <h4 className="flex-1 font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {readOnly ? null : (
              <div className="-mr-1 -mt-1 flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-md p-1 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
                  aria-label={`Edit ${card.title}`}
                  title="Edit"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(card.id)}
                  className="rounded-md p-1 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${card.title}`}
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
          {card.details ? (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-[var(--gray-text)]">
              {card.details}
            </p>
          ) : null}
          <CardMeta card={card} />
        </>
      )}
    </article>
  );
};
