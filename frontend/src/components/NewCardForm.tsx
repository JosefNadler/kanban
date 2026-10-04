import { useState } from "react";
import { CardForm } from "@/components/CardForm";
import { PlusIcon } from "@/components/icons";

type NewCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-2">
      {isOpen ? (
        <CardForm
          submitLabel="Add card"
          onSubmit={(title, details) => {
            onAdd(title, details);
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
