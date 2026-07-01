import {
  BlockedHostError,
  baseUrl,
  CodeGenerationExhaustedError,
  InvalidUrlError,
} from "@url-shortener/engine";
import { data, Form, useActionData } from "react-router";
import { z } from "zod";
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
    baseUrl: baseUrl ? `${baseUrl}/s/` : "-",
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
      shortenedUrl: `${baseUrl}/s/${shortenedUrl.code}`,
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

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-lime-400 via-pink-500 to-cyan-300">
      <div className="bg-yellow-300 p-12 rounded-none border-8 border-dashed border-purple-600 w-full max-w-lg rotate-1 shadow-2xl shadow-red-500">
        <h1 className="text-4xl font-mono italic text-center mb-8 text-fuchsia-600 underline decoration-wavy decoration-green-500 tracking-widest">
          ~*~ URL Shortener ~*~
        </h1>

        <Form method="post" className="flex flex-col gap-6">
          <input
            type="text"
            name="url"
            placeholder="Enter your URL here..."
            required
            className="w-full px-4 py-3 text-base bg-orange-200 border-4 border-blue-600 text-purple-800 placeholder-red-400 rounded focus:outline-none"
          />

          <div>
            <button
              type="submit"
              className="w-full px-4 py-3 text-base bg-red-500 hover:bg-lime-500 text-yellow-200 border-4 border-teal-400 rounded-full skew-x-3 cursor-pointer"
            >
              ★ SHORTEN IT ★
            </button>
            <p className="text-sm text-indigo-800 mt-3 text-center font-bold bg-cyan-200 p-2 border-2 border-dotted border-orange-500">
              Your shortened URL will start with {baseUrl}
            </p>
          </div>
        </Form>

        {actionData && "shortenedUrl" in actionData && (
          <div className="mt-8 p-4 bg-violet-400 rounded-3xl border-4 border-double border-yellow-500 -rotate-1">
            <p className="text-lg text-lime-300 mb-2 font-black uppercase">
              Your shortened URL:
            </p>
            <a
              href={actionData.shortenedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-200 break-all font-mono text-xl hover:text-blue-900 bg-pink-600 p-2 block"
            >
              {actionData.shortenedUrl}
            </a>
          </div>
        )}

        {actionData && "error" in actionData && (
          <div className="mt-8 p-4 bg-lime-500 rounded-none border-8 border-solid border-red-700">
            <p className="text-2xl text-blue-800 font-black">
              {actionData.error}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
