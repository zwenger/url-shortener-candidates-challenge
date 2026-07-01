import { Link } from "react-router";
import { PageShell, ResponsiveContainer } from "~/components/page-shell";
import { UrlCard } from "~/components/url-card";
import { engine } from "~/lib/engine.server";
import type { Route } from "./+types/urls";

// Hard cap on rendered rows. The loader currently returns the full,
// unbounded result set (`InMemoryUrlRepository.listAll()` has no paging),
// so a large dataset would otherwise render every row in one pass. Real
// pagination is a documented deferral (see openspec/changes/clean-ui) —
// this cap just keeps the render bounded in the meantime.
export const MAX_RENDERED_URLS = 100;

export async function loader() {
  return engine.listUrls();
}

export default function Urls({ loaderData }: Route.ComponentProps) {
  const entries = loaderData;
  const visibleEntries = entries.slice(0, MAX_RENDERED_URLS);

  return (
    <PageShell>
      <ResponsiveContainer className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Shortened URLs</h1>
          <Link to="/" className="text-sm text-primary underline">
            Back to shorten
          </Link>
        </div>

        {entries.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No shortened URLs yet.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {visibleEntries.map((entry) => (
                <li key={entry.code}>
                  <UrlCard entry={entry} />
                </li>
              ))}
            </ul>
            {entries.length > MAX_RENDERED_URLS && (
              <p className="text-center text-sm text-muted-foreground">
                Showing {MAX_RENDERED_URLS} of {entries.length}
              </p>
            )}
          </>
        )}
      </ResponsiveContainer>
    </PageShell>
  );
}

/**
 * Route-scoped error boundary: shown instead of the generic root fallback
 * (`root.tsx`'s `ErrorBoundary`) when `loader` (i.e. `engine.listUrls()`)
 * throws. Logs the failure for observability since this is a best-effort
 * read path with no other error reporting.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  console.error("Failed to load /urls:", error);

  return (
    <PageShell>
      <ResponsiveContainer className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Couldn't load your URLs</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong while loading the list. Please try again later.
        </p>
        <Link to="/" className="text-sm text-primary underline">
          Back to shorten
        </Link>
      </ResponsiveContainer>
    </PageShell>
  );
}
