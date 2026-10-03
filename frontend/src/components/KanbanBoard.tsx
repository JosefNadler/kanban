"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import {
  fetchBoard,
  sendAIChat,
  updateBoard,
  type AIChatMessage,
} from "@/lib/boardApi";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  username: string;
};

export const KanbanBoard = ({ username }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastChatPrompt, setLastChatPrompt] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const latestSaveId = useRef(0);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    fetchBoard(username)
      .then((payload) => {
        if (!isCancelled) {
          setBoard(payload);
        }
      })
      .catch((loadError) => {
        if (!isCancelled) {
          const message =
            loadError instanceof Error
              ? loadError.message
              : "Failed to load board.";
          setError(message);
          setBoard(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [username, reloadToken]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const collisionDetectionStrategy = (args: Parameters<typeof closestCorners>[0]) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return closestCorners(args);
  };

  const persistBoard = (nextBoard: BoardData) => {
    const saveId = latestSaveId.current + 1;
    latestSaveId.current = saveId;
    setIsSaving(true);
    setError(null);

    updateBoard(username, nextBoard)
      .then((savedBoard) => {
        if (saveId !== latestSaveId.current) {
          return;
        }
        setBoard(savedBoard);
      })
      .catch((saveError) => {
        if (saveId !== latestSaveId.current) {
          return;
        }
        const message =
          saveError instanceof Error
            ? saveError.message
            : "Could not save board changes.";
        setError(message);
      })
      .finally(() => {
        if (saveId === latestSaveId.current) {
          setIsSaving(false);
        }
      });
  };

  const applyBoardChange = (updateFn: (current: BoardData) => BoardData) => {
    if (!board) {
      return;
    }
    const nextBoard = updateFn(board);
    setBoard(nextBoard);
    persistBoard(nextBoard);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    applyBoardChange((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    applyBoardChange((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    applyBoardChange((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    applyBoardChange((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
  };

  const submitChatPrompt = async (
    prompt: string,
    options: { addUserMessage: boolean }
  ) => {
    if (!board) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isChatSending) {
      return;
    }

    setIsChatSending(true);
    setChatError(null);
    setLastChatPrompt(trimmedPrompt);

    const nextMessages = options.addUserMessage
      ? [...chatMessages, { role: "user" as const, content: trimmedPrompt }]
      : chatMessages;

    if (options.addUserMessage) {
      setChatMessages(nextMessages);
    }

    try {
      const result = await sendAIChat(username, trimmedPrompt, nextMessages);
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: result.message },
      ]);
      if (result.boardUpdate) {
        setBoard(result.boardUpdate);
        setError(null);
      }
    } catch (chatRequestError) {
      const message =
        chatRequestError instanceof Error
          ? chatRequestError.message
          : "Could not send chat request.";
      setChatError(message);
    } finally {
      setIsChatSending(false);
    }
  };

  const handleSendChat = async (prompt: string) => {
    await submitChatPrompt(prompt, { addUserMessage: true });
  };

  const handleRetryChat = async () => {
    if (!lastChatPrompt) {
      return;
    }
    await submitChatPrompt(lastChatPrompt, { addUserMessage: false });
  };

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]">
          Loading board...
        </p>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
        <div className="rounded-2xl border border-[var(--stroke)] bg-white p-8 text-center shadow-[var(--shadow)]">
          <p className="text-sm font-semibold text-[var(--navy-dark)]">
            {error ?? "Board is unavailable."}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((current) => current + 1)}
            className="mt-4 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                {isSaving ? "Saving..." : "All changes saved"}
              </p>
            </div>
          </div>
          {error ? (
            <p className="text-sm font-semibold text-red-700">{error}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_360px]">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <AIChatSidebar
            messages={chatMessages}
            isSending={isChatSending}
            error={chatError}
            onSend={handleSendChat}
            onRetry={handleRetryChat}
          />
        </div>
      </main>
    </div>
  );
};
