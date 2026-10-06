import { allLabels, EMPTY_FILTER, isFilterActive, PRIORITIES, type BoardData, type CardFilter, type Priority } from "@/lib/kanban";

type BoardFiltersProps = {
  board: BoardData;
  members: string[];
  filter: CardFilter;
  onChange: (filter: CardFilter) => void;
};

const controlClass =
  "rounded-lg border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const BoardFilters = ({ board, members, filter, onChange }: BoardFiltersProps) => {
  const labels = allLabels(board);
  const update = (patch: Partial<CardFilter>) => onChange({ ...filter, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <input
        type="search"
        value={filter.text}
        onChange={(event) => update({ text: event.target.value })}
        placeholder="Search cards"
        aria-label="Search cards"
        className={`${controlClass} min-w-[200px] flex-1 sm:flex-none`}
      />
      <select
        value={filter.priority}
        onChange={(event) => update({ priority: event.target.value as Priority | "" })}
        aria-label="Filter by priority"
        className={`${controlClass} capitalize`}
      >
        <option value="">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priority}
          </option>
        ))}
      </select>
      <select
        value={filter.label}
        onChange={(event) => update({ label: event.target.value })}
        aria-label="Filter by label"
        className={controlClass}
      >
        <option value="">Any label</option>
        {labels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={filter.assignee}
        onChange={(event) => update({ assignee: event.target.value })}
        aria-label="Filter by assignee"
        className={controlClass}
      >
        <option value="">Anyone</option>
        {members.map((username) => (
          <option key={username} value={username}>
            {username}
          </option>
        ))}
      </select>
      {isFilterActive(filter) ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER)}
          className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
};
