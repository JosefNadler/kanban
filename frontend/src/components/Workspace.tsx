import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { AccountSettings } from "@/components/AccountSettings";
import { BoardList } from "@/components/BoardList";
import { KanbanBoard } from "@/components/KanbanBoard";
import { UserAdmin } from "@/components/UserAdmin";
import { LogOutIcon } from "@/components/icons";
import { ErrorText, errorText, PrimaryButton } from "@/components/ui";
import { createBoard, listBoards, type BoardSummary, type User } from "@/lib/api";

type WorkspaceProps = {
  token: string;
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void;
};

type View = "boards" | "account" | "users";

const boardStorageKey = (username: string) => `pm-board-${username}`;

const readStoredBoardId = (username: string) => {
  const stored = Number(localStorage.getItem(boardStorageKey(username)));
  return Number.isInteger(stored) && stored > 0 ? stored : null;
};

export const Workspace = ({ token, user, onUserChange, onLogout }: WorkspaceProps) => {
  const [view, setView] = useState<View>("boards");
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(() => readStoredBoardId(user.username));

  const refreshBoards = useCallback(
    () =>
      listBoards(token).then(
        (next) => {
          setBoards(next);
          setBoardsError(null);
          setSelectedId((current) =>
            next.some((board) => board.id === current) ? current : (next[0]?.id ?? null)
          );
        },
        (error) => setBoardsError(errorText(error, "Could not load boards."))
      ),
    [token]
  );

  useEffect(() => {
    void refreshBoards();
  }, [refreshBoards]);

  useEffect(() => {
    if (selectedId !== null) {
      localStorage.setItem(boardStorageKey(user.username), String(selectedId));
    }
  }, [selectedId, user.username]);

  const selectBoard = (boardId: number) => {
    setSelectedId(boardId);
    setView("boards");
  };

  const handleCreateBoard = async (name: string, description: string) => {
    const board = await createBoard(token, name, description);
    await refreshBoards();
    selectBoard(board.id);
  };

  const selectedBoard = boards?.find((board) => board.id === selectedId) ?? null;

  const navButton = (target: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(target)}
      aria-current={view === target ? "page" : undefined}
      className={clsx(
        "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition",
        view === target
          ? "bg-[var(--navy-dark)] text-white"
          : "text-[var(--navy-dark)] hover:text-[var(--primary-blue)]"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-[var(--stroke)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <nav className="flex gap-1" aria-label="Main">
            {navButton("boards", "Boards")}
            {navButton("account", "Account")}
            {user.isAdmin ? navButton("users", "Users") : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--gray-text)]" data-testid="current-user">
            {user.displayName || user.username}
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
      </header>

      {view === "account" ? (
        <AccountSettings token={token} user={user} onUserChange={onUserChange} />
      ) : view === "users" ? (
        <UserAdmin token={token} currentUser={user} />
      ) : (
        <div className="grid flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <BoardList
            boards={boards ?? []}
            selectedId={selectedId}
            onSelect={selectBoard}
            onCreate={handleCreateBoard}
          />
          <div className="min-w-0">
            <ErrorText>{boardsError}</ErrorText>
            {boards === null ? (
              boardsError ? (
                <PrimaryButton className="mt-3" onClick={() => void refreshBoards()}>
                  Retry
                </PrimaryButton>
              ) : (
                <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]">
                  Loading boards...
                </p>
              )
            ) : selectedBoard ? (
              <KanbanBoard
                key={selectedBoard.id}
                token={token}
                boardId={selectedBoard.id}
                currentUser={user}
                onBoardsChanged={refreshBoards}
              />
            ) : (
              <p className="rounded-2xl border-2 border-dashed border-[var(--stroke-strong)] p-8 text-center text-sm text-[var(--gray-text)]">
                You have no boards yet. Create one to get started.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
