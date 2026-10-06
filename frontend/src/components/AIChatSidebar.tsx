import { useState, type FormEvent } from "react";
import type { AIChatMessage } from "@/lib/api";

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
    <aside className="flex h-[560px] flex-col rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)] xl:sticky xl:top-4 xl:h-[calc(100vh-108px)]">
      <div className="border-b-2 border-[var(--accent-yellow)] pb-3">
        <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
          AI assistant
        </h2>
        <p className="mt-1 text-sm text-[var(--gray-text)]">
          Ask to create, edit, or move cards. Board changes apply automatically.
        </p>
      </div>

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1" data-testid="ai-chat-messages">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--stroke-strong)] px-3 py-3 text-sm text-[var(--gray-text)]">
            Start by asking for a board update or summary.
          </p>
        ) : null}

        {messages.map((message, index) => {
          const isAssistant = message.role === "assistant";
          return (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-xl px-3 py-2 text-sm leading-6 ${
                isAssistant
                  ? "mr-8 border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                  : "ml-8 bg-[var(--primary-blue)] text-white"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                {isAssistant ? "Assistant" : "You"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void onRetry()}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      <form className="mt-3 space-y-2" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block">
          <span className="sr-only">Message</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Move card-1 to Review and summarize changes."
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke-strong)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            disabled={isSending}
          />
        </label>
        <button
          type="submit"
          disabled={isSending || draft.trim().length === 0}
          className="w-full rounded-lg bg-[var(--secondary-purple)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-white transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
};
