import { useState, type FormEvent } from "react";

type CardFormProps = {
  initialTitle?: string;
  initialDetails?: string;
  submitLabel: string;
  onSubmit: (title: string, details: string) => void;
  onCancel: () => void;
};

export const CardForm = ({
  initialTitle = "",
  initialDetails = "",
  submitLabel,
  onSubmit,
  onCancel,
}: CardFormProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [details, setDetails] = useState(initialDetails);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onSubmit(title.trim(), details.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Card title"
        className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        required
      />
      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Details"
        rows={3}
        className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
