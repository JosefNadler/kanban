import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DangerButton, ErrorText, errorText, Field, inputClass, Panel, PrimaryButton, SecondaryButton } from "@/components/ui";
import { createUser, deleteUser, listUsers, updateUser, type User } from "@/lib/api";

type UserAdminProps = {
  token: string;
  currentUser: User;
};

export const UserAdmin = ({ token, currentUser }: UserAdminProps) => {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(
    () =>
      listUsers(token).then(setUsers, (loadError) =>
        setError(errorText(loadError, "Could not load users."))
      ),
    [token]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
      await refresh();
      return true;
    } catch (actionError) {
      setError(errorText(actionError, "Action failed."));
      return false;
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await run(() =>
      createUser(token, { username: username.trim(), password, displayName: displayName.trim(), isAdmin })
    );
    if (created) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
    }
  };

  const handleResetPassword = (user: User) => {
    const nextPassword = window.prompt(`New password for ${user.username} (at least 8 characters):`);
    if (nextPassword) {
      void run(() => updateUser(token, user.id, { password: nextPassword }));
    }
  };

  const handleDelete = (user: User) => {
    if (window.confirm(`Delete ${user.username} and all boards they own?`)) {
      void run(() => deleteUser(token, user.id));
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Panel>
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Users</h2>
        <ErrorText>{error}</ErrorText>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.1em] text-[var(--gray-text)]">
            <tr>
              <th className="py-2 font-semibold">User</th>
              <th className="py-2 font-semibold">Role</th>
              <th className="py-2 font-semibold">Created</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <tr key={user.id} className="border-t border-[var(--stroke)]" data-testid={`user-row-${user.username}`}>
                  <td className="py-2">
                    <span className="font-semibold text-[var(--navy-dark)]">{user.displayName || user.username}</span>
                    <span className="ml-2 text-[var(--gray-text)]">@{user.username}</span>
                  </td>
                  <td className="py-2">
                    <label className="flex items-center gap-2 text-[var(--navy-dark)]">
                      <input
                        type="checkbox"
                        checked={user.isAdmin}
                        disabled={isSelf}
                        onChange={(event) => void run(() => updateUser(token, user.id, { isAdmin: event.target.checked }))}
                        aria-label={`Admin ${user.username}`}
                      />
                      Admin
                    </label>
                  </td>
                  <td className="py-2 text-[var(--gray-text)]">{user.createdAt.slice(0, 10)}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      <SecondaryButton onClick={() => handleResetPassword(user)}>Reset password</SecondaryButton>
                      <DangerButton disabled={isSelf} onClick={() => handleDelete(user)} aria-label={`Delete ${user.username}`}>
                        Delete
                      </DangerButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Panel className="h-fit">
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Add user</h2>
        <form className="mt-4 space-y-3" onSubmit={(event) => void handleCreate(event)}>
          <Field label="Username">
            <input value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} required />
          </Field>
          <Field label="Display name">
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Initial password">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--navy-dark)]">
            <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
            Administrator
          </label>
          <PrimaryButton type="submit">Add user</PrimaryButton>
        </form>
      </Panel>
    </div>
  );
};
