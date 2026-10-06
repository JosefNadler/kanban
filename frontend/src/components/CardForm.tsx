import { useState, type FormEvent } from "react";
import { parseLabels, PRIORITIES, type CardFields, type Priority } from "@/lib/kanban";

type CardFormProps = {
  initial?: CardFields;
  members: string[];
  submitLabel: string;
  onSubmit: (fields: CardFields) => void;
  onCancel: () => void;
};

const fieldClass =
  "w-full rounded-lg border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const smallLabel = "block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]";

export const CardForm = ({ initial, members, submitLabel, onSubmit, onCancel }: CardFormProps) => {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [priority, setPriority] = useState<Priority | "">(initial?.priority ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [labels, setLabels] = useState(initial?.labels.join(", ") ?? "");
  const [assignee, setAssignee] = useState(initial?.assignee ?? "");
  // Keep a stale assignee selectable so editing a card does not silently drop it.
  const assigneeOptions = assignee && !members.includes(assignee) ? [...members, assignee] : members;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onSubmit({
      title: title.trim(),
      details: details.trim(),
      priority: priority || null,
      dueDate: dueDate || null,
      labels: parseLabels(labels),
      assignee: assignee || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Card title"
        aria-label="Card title"
        maxLength={200}
        className={`${fieldClass} font-medium`}
        required
      />
      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Details"
        aria-label="Details"
        rows={3}
        className={`${fieldClass} resize-none`}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className={smallLabel}>
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority | "")}
            className={`${fieldClass} mt-1 capitalize`}
          >
            <option value="">None</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={smallLabel}>
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>
      <label className={smallLabel}>
        Labels
        <input
          value={labels}
          onChange={(event) => setLabels(event.target.value)}
          placeholder="design, urgent"
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className={smallLabel}>
        Assignee
        <select
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          className={`${fieldClass} mt-1`}
        >
          <option value="">Unassigned</option>
          {assigneeOptions.map((username) => (
            <option key={username} value={username}>
              {username}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
