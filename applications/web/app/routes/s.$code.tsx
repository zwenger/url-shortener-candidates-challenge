import { UrlNotFoundError } from "@url-shortener/engine";
import { data, redirect } from "react-router";
import { engine } from "~/lib/engine.server";
import type { Route } from "./+types/s.$code";

export async function loader({ params }: Route.LoaderArgs) {
  const { code } = params;

  try {
    const shortenedUrl = await engine.resolveUrl(code);
    return redirect(shortenedUrl.longUrl);
  } catch (error) {
    if (error instanceof UrlNotFoundError) {
      throw data("Not Found", { status: 404 });
    }
    throw error;
  }
}
