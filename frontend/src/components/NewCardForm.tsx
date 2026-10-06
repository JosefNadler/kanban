import { useState } from "react";
import { CardForm } from "@/components/CardForm";
import { PlusIcon } from "@/components/icons";
import type { CardFields } from "@/lib/kanban";

type NewCardFormProps = {
  members: string[];
  onAdd: (fields: CardFields) => void;
};

export const NewCardForm = ({ members, onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-2">
      {isOpen ? (
        <CardForm
          members={members}
          submitLabel="Add card"
          onSubmit={(fields) => {
            onAdd(fields);
            setIsOpen(false);
          }}
          onCancel={() => setIsOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[var(--gray-text)] transition hover:bg-white hover:text-[var(--primary-blue)]"
        >
          <PlusIcon />
          Add a card
        </button>
      )}
    </div>
  );
};
