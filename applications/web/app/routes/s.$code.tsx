import { UrlNotFoundError } from "@url-shortener/engine";
import { data, redirect } from "react-router";
import { engine } from "~/lib/engine.server";
import type { Route } from "./+types/s.$code";

export async function loader({ params }: Route.LoaderArgs) {
  const { code } = params;

  try {
    const shortenedUrl = await engine.resolveUrl(code);
    const response = redirect(shortenedUrl.longUrl);

    // Best-effort, non-blocking: the redirect above is the critical path and
    // must never be delayed or broken by a stats-recording failure.
    void engine.recordClick(code).catch((error: unknown) => {
      console.error(`Failed to record click for code "${code}":`, error);
    });

    return response;
  } catch (error) {
    if (error instanceof UrlNotFoundError) {
      throw data("Not Found", { status: 404 });
    }
    throw error;
  }
}
