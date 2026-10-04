"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
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
import { LogOutIcon } from "@/components/icons";
import {
  fetchBoard,
  sendAIChat,
  updateBoard,
  type AIChatMessage,
} from "@/lib/boardApi";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  username: string;
  onLogout: () => void;
};

export const KanbanBoard = ({ username, onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AIChatMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastChatPrompt, setLastChatPrompt] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Saves are serialized: one PUT in flight, and only the newest pending board is sent next.
  const pendingBoard = useRef<BoardData | null>(null);
  const isFlushing = useRef(false);
  const savesDone = useRef<Promise<boolean>>(Promise.resolve(true));

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

  const flushSaves = async (): Promise<boolean> => {
    isFlushing.current = true;
    try {
      while (pendingBoard.current) {
        const nextBoard = pendingBoard.current;
        pendingBoard.current = null;
        try {
          await updateBoard(username, nextBoard);
        } catch (saveError) {
          pendingBoard.current ??= nextBoard;
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Could not save board changes."
          );
          setSaveStatus("failed");
          return false;
        }
      }
      setSaveStatus("saved");
      return true;
    } finally {
      isFlushing.current = false;
    }
  };

  const persistBoard = (nextBoard: BoardData) => {
    pendingBoard.current = nextBoard;
    setSaveStatus("saving");
    setError(null);
    if (!isFlushing.current) {
      savesDone.current = flushSaves();
    }
  };

  const handleRetrySave = () => {
    if (pendingBoard.current) {
      persistBoard(pendingBoard.current);
    }
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

  const handleEditCard = (cardId: string, title: string, details: string) => {
    applyBoardChange((prev) => ({
      ...prev,
      cards: { ...prev.cards, [cardId]: { id: cardId, title, details } },
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

    // History is everything before this prompt; the prompt itself is sent separately.
    // On retry the prompt is already the last message, so drop it from history.
    const history = options.addUserMessage ? chatMessages : chatMessages.slice(0, -1);

    if (options.addUserMessage) {
      setChatMessages([...chatMessages, { role: "user", content: trimmedPrompt }]);
    }

    try {
      // The AI edits the server copy of the board, so pending edits must be saved first.
      if (!(await savesDone.current)) {
        throw new Error("Board changes are not saved. Retry the save, then resend.");
      }
      const result = await sendAIChat(username, trimmedPrompt, history);
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
            className="mt-4 rounded-lg bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <main className="flex min-h-screen flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-[var(--stroke)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <p className="hidden text-sm text-[var(--gray-text)] md:block">
            Drag cards between stages, click a column title to rename it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em]",
              saveStatus === "failed" ? "text-red-700" : "text-[var(--gray-text)]"
            )}
          >
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                saveStatus === "saved" && "bg-emerald-500",
                saveStatus === "saving" && "bg-[var(--accent-yellow)]",
                saveStatus === "failed" && "bg-red-600"
              )}
            />
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "failed"
                ? "Unsaved changes"
                : "All changes saved"}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-lg border border-[var(--stroke-strong)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          >
            <LogOutIcon />
            Log out
          </button>
        </div>
        {error ? (
          <div className="flex w-full flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            {saveStatus === "failed" ? (
              <button
                type="button"
                onClick={handleRetrySave}
                className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-100"
              >
                Retry save
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Read-only while the AI works, so its board update cannot drop edits made meanwhile. */}
          <section
            className={clsx(
              "grid auto-cols-[minmax(240px,1fr)] grid-flow-col lg:auto-cols-[minmax(180px,1fr)] gap-3 overflow-x-auto pb-2",
              isChatSending && "pointer-events-none opacity-70"
            )}
            aria-busy={isChatSending}
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onEditCard={handleEditCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[280px] rotate-2">
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
  );
};
