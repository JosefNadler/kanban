import { useState } from "react";
import { CardForm } from "@/components/CardForm";

type NewCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-4">
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
          className="w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          Add a card
        </button>
      )}
    </div>
  );
};
