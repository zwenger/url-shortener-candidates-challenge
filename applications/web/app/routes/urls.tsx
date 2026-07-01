import { Link } from "react-router";
import { UrlCard } from "~/components/url-card";
import { engine } from "~/lib/engine.server";
import type { Route } from "./+types/urls";

export async function loader() {
  return engine.listUrls();
}

export default function Urls({ loaderData }: Route.ComponentProps) {
  const entries = loaderData;

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 px-4 py-8 sm:py-12">
      <div className="flex w-full max-w-md flex-col gap-4 sm:max-w-xl md:max-w-2xl">
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
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <UrlCard key={entry.code} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
