"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";

const AUTH_STORAGE_KEY = "pm-authenticated";
const USER_STORAGE_KEY = "pm-username";
const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";

const subscribeToSession = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

const getSessionUser = () =>
  localStorage.getItem(AUTH_STORAGE_KEY) === "true"
    ? localStorage.getItem(USER_STORAGE_KEY) ?? VALID_USERNAME
    : null;

// undefined means the session has not been read yet (static prerender and hydration).
const getServerSessionUser = () => undefined;

const notifySessionChange = () => window.dispatchEvent(new StorageEvent("storage"));

export const AppShell = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const currentUser = useSyncExternalStore(
    subscribeToSession,
    getSessionUser,
    getServerSessionUser
  );

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
      localStorage.setItem(USER_STORAGE_KEY, username);
      notifySessionChange();
      setUsername("");
      setPassword("");
      setError("");
      return;
    }

    setError("Invalid username or password.");
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    notifySessionChange();
    setError("");
  };

  if (currentUser === undefined) {
    return null;
  }

  if (currentUser === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6">
        <section className="w-full rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Project Management MVP
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Sign in
          </h1>
          <p className="mt-3 text-sm text-[var(--gray-text)]">
            Use the demo credentials to access the Kanban board.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleLogin}>
            <label className="block text-sm font-semibold text-[var(--navy-dark)]">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--navy-dark)]">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="current-password"
                required
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
            >
              Sign in
            </button>
          </form>
        </section>
      </main>
    );
  }

  return <KanbanBoard username={currentUser} onLogout={handleLogout} />;
};
