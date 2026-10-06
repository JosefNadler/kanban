import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { PlusIcon } from "@/components/icons";
import { ErrorText, errorText, inputClass, PrimaryButton } from "@/components/ui";
import type { BoardSummary } from "@/lib/api";

type BoardListProps = {
  boards: BoardSummary[];
  selectedId: number | null;
  onSelect: (boardId: number) => void;
  onCreate: (name: string, description: string) => Promise<void>;
};

export const BoardList = ({ boards, selectedId, onSelect, onCreate }: BoardListProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      await onCreate(name.trim(), "");
      setName("");
      setIsCreating(false);
      setError(null);
    } catch (createError) {
      setError(errorText(createError, "Could not create board."));
    }
  };

  return (
    <aside
      className="flex flex-col gap-2 rounded-2xl border border-[var(--stroke)] bg-white p-3 shadow-[var(--shadow)] lg:self-start"
      aria-label="Boards"
    >
      <h2 className="px-2 pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
        Boards
      </h2>
      <ul className="flex flex-col gap-1">
        {boards.map((board) => (
          <li key={board.id}>
            <button
              type="button"
              onClick={() => onSelect(board.id)}
              aria-current={board.id === selectedId ? "true" : undefined}
              className={clsx(
                "w-full rounded-lg px-2 py-2 text-left transition",
                board.id === selectedId
                  ? "bg-[var(--surface-column)] ring-1 ring-[var(--primary-blue)]"
                  : "hover:bg-[var(--surface)]"
              )}
            >
              <span className="block truncate text-sm font-semibold text-[var(--navy-dark)]">
                {board.name}
              </span>
              <span className="block text-xs text-[var(--gray-text)]">
                {board.cardCount} {board.cardCount === 1 ? "card" : "cards"}
                {board.role === "owner" ? "" : ` · shared by ${board.owner} (${board.role})`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {isCreating ? (
        <form onSubmit={(event) => void handleCreate(event)} className="space-y-2 px-1">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Board name"
            aria-label="Board name"
            maxLength={80}
            className={inputClass}
            autoFocus
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <PrimaryButton type="submit">Create</PrimaryButton>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
        >
          <PlusIcon />
          New board
        </button>
      )}
    </aside>
  );
};
