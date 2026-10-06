import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared form and button styles, so every screen uses the same color scheme.

export const inputClass =
  "mt-1.5 w-full rounded-xl border border-[var(--stroke-strong)] bg-white px-3 py-2 text-sm font-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-sm font-semibold text-[var(--navy-dark)]">
    {label}
    {children}
  </label>
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const PrimaryButton = ({ className, ...props }: ButtonProps) => (
  <button
    type="button"
    {...props}
    className={clsx(
      "rounded-lg bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
  />
);

export const SecondaryButton = ({ className, ...props }: ButtonProps) => (
  <button
    type="button"
    {...props}
    className={clsx(
      "rounded-lg border border-[var(--stroke-strong)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--navy-dark)] transition enabled:hover:border-[var(--primary-blue)] enabled:hover:text-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
  />
);

export const DangerButton = ({ className, ...props }: ButtonProps) => (
  <button
    type="button"
    {...props}
    className={clsx(
      "rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-red-700 transition enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
  />
);

export const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
  <section
    className={clsx(
      "rounded-2xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)]",
      className
    )}
  >
    {children}
  </section>
);

export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="alert" className="text-sm font-medium text-red-700">
      {children}
    </p>
  ) : null;

export const errorText = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
