import clsx from "clsx";
import { isOverdue, type Card, type Priority } from "@/lib/kanban";

const priorityStyles: Record<Priority, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-sky-50 text-sky-800 border-sky-200",
};

const badge = "rounded-full border px-2 py-0.5 text-[11px] font-semibold";

// Priority, due date, labels and assignee shown under a card's title.
export const CardMeta = ({ card }: { card: Card }) => {
  if (!card.priority && !card.dueDate && card.labels.length === 0 && !card.assignee) {
    return null;
  }

  const overdue = isOverdue(card);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {card.priority ? (
        <span className={clsx(badge, "capitalize", priorityStyles[card.priority])}>
          {card.priority}
        </span>
      ) : null}
      {card.dueDate ? (
        <span
          className={clsx(
            badge,
            overdue
              ? "border-red-300 bg-red-600 text-white"
              : "border-[var(--stroke-strong)] text-[var(--navy-dark)]"
          )}
          title={overdue ? "Overdue" : "Due date"}
        >
          {overdue ? "Overdue " : "Due "}
          {card.dueDate}
        </span>
      ) : null}
      {card.labels.map((label) => (
        <span
          key={label}
          className={clsx(badge, "border-[var(--secondary-purple)]/30 bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]")}
        >
          {label}
        </span>
      ))}
      {card.assignee ? (
        <span
          className={clsx(badge, "ml-auto border-[var(--primary-blue)]/30 text-[var(--primary-blue)]")}
          title="Assignee"
        >
          @{card.assignee}
        </span>
      ) : null}
    </div>
  );
};
