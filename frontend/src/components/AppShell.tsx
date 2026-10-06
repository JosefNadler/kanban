"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { Workspace } from "@/components/Workspace";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import { fetchMe, logout, UNAUTHORIZED_EVENT, type AuthResult, type User } from "@/lib/api";

const TOKEN_STORAGE_KEY = "pm-token";
const SESSION_EVENT = "pm-session";

const subscribeToSession = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(SESSION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
};

const getToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);

// undefined means the session has not been read yet (static prerender and hydration).
const getServerToken = () => undefined;

const setToken = (token: string | null) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
};

export const AppShell = () => {
  const token = useSyncExternalStore(subscribeToSession, getToken, getServerToken);
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clearSession);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clearSession);
  }, [clearSession]);

  useEffect(() => {
    if (!token || user) {
      return;
    }
    let isCancelled = false;
    fetchMe(token)
      .then((me) => {
        if (!isCancelled) {
          setUser(me);
        }
      })
      .catch((error) => {
        // A 401 is handled by the unauthorized event; anything else is a connection problem.
        if (!isCancelled && error?.status !== 401) {
          setLoadError(error instanceof Error ? error.message : "Could not load your account.");
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [token, user, reloadToken]);

  const handleAuthenticated = (result: AuthResult) => {
    setUser(result.user);
    setToken(result.token);
  };

  const handleLogout = () => {
    if (token) {
      // Best effort: the local session is cleared even if the server is unreachable.
      logout(token).catch(() => {});
    }
    clearSession();
  };

  if (token === undefined) {
    return null;
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--gray-text)]">
          {loadError ?? "Loading..."}
        </p>
        {loadError ? (
          <div className="flex gap-2">
            <PrimaryButton
              onClick={() => {
                setLoadError(null);
                setReloadToken((current) => current + 1);
              }}
            >
              Retry
            </PrimaryButton>
            <SecondaryButton onClick={clearSession}>Sign out</SecondaryButton>
          </div>
        ) : null}
      </main>
    );
  }

  return <Workspace token={token} user={user} onUserChange={setUser} onLogout={handleLogout} />;
};
