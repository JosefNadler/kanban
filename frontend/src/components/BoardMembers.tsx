import { useState, type FormEvent } from "react";
import { ErrorText, errorText, PrimaryButton } from "@/components/ui";
import { removeMember, setMember, type Member } from "@/lib/api";

type BoardMembersProps = {
  token: string;
  boardId: number;
  members: Member[];
  canManage: boolean;
  onMembersChange: (members: Member[]) => void;
};

type ShareRole = "editor" | "viewer";

const controlClass =
  "rounded-lg border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const BoardMembers = ({ token, boardId, members, canManage, onMembersChange }: BoardMembersProps) => {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<Member[]>) => {
    try {
      onMembersChange(await action());
      setError(null);
      return true;
    } catch (memberError) {
      setError(errorText(memberError, "Could not update members."));
      return false;
    }
  };

  const handleShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim();
    if (name && (await run(() => setMember(token, boardId, name, role)))) {
      setUsername("");
    }
  };

  return (
    <div className="w-full border-t border-[var(--stroke)] pt-3" data-testid="board-members">
      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li key={member.username} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[var(--navy-dark)]">{member.displayName || member.username}</span>
            <span className="text-[var(--gray-text)]">@{member.username}</span>
            {canManage && member.role !== "owner" ? (
              <>
                <select
                  value={member.role}
                  onChange={(event) =>
                    void run(() => setMember(token, boardId, member.username, event.target.value as ShareRole))
                  }
                  aria-label={`Role for ${member.username}`}
                  className={`${controlClass} ml-auto py-0.5`}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={() => void run(() => removeMember(token, boardId, member.username))}
                  aria-label={`Remove ${member.username}`}
                  className="text-xs font-semibold uppercase tracking-wide text-red-700 hover:underline"
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="ml-auto text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]">
                {member.role}
              </span>
            )}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form onSubmit={(event) => void handleShare(event)} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Share with username"
            className={controlClass}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ShareRole)}
            aria-label="Share role"
            className={controlClass}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <PrimaryButton type="submit" disabled={!username.trim()}>
            Share
          </PrimaryButton>
        </form>
      ) : null}
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
};
