import type { ReactNode } from "react";

export interface PageShellProps {
  children: ReactNode;
}

/**
 * Shared outer page layout used by both `/` and `/urls`: a full-height
 * centered column (`min-h-screen flex flex-col items-center gap-6 px-4 py-8
 * sm:py-12`). Each route composes its own content inside via
 * `ResponsiveContainer` for the repeated `max-w-md sm:max-w-xl
 * md:max-w-2xl` width — the two routes' inner wrapper elements differ
 * slightly (a plain row vs. a `flex-col` stack), so only the outer `<main>`
 * is extracted here; purely presentational, no behavior.
 */
export function PageShell({ children }: PageShellProps) {
  return (
    <main className="min-h-screen flex flex-col items-center gap-6 px-4 py-8 sm:py-12">
      {children}
    </main>
  );
}

export interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * The `max-w-md sm:max-w-xl md:max-w-2xl` responsive width constraint
 * repeated on every direct child of `PageShell` across `/` and `/urls`.
 * `className` extends (not replaces) the base classes for callers that
 * need extra layout (e.g. `flex-col gap-4`, `items-center justify-end`).
 */
export function ResponsiveContainer({
  children,
  className = "",
}: ResponsiveContainerProps) {
  return (
    <div
      className={`w-full max-w-md sm:max-w-xl md:max-w-2xl ${className}`.trim()}
    >
      {children}
    </div>
  );
}
