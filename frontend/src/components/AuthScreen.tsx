import { useState, type FormEvent } from "react";
import { login, register, type AuthResult } from "@/lib/api";
import { Field, inputClass, PrimaryButton } from "@/components/ui";

type AuthScreenProps = {
  onAuthenticated: (result: AuthResult) => void;
};

export const AuthScreen = ({ onAuthenticated }: AuthScreenProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLogin = mode === "login";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const result = isLogin
        ? await login(username.trim(), password)
        : await register(username.trim(), password, displayName.trim());
      onAuthenticated(result);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Something went wrong.");
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isLogin ? "register" : "login");
    setError("");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6">
      <section className="w-full rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {isLogin ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-3 text-sm text-[var(--gray-text)]">
          {isLogin
            ? "Sign in to manage your project boards."
            : "Pick a username and a password with at least 8 characters."}
        </p>

        <form className="mt-8 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field label="Username">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClass}
              autoComplete="username"
              required
            />
          </Field>
          {isLogin ? null : (
            <Field label="Display name (optional)">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={inputClass}
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 8}
              required
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <PrimaryButton type="submit" disabled={isSubmitting} className="w-full py-3">
            {isLogin ? "Sign in" : "Create account"}
          </PrimaryButton>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isLogin ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isLogin ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </section>
    </main>
  );
};
