import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

// React Router v7's turbo-stream serialization preserves `Date` natively
// across the SSR boundary (`Date` is part of its `Serializable` union), so
// `loaderData` here is a real `Date`, not a string. `new Date(value)` below
// is defensive: it also accepts an ISO string transparently, in case a
// caller passes pre-serialized data (e.g. from a test fixture).
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

function formatDate(value: Date | string | null): string {
  if (!value) {
    return "Never";
  }

  return dateFormatter.format(new Date(value));
}

export interface UrlCardProps {
  entry: UrlCardEntry;
}

/**
 * One `/urls` listing entry. Dates arrive as ISO strings (loader data is
 * serialized across the SSR boundary) and are parsed/formatted here, not in
 * the loader — see design.md "Format Dates in the component, not the loader".
 */
export function UrlCard({ entry }: UrlCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base break-all">
          {entry.code}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
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
