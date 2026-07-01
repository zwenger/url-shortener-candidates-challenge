import {
  BlockedHostError,
  CodeGenerationExhaustedError,
  InvalidUrlError,
} from "@url-shortener/engine";
import { data, Form, Link, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CopyButton } from "~/components/copy-button";
import { PageShell, ResponsiveContainer } from "~/components/page-shell";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { publicUrl } from "~/lib/config.server";
import { engine } from "~/lib/engine.server";
import { clientIpFrom } from "~/lib/load-context.server";
import { createRateLimiter } from "~/lib/rate-limit.server";
import type { Route } from "./+types/_index";

// Single source of truth for the shorten-path rate limit, consumed by the
// limiter config below, the 429's Retry-After header, and the e2e tests
// (previously the "10 requests" / "60 seconds" figures were repeated as
// literals in three places, which could silently drift out of sync).
export const SHORTEN_RATE_LIMIT = {
  requestsPerWindow: 10,
  windowSeconds: 60,
} as const;

// Shorten-path-only, per-IP token bucket. Instantiated once at module scope
// so state persists across requests within this process — see design.md
// (LOCKED decision: redirect path is never rate-limited).
const shortenRateLimiter = createRateLimiter({
  capacity: SHORTEN_RATE_LIMIT.requestsPerWindow,
  refillPerSec:
    SHORTEN_RATE_LIMIT.requestsPerWindow / SHORTEN_RATE_LIMIT.windowSeconds,
});

const shortenSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .url("Please enter a valid URL")
    .refine(
      (value) => {
        try {
          return ["http:", "https:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      },
      { message: "Only http:// and https:// URLs are allowed" },
    ),
});

export function loader() {
  return {
    baseUrl: publicUrl ? `${publicUrl}/s/` : "-",
  };
}

// React Router only merges a route's own headers() export into the
// full-document response; it does NOT forward data()'s per-response
// `headers` option automatically for document (non-fetcher) requests. This
// is required for the 429's `Retry-After` header (set in `action` below) to
// actually reach the client.
export const headers: Route.HeadersFunction = ({ actionHeaders }) =>
  actionHeaders;

export async function action({ request, context }: Route.ActionArgs) {
  const { ip: clientIp, failOpen } = clientIpFrom(context);

  // A request whose IP couldn't be resolved bypasses the limiter (see
  // load-context.server.ts) rather than sharing a fabricated bucket key
  // with unrelated clients.
  if (!failOpen && !shortenRateLimiter.take(clientIp as string)) {
    console.warn("rate limit exceeded", {
      ip: clientIp,
      route: "/ (shorten)",
    });
    return data(
      { error: "Too many requests, please try again in a minute" },
      {
        status: 429,
        headers: { "Retry-After": String(SHORTEN_RATE_LIMIT.windowSeconds) },
      },
    );
  }

  const formData = await request.formData();
  const parsed = shortenSchema.safeParse({ url: formData.get("url") });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "URL is required";
    return data({ error: message }, { status: 400 });
  }

  try {
    const shortenedUrl = await engine.shortenUrl(parsed.data.url);
    return {
      shortenedUrl: `${publicUrl}/s/${shortenedUrl.code}`,
    };
  } catch (error) {
    if (error instanceof BlockedHostError) {
      console.warn("blocked host rejected", {
        ip: clientIp,
        route: "/ (shorten)",
      });
      return data({ error: "Please enter a valid URL" }, { status: 400 });
    }
    if (error instanceof InvalidUrlError) {
      return data({ error: "Please enter a valid URL" }, { status: 400 });
    }
    if (error instanceof CodeGenerationExhaustedError) {
      return data(
        { error: "Unable to generate a short code right now, please retry" },
        { status: 503 },
      );
    }
    throw error;
  }
}

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "URL Shortener" },
    { name: "description", content: "Shorten your URLs quickly and easily" },
  ];
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { baseUrl } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const errorMessage =
    actionData && "error" in actionData ? actionData.error : null;
  const shortenedUrl =
    actionData && "shortenedUrl" in actionData ? actionData.shortenedUrl : null;

  return (
    <PageShell>
      <ResponsiveContainer className="flex items-center justify-end">
        <ThemeToggle />
      </ResponsiveContainer>

      <Card className="w-full max-w-md sm:max-w-xl md:max-w-2xl">
        <CardHeader>
          <CardTitle>URL Shortener</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:gap-6">
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="url">URL to shorten</Label>
              <Input
                id="url"
                type="text"
                name="url"
                placeholder="https://example.com/very/long/url"
                required
              />
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Shortening..." : "Shorten URL"}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              Your shortened URL will start with {baseUrl}
            </p>
          </Form>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            >
              {errorMessage}
            </div>
          )}

          {shortenedUrl && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Your shortened URL:
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={shortenedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono text-sm text-primary underline"
                >
                  {shortenedUrl}
                </a>
                <CopyButton value={shortenedUrl} />
              </div>
            </div>
          )}

          <Link
            to="/urls"
            className="text-sm text-primary underline text-center"
          >
            View all shortened URLs
          </Link>
        </CardContent>
      </Card>
    </PageShell>
  );
}
