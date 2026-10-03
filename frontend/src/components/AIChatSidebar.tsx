import { useState, type FormEvent } from "react";
import type { AIChatMessage } from "@/lib/boardApi";

type AIChatSidebarProps = {
  messages: AIChatMessage[];
  isSending: boolean;
  error: string | null;
  onSend: (prompt: string) => Promise<void>;
  onRetry: () => Promise<void>;
};

export const AIChatSidebar = ({
  messages,
  isSending,
  error,
  onSend,
  onRetry,
}: AIChatSidebarProps) => {
  const [draft, setDraft] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || isSending) {
      return;
    }

    setDraft("");
    await onSend(prompt);
  };

  return (
    <aside className="flex h-full min-h-[720px] flex-col rounded-3xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)]">
      <div className="border-b border-[var(--stroke)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
          AI assistant
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Chat
        </h2>
        <p className="mt-2 text-sm text-[var(--gray-text)]">
          Ask to create, edit, or move cards. Board changes apply automatically.
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="ai-chat-messages">
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-3 text-sm text-[var(--gray-text)]">
            Start by asking for a board update or summary.
          </p>
        ) : null}

        {messages.map((message, index) => {
          const isAssistant = message.role === "assistant";
          return (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                isAssistant
                  ? "border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                  : "ml-6 bg-[var(--primary-blue)] text-white"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                {isAssistant ? "Assistant" : "You"}
              </p>
              <p>{message.content}</p>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="mt-2 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      <form className="mt-4 space-y-2" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Message
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Move card-1 to Review and summarize changes."
            rows={4}
            className="mt-2 w-full resize-none rounded-2xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            disabled={isSending}
          />
        </label>
        <button
          type="submit"
          disabled={isSending || draft.trim().length === 0}
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-white transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
};
