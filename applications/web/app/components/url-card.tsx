import { CopyButton } from "~/components/copy-button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

// React Router v7's turbo-stream serialization preserves `Date` natively
// across the SSR boundary (`Date` is part of turbo-stream's `Serializable`
// union), so `loaderData` here is a real `Date` instance at runtime, never
// a stringified one. The `Date | string` union is defensive, not a
// correction of that fact: it lets this component also accept a
// pre-serialized ISO string from callers outside the SSR pipeline (e.g.
// test fixtures, or a future JSON API), without assuming which shape it
// will get.
export interface UrlCardEntry {
  code: string;
  longUrl: string;
  clickCount: number;
  lastClickedAt: Date | string | null;
  createdAt: Date | string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const INVALID_DATE_FALLBACK = "—";

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return INVALID_DATE_FALLBACK;
  }

  return dateFormatter.format(date);
}

export interface UrlCardProps {
  entry: UrlCardEntry;
  /** Absolute short URL (`${baseUrl}/s/${code}`) — the value shown and copied. */
  shortUrl: string;
}

/**
 * One `/urls` listing entry. Dates are formatted here, not in the loader —
 * see design.md "Format Dates in the component, not the loader" — and
 * `formatDate` guards against an unparseable value so one malformed date
 * can't crash the entire `/urls` render.
 *
 * The header pairs the short code with a `CopyButton` that copies the full
 * absolute short URL to the clipboard; the short URL is also shown as a
 * clickable link so it's clear what gets copied and the redirect is testable.
 */
export function UrlCard({ entry, shortUrl }: UrlCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="font-mono text-base break-all">
          {entry.code}
        </CardTitle>
        <CopyButton value={shortUrl} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <a
          href={shortUrl}
          className="truncate text-primary underline"
          title={shortUrl}
        >
          {shortUrl}
        </a>
        <p className="truncate text-muted-foreground" title={entry.longUrl}>
          {entry.longUrl}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>Clicks: {entry.clickCount}</span>
          <span>Last click: {formatDate(entry.lastClickedAt)}</span>
          <span>Created: {formatDate(entry.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
