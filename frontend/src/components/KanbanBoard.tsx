"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { BoardFilters } from "@/components/BoardFilters";
import { BoardMembers } from "@/components/BoardMembers";
import { PlusIcon } from "@/components/icons";
import { DangerButton, ErrorText, errorText, SecondaryButton } from "@/components/ui";
import {
  deleteBoard,
  fetchBoard,
  listMembers,
  removeMember,
  saveBoardData,
  sendAIChat,
  updateBoardMeta,
  type AIChatMessage,
  type BoardSummary,
  type Member,
  type User,
} from "@/lib/api";
import {
  addCard,
  addColumn,
  deleteCard,
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  moveCard,
  removeColumn,
  renameColumn,
  shiftColumn,
  updateCard,
  type BoardData,
  type CardFields,
  type CardFilter,
} from "@/lib/kanban";

type KanbanBoardProps = {
  token: string;
  boardId: number;
  currentUser: User;
  onBoardsChanged: () => Promise<void>;
};

const CHAT_STORAGE_KEY = "pm-chat-open";

const collisionDetectionStrategy = (args: Parameters<typeof closestCorners>[0]) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCorners(args);
};

export const KanbanBoard = ({ token, boardId, currentUser, onBoardsChanged }: KanbanBoardProps) => {
  const [meta, setMeta] = useState<BoardSummary | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [showMembers, setShowMembers] = useState(false);
  const [showChat, setShowChat] = useState(() => localStorage.getItem(CHAT_STORAGE_KEY) !== "false");
  const [newColumnTitle, setNewColumnTitle] = useState("");
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

    Promise.all([fetchBoard(token, boardId), listMembers(token, boardId)])
      .then(([detail, boardMembers]) => {
        if (!isCancelled) {
          const { data, ...summary } = detail;
          setMeta(summary);
          setBoard(data);
          setMembers(boardMembers);
        }
      })
      .catch((loadError) => {
        if (!isCancelled) {
          setError(errorText(loadError, "Failed to load board."));
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
  }, [token, boardId, reloadToken]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const flushSaves = async (): Promise<boolean> => {
    isFlushing.current = true;
    try {
      while (pendingBoard.current) {
        const nextBoard = pendingBoard.current;
        pendingBoard.current = null;
        try {
          await saveBoardData(token, boardId, nextBoard);
        } catch (saveError) {
          pendingBoard.current ??= nextBoard;
          setError(errorText(saveError, "Could not save board changes."));
          setSaveStatus("failed");
          return false;
        }
      }
      setSaveStatus("saved");
      void onBoardsChanged();
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

  const handleAddColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) {
      return;
    }
    applyBoardChange((prev) => addColumn(prev, title));
    setNewColumnTitle("");
  };

  const toggleChat = () => {
    localStorage.setItem(CHAT_STORAGE_KEY, String(!showChat));
    setShowChat(!showChat);
  };

  const handleMetaChange = async (patch: { name?: string; description?: string }) => {
    try {
      setMeta(await updateBoardMeta(token, boardId, patch));
      await onBoardsChanged();
    } catch (metaError) {
      setError(errorText(metaError, "Could not update the board."));
    }
  };

  const handleDeleteBoard = async () => {
    if (!meta || !window.confirm(`Delete "${meta.name}" and all of its cards?`)) {
      return;
    }
    try {
      await deleteBoard(token, boardId);
      await onBoardsChanged();
    } catch (deleteError) {
      setError(errorText(deleteError, "Could not delete the board."));
    }
  };

  const handleLeaveBoard = async () => {
    if (!meta || !window.confirm(`Leave "${meta.name}"?`)) {
      return;
    }
    try {
      await removeMember(token, boardId, currentUser.username);
      await onBoardsChanged();
    } catch (leaveError) {
      setError(errorText(leaveError, "Could not leave the board."));
    }
  };

  const submitChatPrompt = async (prompt: string, options: { addUserMessage: boolean }) => {
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
      const result = await sendAIChat(token, boardId, trimmedPrompt, history);
      setChatMessages((current) => [...current, { role: "assistant", content: result.message }]);
      if (result.boardUpdate) {
        setBoard(result.boardUpdate);
        setError(null);
        void onBoardsChanged();
      }
    } catch (chatRequestError) {
      setChatError(errorText(chatRequestError, "Could not send chat request."));
    } finally {
      setIsChatSending(false);
    }
  };

  if (isLoading) {
    return (
      <p className="py-10 text-center text-sm font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]">
        Loading board...
      </p>
    );
  }

  if (!board || !meta) {
    return (
      <div className="rounded-2xl border border-[var(--stroke)] bg-white p-8 text-center shadow-[var(--shadow)]">
        <p className="text-sm font-semibold text-[var(--navy-dark)]">{error ?? "Board is unavailable."}</p>
        <SecondaryButton className="mt-4" onClick={() => setReloadToken((current) => current + 1)}>
          Retry
        </SecondaryButton>
      </div>
    );
  }

  const readOnly = meta.role === "viewer";
  const chatVisible = !readOnly && showChat;
  const filterActive = isFilterActive(filter);
  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const memberNames = members.map((member) => member.username);

  const columnCallbacks = {
    onRename: (columnId: string, title: string) =>
      applyBoardChange((prev) => renameColumn(prev, columnId, title)),
    onAddCard: (columnId: string, fields: CardFields) =>
      applyBoardChange((prev) => addCard(prev, columnId, fields)),
    onEditCard: (cardId: string, fields: CardFields) =>
      applyBoardChange((prev) => updateCard(prev, cardId, fields)),
    onDeleteCard: (cardId: string) => applyBoardChange((prev) => deleteCard(prev, cardId)),
    onDelete: (columnId: string) => applyBoardChange((prev) => removeColumn(prev, columnId)),
    onMove: (columnId: string, offset: -1 | 1) =>
      applyBoardChange((prev) => shiftColumn(prev, columnId, offset)),
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">{meta.name}</h2>
          ) : (
            <input
              key={`name-${meta.name}`}
              defaultValue={meta.name}
              aria-label="Board name"
              maxLength={80}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (!name) {
                  event.target.value = meta.name;
                } else if (name !== meta.name) {
                  void handleMetaChange({ name });
                }
              }}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="w-full rounded-md bg-transparent px-1 font-display text-xl font-semibold text-[var(--navy-dark)] outline-none hover:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--primary-blue)]"
            />
          )}
          {readOnly ? (
            meta.description ? (
              <p className="mt-1 text-sm text-[var(--gray-text)]">{meta.description}</p>
            ) : null
          ) : (
            <input
              key={`description-${meta.description}`}
              defaultValue={meta.description}
              aria-label="Board description"
              placeholder="Add a description"
              maxLength={500}
              onBlur={(event) => {
                const description = event.target.value.trim();
                if (description !== meta.description) {
                  void handleMetaChange({ description });
                }
              }}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="mt-1 w-full rounded-md bg-transparent px-1 text-sm text-[var(--gray-text)] outline-none hover:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--primary-blue)]"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <span className="rounded-full bg-[var(--surface-column)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]">
              Read only
            </span>
          ) : (
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
          )}
          {readOnly ? null : (
            <SecondaryButton onClick={toggleChat} aria-pressed={showChat}>
              AI assistant
            </SecondaryButton>
          )}
          <SecondaryButton onClick={() => setShowMembers((current) => !current)} aria-expanded={showMembers}>
            {meta.role === "owner" ? "Share" : "Members"} ({members.length})
          </SecondaryButton>
          {meta.role === "owner" ? (
            <DangerButton onClick={() => void handleDeleteBoard()}>Delete board</DangerButton>
          ) : (
            <DangerButton onClick={() => void handleLeaveBoard()}>Leave board</DangerButton>
          )}
        </div>
        {error ? (
          <div className="flex w-full flex-wrap items-center gap-3">
            <ErrorText>{error}</ErrorText>
            {saveStatus === "failed" ? (
              <DangerButton onClick={handleRetrySave}>Retry save</DangerButton>
            ) : null}
          </div>
        ) : null}
        {showMembers ? (
          <BoardMembers
            token={token}
            boardId={boardId}
            members={members}
            canManage={meta.role === "owner"}
            onMembersChange={setMembers}
          />
        ) : null}
      </section>

      <BoardFilters board={board} members={memberNames} filter={filter} onChange={setFilter} />

      <div
        className={clsx(
          "grid flex-1 gap-4",
          chatVisible && "xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]"
        )}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Read-only while the AI works, so its board update cannot drop edits made meanwhile. */}
          <section
            className={clsx(
              "grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 lg:auto-cols-[minmax(200px,1fr)]",
              isChatSending && "pointer-events-none opacity-70"
            )}
            aria-busy={isChatSending}
          >
            {board.columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds
                  .map((cardId) => board.cards[cardId])
                  .filter((card) => matchesFilter(card, filter))}
                totalCards={column.cardIds.length}
                readOnly={readOnly}
                // Reordering a filtered list would put cards in surprising places.
                dragDisabled={readOnly || filterActive}
                canMoveLeft={index > 0}
                canMoveRight={index < board.columns.length - 1}
                members={memberNames}
                {...columnCallbacks}
              />
            ))}
            {readOnly ? null : (
              <form
                onSubmit={handleAddColumn}
                className="flex h-fit flex-col gap-2 rounded-2xl border-2 border-dashed border-[var(--stroke-strong)] p-3"
              >
                <input
                  value={newColumnTitle}
                  onChange={(event) => setNewColumnTitle(event.target.value)}
                  placeholder="New column"
                  aria-label="New column title"
                  maxLength={60}
                  className="rounded-lg border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
                />
                <button
                  type="submit"
                  disabled={!newColumnTitle.trim() || board.columns.length >= 12}
                  className="flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--gray-text)] transition enabled:hover:bg-white enabled:hover:text-[var(--primary-blue)] disabled:opacity-50"
                >
                  <PlusIcon />
                  Add column
                </button>
              </form>
            )}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[280px] rotate-2">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {chatVisible ? (
          <AIChatSidebar
            messages={chatMessages}
            isSending={isChatSending}
            error={chatError}
            onSend={(prompt) => submitChatPrompt(prompt, { addUserMessage: true })}
            onRetry={async () => {
              if (lastChatPrompt) {
                await submitChatPrompt(lastChatPrompt, { addUserMessage: false });
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
};
