import type { Card } from "@/lib/kanban";
import { CardMeta } from "@/components/CardMeta";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="cursor-grabbing rounded-xl border border-[var(--stroke)] bg-white px-3 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <h4 className="font-display text-sm font-semibold leading-5 text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details ? (
      <p className="mt-1.5 text-sm leading-5 text-[var(--gray-text)]">{card.details}</p>
    ) : null}
    <CardMeta card={card} />
  </article>
);
